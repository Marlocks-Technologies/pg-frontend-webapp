'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import {
  ApiError,
  chatQuery,
  generateDocument,
  getChatHistory,
  Citation,
  GeneratedArtifact,
  GenerateDocumentOptions,
  ResearchPlan,
  WebSource,
} from './api';
import {
  cancelResearchJob,
  dropSessionJobs,
  markResearchSeen,
  submitResearchJob,
  type ResearchEvent,
  type ResearchJobRecord,
} from './researchJobs';
import { useResearchJobs } from './useResearchJobs';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Citation[];
  artifact?: GeneratedArtifact;
  /** Set if the post-answer document generation call failed; the answer text stands regardless. */
  artifactError?: string;
  /** True while downloadAnswerAsDocument's generateDocument call is in flight. */
  isGeneratingArtifact?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
  chunksRetrieved?: number;
  /** Verified web authorities, present only on async legal-research answers. */
  webSources?: WebSource[];
  researchPlan?: ResearchPlan;
  /** Live progress label while an async research job is running. */
  researchStatus?: string;
  /** Set once an answer came back through the async research path. */
  isResearch?: boolean;
  /** Links this message to its record in the research registry. */
  researchJobId?: string;
  /** Present while the user is being asked whether to run deep research. */
  researchPrompt?: { question: string; canAnswerNow: boolean };
  /**
   * The format/style the user asked for in Generate mode when the request
   * turned out to need research instead. Carried through the research job
   * so the completed opinion can at least say what styled download was
   * wanted — the render itself is blocked on a backend change (see
   * docs/BACKEND_ASK-styled-document-from-content.md).
   */
  pendingGenerate?: GenerateDocumentOptions;
}

export interface Session {
  id: string;
  title: string;
  createdAt: Date;
  lastMessageAt: Date;
  messages: Message[];
  messageCount: number;
  historyLoaded: boolean;
}

// ─── Serialisation helpers (localStorage stores plain JSON) ───────────────────

function serialiseSession(s: Session): unknown {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    lastMessageAt: s.lastMessageAt.toISOString(),
    messages: s.messages.map(m => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
      // Never persist in-flight state
      isStreaming: false,
      researchStatus: undefined,
      isGeneratingArtifact: false,
    })),
  };
}

function deserialiseSession(raw: Record<string, unknown>): Session {
  return {
    ...(raw as Omit<Session, 'createdAt' | 'lastMessageAt' | 'messages'>),
    createdAt: new Date(raw.createdAt as string),
    lastMessageAt: new Date(raw.lastMessageAt as string),
    historyLoaded: true, // treat restored sessions as already loaded
    messages: ((raw.messages as Record<string, unknown>[]) ?? []).map(m => ({
      ...(m as Omit<Message, 'timestamp'>),
      timestamp: new Date(m.timestamp as string),
    })),
  };
}

const STORAGE_KEY = 'pg-chat-sessions';
const THEME_KEY   = 'pg-chat-theme';

function loadSessions(): Session[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map(deserialiseSession);
  } catch {
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.map(serialiseSession)));
  } catch {
    // Quota exceeded — silently skip
  }
}

function loadTheme(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved !== null ? saved === 'dark' : true;
  } catch {
    return true;
  }
}

function saveTheme(isDark: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  } catch {}
}

// ─── State & Reducer ──────────────────────────────────────────────────────────

interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  queryingSessions: Record<string, boolean>;
  isDark: boolean;
  isSidebarOpen: boolean;
  isHydrated: boolean;
  researchJobs: ResearchJobRecord[];
}

type Action =
  | { type: 'HYDRATE'; payload: { sessions: Session[]; isDark: boolean } }
  | { type: 'TOGGLE_DARK' }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR'; payload: boolean }
  | { type: 'NEW_SESSION'; payload: Session }
  | { type: 'SET_ACTIVE'; payload: string }
  | { type: 'SET_SESSION_TITLE'; payload: { id: string; title: string } }
  | { type: 'ADD_MESSAGE'; payload: { sessionId: string; message: Message } }
  | { type: 'PATCH_MESSAGE'; payload: { sessionId: string; messageId: string; patch: Partial<Message> } }
  | { type: 'SET_QUERYING'; payload: { sessionId: string; value: boolean } }
  | { type: 'LOAD_HISTORY'; payload: { sessionId: string; messages: Message[] } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'RECONCILE_RESEARCH_JOBS'; payload: ResearchJobRecord[] };

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {

    case 'HYDRATE':
      return {
        ...state,
        sessions: action.payload.sessions,
        isDark: action.payload.isDark,
        activeSessionId: action.payload.sessions[0]?.id ?? null,
        isHydrated: true,
      };

    // The registry is the source of truth for which jobs are actually live.
    // Every route that can make a message's researchJobId dangle — orphan
    // eviction, 7-day expiry, a cross-tab cancel/delete, a resume that finds
    // nothing to resume — funnels through the same 'changed' event that
    // carries this list. Reconciling here, in one place, closes all of them
    // at once instead of chasing each route's own termination path.
    case 'RECONCILE_RESEARCH_JOBS': {
      const liveIds = new Set(action.payload.map(j => j.jobId));
      let changed = false;
      const sessions = state.sessions.map(s => {
        let sessionChanged = false;
        const messages = s.messages.map(m => {
          // Only reap a message that is still silently waiting (no content
          // yet) on a job the registry no longer has. Deliberately NOT
          // gated on m.isStreaming: serialiseSession forces isStreaming to
          // false on every save so a reload never freezes on a stale
          // spinner, which means a second tab hydrating from localStorage
          // sees isStreaming: false on a message that is, in every way that
          // matters, still waiting — the empty content plus a still-set
          // researchJobId are the only signals that survive a fresh
          // cross-tab hydration. A message that already has content — a
          // completed answer whose record was later reaped by
          // markResearchSeen, for instance — is correct as it stands and
          // must not be overwritten.
          if (m.researchJobId && !liveIds.has(m.researchJobId) && !m.content) {
            sessionChanged = true;
            return {
              ...m,
              researchJobId: undefined,
              isStreaming: false,
              // Deliberately neutral: this same path covers cancellation
              // from another tab, expiry, and eviction alike, and the store
              // has no way to tell which one happened.
              content: '*Research ended.*',
            };
          }
          return m;
        });
        if (sessionChanged) { changed = true; return { ...s, messages }; }
        return s;
      });
      return {
        ...state,
        researchJobs: action.payload,
        sessions: changed ? sessions : state.sessions,
      };
    }

    case 'TOGGLE_DARK':
      return { ...state, isDark: !state.isDark };

    case 'TOGGLE_SIDEBAR':
      return { ...state, isSidebarOpen: !state.isSidebarOpen };

    case 'SET_SIDEBAR':
      return { ...state, isSidebarOpen: action.payload };

    case 'NEW_SESSION':
      return {
        ...state,
        sessions: [action.payload, ...state.sessions],
        activeSessionId: action.payload.id,
      };

    case 'SET_ACTIVE':
      return { ...state, activeSessionId: action.payload };

    case 'SET_SESSION_TITLE':
      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === action.payload.id ? { ...s, title: action.payload.title } : s
        ),
      };

    case 'ADD_MESSAGE':
      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                messages: [...s.messages, action.payload.message],
                lastMessageAt: new Date(),
                messageCount: s.messageCount + 1,
              }
            : s
        ),
      };

    case 'PATCH_MESSAGE':
      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                messages: s.messages.map(m =>
                  m.id === action.payload.messageId ? { ...m, ...action.payload.patch } : m
                ),
              }
            : s
        ),
      };

    case 'SET_QUERYING': {
      const next = { ...state.queryingSessions };
      if (action.payload.value) next[action.payload.sessionId] = true;
      else delete next[action.payload.sessionId];
      return { ...state, queryingSessions: next };
    }

    case 'LOAD_HISTORY':
      return {
        ...state,
        sessions: state.sessions.map(s =>
          s.id === action.payload.sessionId
            ? { ...s, messages: action.payload.messages, historyLoaded: true }
            : s
        ),
      };

    case 'DELETE_SESSION': {
      const remaining = state.sessions.filter(s => s.id !== action.payload);
      return {
        ...state,
        sessions: remaining,
        activeSessionId:
          state.activeSessionId === action.payload
            ? (remaining[0]?.id ?? null)
            : state.activeSessionId,
      };
    }

    default:
      return state;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _counter = 0;
function uid() { return `${Date.now()}-${++_counter}`; }
function makeSessionId() { return `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function titleFromQuestion(q: string, max = 44) {
  const clean = q.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ChatContextValue {
  state: ChatState;
  activeSession: Session | null;
  sendMessage: (
    question: string,
    options?: { generateDocument?: GenerateDocumentOptions }
  ) => Promise<void>;
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  toggleDark: () => void;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
  isSessionQuerying: (sessionId: string | null) => boolean;
  runResearch: (sessionId: string, messageId: string, question: string) => Promise<void>;
  startResearch: (question: string) => Promise<void>;
  answerWithoutResearch: (sessionId: string, messageId: string, question: string) => Promise<void>;
  dismissResearch: (sessionId: string, messageId: string) => void;
  cancelResearch: (sessionId: string, messageId: string, jobId: string) => void;
  downloadAnswerAsDocument: (
    sessionId: string,
    messageId: string,
    opts: { format?: string; referenceDocumentId?: string; mode?: DocumentRenderMode }
  ) => Promise<void>;
}

const Ctx = createContext<ChatContextValue | null>(null);

const CHAR_DELAY = 6; // ms per tick — lower = faster
// A verified legal opinion runs to tens of thousands of characters. At a fixed
// 3-char step that would take most of a minute to reveal, so the step scales
// with length to keep any answer inside this budget.
const MAX_TYPEWRITE_MS = 6_000;

// ─── Rendering a finished answer into a document ──────────────────────────────
//
// Preferred path: `content` mode on /documents/generate, which skips retrieval
// and the model entirely and lays the supplied Markdown out as-is. The document
// then IS the answer rather than a fresh derivation of it, and it accepts up to
// 500,000 characters.
//
// Fallback: older deployments only accept `prompt` and plan the document
// through their own RAG pipeline. Wrapping the finished answer in an explicit
// reproduction instruction gives that planner the real content to lay out
// instead of re-deriving it — the planning system prompt already forbids
// inventing facts. Lower fidelity and a far tighter cap, so it is only used
// when the backend rejects content mode.
const FAITHFUL_RENDER_PREFIX = `Reproduce the following text faithfully as a formal document. It is a finished
piece of work: do not summarise it, do not omit any part of it, do not add new
facts, citations, authorities or commentary, and do not soften or restate its
conclusions. Preserve every heading, citation, case name, statutory reference
and quotation exactly as written. Your only job is to lay this content out as a
well-structured document.

---
`;

// Adapted mode deliberately goes the other way: it asks the planner to rewrite
// the answer into the reference document's conventions. _planning_prompt already
// carries that document's extracted structure_outline, so the model is writing
// to a real house skeleton rather than inventing one. The trade is that a model
// touches finished text — fine for a draft the user wants in firm form, not for
// an opinion they need unchanged, which is why the user picks.
const ADAPT_TO_HOUSE_STYLE_PREFIX = `Rewrite the following finished text as a formal document that follows this
organisation's house conventions: its section order, its heading names, and the
way it presents authorities, assumptions and conclusions.

You may reorganise sections, retitle them, and adjust phrasing so the document
reads consistently with those conventions. You must not change the substance:
do not add or remove any authority, citation, fact, figure or caveat, and do not
alter, strengthen or soften any conclusion.

---
`;

/** Content mode's ceiling. Enforced server-side; checked here to fail fast. */
const DOCUMENT_CONTENT_CHAR_CAP = 500_000;

/** Prompt mode's ceiling — applies to adapted mode and the legacy fallback. */
const DOCUMENT_PROMPT_CHAR_CAP = 12_000;

/**
 * `faithful` renders the answer exactly as written, styled by the template.
 * `adapted` lets the planner restructure it into the template's house style.
 */
export type DocumentRenderMode = 'faithful' | 'adapted';

function buildFaithfulRenderPrompt(content: string): string {
  return `${FAITHFUL_RENDER_PREFIX}${content}`;
}

function buildAdaptedPrompt(content: string): string {
  return `${ADAPT_TO_HOUSE_STYLE_PREFIX}${content}`;
}

/**
 * True when the backend rejected `content` because it predates content mode.
 * That deployment demands `prompt`, so the caller can retry the older way.
 */
function isPreContentModeRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 400 &&
    /required field:\s*prompt/i.test(String(error.message))
  );
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    sessions: [],
    activeSessionId: null,
    queryingSessions: {},
    isDark: true,
    isSidebarOpen: true,
    isHydrated: false,
    researchJobs: [],
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTypeRef = useRef<{
    sessionId: string; messageId: string; fullText: string; onComplete?: () => void;
  } | null>(null);

  // ── Hydrate from localStorage on mount ────────────────────────────────────
  useEffect(() => {
    dispatch({
      type: 'HYDRATE',
      payload: { sessions: loadSessions(), isDark: loadTheme() },
    });
  }, []);

  // ── Persist sessions whenever they change ─────────────────────────────────
  useEffect(() => {
    // Only save sessions that have messages (skip blank "New conversation" shells)
    const toSave = state.sessions.filter(s => s.messageCount > 0);
    saveSessions(toSave);
  }, [state.sessions]);

  // ── Persist theme whenever it changes ─────────────────────────────────────
  useEffect(() => {
    saveTheme(state.isDark);
    document.documentElement.classList.toggle('dark', state.isDark);
  }, [state.isDark]);

  const activeSession = state.sessions.find(s => s.id === state.activeSessionId) ?? null;

  // ── Create session ─────────────────────────────────────────────────────────
  const createSession = useCallback(() => {
    dispatch({
      type: 'NEW_SESSION',
      payload: {
        id: makeSessionId(),
        title: 'New conversation',
        createdAt: new Date(),
        lastMessageAt: new Date(),
        messages: [],
        messageCount: 0,
        historyLoaded: false,
      },
    });
  }, []);

  // ── Delete session ─────────────────────────────────────────────────────────
  const deleteSession = useCallback((id: string) => {
    dropSessionJobs(id);
    dispatch({ type: 'DELETE_SESSION', payload: id });
  }, []);

  // ── Switch session + lazy-load history ────────────────────────────────────
  const switchSession = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_ACTIVE', payload: id });
      markResearchSeen(id);
      const session = state.sessions.find(s => s.id === id);
      if (!session || session.historyLoaded || session.messages.length > 0) return;

      try {
        const history = await getChatHistory(id);
        if (history.messages?.length) {
          dispatch({
            type: 'LOAD_HISTORY',
            payload: {
              sessionId: id,
              messages: history.messages.map(m => ({
                id: uid(),
                role: m.role,
                content: m.content,
                timestamp: new Date(m.timestamp),
                citations: m.metadata?.citations,
                chunksRetrieved: m.metadata?.chunks_retrieved,
              })),
            },
          });
        }
      } catch {
        // History unavailable — silently continue
      }
    },
    [state.sessions]
  );

  // ── Typewriter effect ──────────────────────────────────────────────────────
  const typewrite = useCallback(
    (sessionId: string, messageId: string, fullText: string, onComplete?: () => void) => {
      const previous = activeTypeRef.current;

      // A duplicate call for the message already in flight (e.g. a completion
      // event firing twice) is a no-op: leave its running interval alone
      // rather than blanking it back to an empty string and retyping.
      if (previous && previous.messageId === messageId) {
        return;
      }

      // Never strand a half-typed message: an interrupted one jumps straight
      // to its end by running its own onComplete, so it keeps whatever
      // citations, artifact, or web sources that completion would have
      // attached — the same payload it would have gotten by finishing
      // naturally. Fall back to a content-only snap if there is none.
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        if (previous && previous.messageId !== messageId) {
          if (previous.onComplete) {
            previous.onComplete();
          } else {
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId: previous.sessionId,
                messageId: previous.messageId,
                patch: { content: previous.fullText, isStreaming: false },
              },
            });
          }
        }
      }

      activeTypeRef.current = { sessionId, messageId, fullText, onComplete };

      let i = 0;
      const step = Math.max(3, Math.ceil(fullText.length / (MAX_TYPEWRITE_MS / CHAR_DELAY)));
      timerRef.current = setInterval(() => {
        i = Math.min(i + step, fullText.length);
        const done = i >= fullText.length;
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId,
            messageId,
            patch: { content: fullText.slice(0, i), isStreaming: !done },
          },
        });
        if (done) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          activeTypeRef.current = null;
          onComplete?.();
        }
      }, CHAR_DELAY);
    },
    []
  );

  // ── Async legal research ───────────────────────────────────────────────────
  // The backend answers authority-heavy questions with 409 researchRequired
  // rather than risking API Gateway's sync timeout. The registry owns the
  // submit/poll/resume lifecycle so the job survives a refresh; here we just
  // fold its events into the message that asked.
  const sessionIds = useMemo(() => state.sessions.map(s => s.id), [state.sessions]);

  useResearchJobs({
    isHydrated: state.isHydrated,
    sessionIds,
    onEvent: useCallback((event: ResearchEvent) => {
      if (event.kind === 'changed') {
        dispatch({ type: 'RECONCILE_RESEARCH_JOBS', payload: event.jobs });
        return;
      }
      const { job, result } = event;
      typewrite(job.sessionId, job.messageId, result.answer, () => {
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId: job.sessionId,
            messageId: job.messageId,
            patch: {
              content: result.answer,
              citations: result.citations,
              webSources: result.webSources,
              researchPlan: result.researchPlan,
              chunksRetrieved: result.metadata?.chunks_retrieved,
              researchStatus: undefined,
              isStreaming: false,
            },
          },
        });
      });
    }, [typewrite]),
  });

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (question: string, options?: { generateDocument?: GenerateDocumentOptions }) => {
      if (!question.trim()) return;

      let sessionId = state.activeSessionId;

      if (!sessionId) {
        const id = makeSessionId();
        dispatch({
          type: 'NEW_SESSION',
          payload: {
            id,
            title: titleFromQuestion(question),
            createdAt: new Date(),
            lastMessageAt: new Date(),
            messages: [],
            messageCount: 0,
            historyLoaded: false,
          },
        });
        sessionId = id;
      } else {
        const session = state.sessions.find(s => s.id === sessionId);
        if (session && session.messageCount === 0) {
          dispatch({ type: 'SET_SESSION_TITLE', payload: { id: sessionId, title: titleFromQuestion(question) } });
        }
      }

      // Add user bubble
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          sessionId,
          message: { id: uid(), role: 'user', content: question, timestamp: new Date() },
        },
      });

      // Add thinking placeholder
      const placeholderId = uid();
      dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          sessionId,
          message: { id: placeholderId, role: 'assistant', content: '', timestamp: new Date(), isStreaming: true },
        },
      });

      dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: true } });

      // Generate mode never sends generateDocument on this first call. The
      // backend's own precedence bug makes explicit_generation win over
      // advanced_research unconditionally, so a request carrying
      // generateDocument can never get the 409 that routes an authority-heavy
      // prompt to async research — it just runs synchronous RAG generation
      // until API Gateway's 29s ceiling kills it. Splitting into two calls
      // lets the backend's research heuristic run first, on a request it can
      // actually 409 on. See docs/BACKEND_ASK-styled-document-from-content.md.
      const generateOptions = options?.generateDocument;

      try {
        const isFollowUp = (state.sessions.find(s => s.id === sessionId)?.messageCount ?? 0) > 1;
        const useHistory = isFollowUp ? { useHistory: true } : {};

        const resp = generateOptions
          ? question.length > 1000
            // Over the sync cap even with generation off — force research
            // explicitly rather than let the cap reject it as too long.
            ? await chatQuery({ question, sessionId, research: true, ...useHistory })
            // Under the cap — ask normally, with the backend's own
            // auto-generation suppressed, so a plain 409/200 answer comes
            // back and we attach the styled document ourselves afterwards.
            : await chatQuery({ question, sessionId, autoGenerateDocument: false, ...useHistory })
          : await chatQuery({ question, sessionId, ...useHistory });

        dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });

        typewrite(sessionId, placeholderId, resp.answer, () => {
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId: sessionId!,
              messageId: placeholderId,
              patch: {
                content: resp.answer,
                citations: resp.citations,
                chunksRetrieved: resp.metadata?.chunks_retrieved ?? resp.metadata?.chunksRetrieved,
                artifact: resp.artifact,
                isStreaming: false,
              },
            },
          });
        });

        // The answer came back synchronously and the user asked for a
        // styled document — fetch it as a second call, independent of the
        // typewriter animation, and attach it to the same message when it
        // resolves. A failure here must not touch the answer already shown.
        if (generateOptions) {
          try {
            const genResp = await generateDocument({
              prompt: question,
              sessionId: sessionId!,
              ...generateOptions,
            });
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId: sessionId!,
                messageId: placeholderId,
                patch: { artifact: genResp.artifact },
              },
            });
          } catch (genErr: unknown) {
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId: sessionId!,
                messageId: placeholderId,
                patch: {
                  artifactError: genErr instanceof Error
                    ? genErr.message
                    : 'Document generation failed.',
                },
              },
            });
          }
        }
      } catch (err: unknown) {
        // Authority-heavy question — hand off to the persistent registry so
        // the job survives even if this tab reloads.
        if (err instanceof ApiError && err.researchRequired) {
          dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId, messageId: placeholderId,
              patch: {
                isStreaming: false,
                researchPrompt: { question, canAnswerNow: question.length <= 1000 },
                ...(generateOptions ? { pendingGenerate: generateOptions } : {}),
              },
            },
          });
          return;
        }

        dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId,
            messageId: placeholderId,
            patch: {
              content: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
              isStreaming: false,
              isError: true,
            },
          },
        });
      }
    },
    [state.activeSessionId, state.sessions, typewrite]
  );

  // ── Deep research consent actions ──────────────────────────────────────────
  const runResearch = useCallback(async (sessionId: string, messageId: string, question: string) => {
    // A template chosen before the question routed to research shapes how the
    // opinion is WRITTEN, not just how it is later rendered — so it has to
    // travel with the job rather than waiting for the download.
    const referenceDocumentId = state.sessions
      .find(s => s.id === sessionId)
      ?.messages.find(m => m.id === messageId)
      ?.pendingGenerate?.referenceDocumentId;

    dispatch({
      type: 'PATCH_MESSAGE',
      payload: { sessionId, messageId, patch: { researchPrompt: undefined, isStreaming: true } },
    });
    try {
      const job = await submitResearchJob({
        sessionId,
        messageId,
        question,
        ...(referenceDocumentId ? { referenceDocumentId } : {}),
      });
      dispatch({
        type: 'PATCH_MESSAGE',
        payload: { sessionId, messageId, patch: { researchJobId: job.jobId, isResearch: true } },
      });
    } catch (error: unknown) {
      dispatch({
        type: 'PATCH_MESSAGE',
        payload: {
          sessionId, messageId,
          patch: {
            content: error instanceof Error ? error.message : 'Deep research could not be started.',
            isStreaming: false,
            isError: true,
          },
        },
      });
    }
    // Reads state.sessions to find the message's pendingGenerate template, so
    // it must not close over a stale sessions array.
  }, [state.sessions]);

  // Skips the /chat/query round trip entirely: the user asked for depth
  // directly, so there is no heuristic to consult and nothing to 409 on.
  const startResearch = useCallback(async (question: string) => {
    if (!question.trim()) return;

    let sessionId = state.activeSessionId;
    if (!sessionId) {
      const id = makeSessionId();
      dispatch({
        type: 'NEW_SESSION',
        payload: {
          id, title: titleFromQuestion(question),
          createdAt: new Date(), lastMessageAt: new Date(),
          messages: [], messageCount: 0, historyLoaded: false,
        },
      });
      sessionId = id;
    } else {
      const session = state.sessions.find(s => s.id === sessionId);
      if (session && session.messageCount === 0) {
        dispatch({ type: 'SET_SESSION_TITLE', payload: { id: sessionId, title: titleFromQuestion(question) } });
      }
    }

    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        sessionId,
        message: { id: uid(), role: 'user', content: question, timestamp: new Date() },
      },
    });

    const placeholderId = uid();
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        sessionId,
        message: {
          id: placeholderId, role: 'assistant', content: '',
          timestamp: new Date(), isStreaming: true,
        },
      },
    });

    await runResearch(sessionId, placeholderId, question);
  }, [state.activeSessionId, state.sessions, runResearch]);

  const answerWithoutResearch = useCallback(
    async (sessionId: string, messageId: string, question: string) => {
      dispatch({
        type: 'PATCH_MESSAGE',
        payload: {
          sessionId, messageId,
          // pendingGenerate cleared: this answer skips research entirely, so
          // there is no completed opinion for a styled download to attach to.
          patch: { researchPrompt: undefined, pendingGenerate: undefined, isStreaming: true },
        },
      });
      dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: true } });
      try {
        // Mirror sendMessage's own follow-up rule (prior messageCount > 1),
        // adjusted for timing: by the time this runs, the question and its
        // placeholder are already in the session, so the placeholder's own
        // position stands in for the messageCount sendMessage would have
        // seen before adding this exchange.
        const messages = state.sessions.find(s => s.id === sessionId)?.messages ?? [];
        const messageIndex = messages.findIndex(m => m.id === messageId);
        const isFollowUp = messageIndex > 2;

        const resp = await chatQuery({
          question,
          sessionId,
          autoResearch: false,
          ...(isFollowUp ? { useHistory: true } : {}),
        });
        dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
        typewrite(sessionId, messageId, resp.answer, () => {
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId, messageId,
              patch: {
                content: resp.answer,
                citations: resp.citations,
                chunksRetrieved: resp.metadata?.chunks_retrieved ?? resp.metadata?.chunksRetrieved,
                isStreaming: false,
              },
            },
          });
        });
      } catch (error: unknown) {
        dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId, messageId,
            patch: {
              content: error instanceof Error ? error.message : 'Something went wrong.',
              isStreaming: false,
              isError: true,
            },
          },
        });
      }
    },
    [state.sessions, typewrite]
  );

  const dismissResearch = useCallback((sessionId: string, messageId: string) => {
    dispatch({
      type: 'PATCH_MESSAGE',
      payload: {
        sessionId, messageId,
        // pendingGenerate cleared: research was declined outright, so there
        // is no completed opinion for a styled download to attach to.
        patch: {
          researchPrompt: undefined, pendingGenerate: undefined,
          isStreaming: false, content: '*Deep research not run.*',
        },
      },
    });
  }, []);

  // Cancel is the one termination path that must not leave the message in
  // limbo: the job record disappears, so the message itself needs to carry
  // a stable terminal state or it falls back to unlabeled thinking dots
  // forever (and that survives a reload, since sessions persist).
  const cancelResearch = useCallback((sessionId: string, messageId: string, jobId: string) => {
    cancelResearchJob(jobId);
    dispatch({
      type: 'PATCH_MESSAGE',
      payload: {
        sessionId, messageId,
        // pendingGenerate cleared: the job was cancelled before producing an
        // opinion, so there is nothing for a styled download to attach to.
        patch: {
          researchJobId: undefined, pendingGenerate: undefined,
          isStreaming: false, content: '*Research cancelled.*',
        },
      },
    });
  }, []);

  // ── Render an existing answer into a styled document ──────────────────────
  // Works for any completed answer — ordinary chat or a verified research
  // opinion. The answer's own `content` is the source of truth; we never
  // re-derive it from the original question.
  const downloadAnswerAsDocument = useCallback(
    async (
      sessionId: string,
      messageId: string,
      opts: { format?: string; referenceDocumentId?: string; mode?: DocumentRenderMode }
    ) => {
      const message = state.sessions
        .find(s => s.id === sessionId)
        ?.messages.find(m => m.id === messageId);
      if (!message || !message.content) return;

      const adapted = opts.mode === 'adapted';

      const tooLong = (cap: number, used: number): string =>
        `This answer is too long to render into a document — it is ` +
        `${(used - cap).toLocaleString()} character${used - cap === 1 ? '' : 's'} over the ` +
        `${cap.toLocaleString()}-character limit the document service accepts. Shortening ` +
        `the answer isn't something we're willing to do silently, so this download can't ` +
        `proceed as-is.`;

      // Adapted mode goes through the planner, so it inherits prompt mode's far
      // tighter ceiling rather than content mode's.
      const cap = adapted ? DOCUMENT_PROMPT_CHAR_CAP : DOCUMENT_CONTENT_CHAR_CAP;
      const used = adapted
        ? ADAPT_TO_HOUSE_STYLE_PREFIX.length + message.content.length
        : message.content.length;

      if (used > cap) {
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId,
            messageId,
            patch: {
              isGeneratingArtifact: false,
              artifactError: adapted
                ? tooLong(cap, used) +
                  ` Downloading it as written, rather than adapted to the house style, ` +
                  `raises the limit to ${DOCUMENT_CONTENT_CHAR_CAP.toLocaleString()} characters.`
                : tooLong(cap, used),
            },
          },
        });
        return;
      }

      dispatch({
        type: 'PATCH_MESSAGE',
        payload: {
          sessionId,
          messageId,
          patch: { isGeneratingArtifact: true, artifactError: undefined },
        },
      });

      const shared = {
        sessionId,
        ...(opts.format ? { format: opts.format } : {}),
        ...(opts.referenceDocumentId ? { referenceDocumentId: opts.referenceDocumentId } : {}),
      };

      // The planner can fail and fall back to building a document from
      // retrieved chunks, which discards the answer entirely — verified in
      // production, producing a document with none of the opinion's
      // authorities in it. Never hand that to the user as their answer.
      const CONTENT_LOSING_MODES = ['extractive_fallback'];

      // Derive a title so the filename comes from the answer rather than from
      // the instruction wrapper — without this, adapted downloads are named
      // "Rewrite-The-Following-Finished-Text-As-A-Formal-Document...".
      const headingMatch = message.content.match(/^#{1,3}\s+(.+)$/m);
      const derivedTitle = (headingMatch?.[1] ?? message.content)
        .replace(/[*_`#]/g, '')
        .trim()
        .slice(0, 120);

      try {
        let resp;
        try {
          resp = adapted
            // Planner rewrites into the reference document's house structure.
            ? await generateDocument({
                ...shared,
                title: derivedTitle,
                prompt: buildAdaptedPrompt(message.content),
                topK: 1,
              })
            // Content mode: the document is the answer, laid out as-is.
            : await generateDocument({ ...shared, title: derivedTitle, content: message.content });
        } catch (error: unknown) {
          // Adapted mode already uses `prompt`, so this rejection can only
          // reach the faithful path on a pre-content-mode deployment.
          if (adapted || !isPreContentModeRejection(error)) throw error;

          // Older deployment — only `prompt` is accepted, and its cap is far
          // tighter, so an answer that fits content mode may not fit this.
          const promptLength = FAITHFUL_RENDER_PREFIX.length + message.content.length;
          if (promptLength > DOCUMENT_PROMPT_CHAR_CAP) {
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId,
                messageId,
                patch: {
                  isGeneratingArtifact: false,
                  artifactError: tooLong(DOCUMENT_PROMPT_CHAR_CAP, promptLength),
                },
              },
            });
            return;
          }
          resp = await generateDocument({
            ...shared,
            title: derivedTitle,
            prompt: buildFaithfulRenderPrompt(message.content),
            topK: 1,
          });
        }

        const producedMode = resp.metadata?.generationMode;
        if (producedMode && CONTENT_LOSING_MODES.includes(producedMode)) {
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId,
              messageId,
              patch: {
                isGeneratingArtifact: false,
                artifactError:
                  `The document service couldn't restructure this answer and fell back to ` +
                  `building one from its own sources, which would have left your answer out ` +
                  `of it entirely — so it wasn't attached. Download it "As written" instead, ` +
                  `which reproduces the answer exactly.`,
              },
            },
          });
          return;
        }

        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId,
            messageId,
            patch: { artifact: resp.artifact, isGeneratingArtifact: false, artifactError: undefined },
          },
        });
      } catch (error: unknown) {
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId,
            messageId,
            patch: {
              isGeneratingArtifact: false,
              artifactError: error instanceof Error ? error.message : 'Document generation failed.',
            },
          },
        });
      }
    },
    [state.sessions]
  );

  const toggleDark    = useCallback(() => dispatch({ type: 'TOGGLE_DARK' }), []);
  const toggleSidebar = useCallback(() => dispatch({ type: 'TOGGLE_SIDEBAR' }), []);
  const setSidebar    = useCallback((v: boolean) => dispatch({ type: 'SET_SIDEBAR', payload: v }), []);

  const isSessionQuerying = useCallback(
    (sessionId: string | null) => (sessionId ? !!state.queryingSessions[sessionId] : false),
    [state.queryingSessions]
  );

  return (
    <Ctx.Provider value={{ state, activeSession, sendMessage, createSession, switchSession, deleteSession, toggleDark, toggleSidebar, setSidebar, isSessionQuerying, runResearch, startResearch, answerWithoutResearch, dismissResearch, cancelResearch, downloadAnswerAsDocument }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChatStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useChatStore must be inside <ChatProvider>');
  return ctx;
}