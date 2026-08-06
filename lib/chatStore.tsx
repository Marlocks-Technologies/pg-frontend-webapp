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
  getChatHistory,
  Citation,
  GeneratedArtifact,
  GenerateDocumentOptions,
  ResearchPlan,
  WebSource,
} from './api';
import {
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
  isQuerying: boolean;
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
  | { type: 'SET_QUERYING'; payload: boolean }
  | { type: 'LOAD_HISTORY'; payload: { sessionId: string; messages: Message[] } }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'SET_RESEARCH_JOBS'; payload: ResearchJobRecord[] };

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

    case 'SET_RESEARCH_JOBS':
      return { ...state, researchJobs: action.payload };

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

    case 'SET_QUERYING':
      return { ...state, isQuerying: action.payload };

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
}

const Ctx = createContext<ChatContextValue | null>(null);

const CHAR_DELAY = 6; // ms per tick — lower = faster
// A verified legal opinion runs to tens of thousands of characters. At a fixed
// 3-char step that would take most of a minute to reveal, so the step scales
// with length to keep any answer inside this budget.
const MAX_TYPEWRITE_MS = 6_000;

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    sessions: [],
    activeSessionId: null,
    isQuerying: false,
    isDark: true,
    isSidebarOpen: true,
    isHydrated: false,
    researchJobs: [],
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (timerRef.current) clearInterval(timerRef.current);
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
        dispatch({ type: 'SET_RESEARCH_JOBS', payload: event.jobs });
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

      dispatch({ type: 'SET_QUERYING', payload: true });

      try {
        const isFollowUp = (state.sessions.find(s => s.id === sessionId)?.messageCount ?? 0) > 1;
        const resp = await chatQuery({
          question,
          sessionId,
          ...(isFollowUp ? { useHistory: true } : {}),
          ...(options?.generateDocument ? { generateDocument: options.generateDocument } : {}),
        });
        dispatch({ type: 'SET_QUERYING', payload: false });

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
      } catch (err: unknown) {
        // Authority-heavy question — hand off to the persistent registry so
        // the job survives even if this tab reloads.
        if (err instanceof ApiError && err.researchRequired) {
          try {
            const job = await submitResearchJob({
              sessionId, messageId: placeholderId, question,
            });
            dispatch({ type: 'SET_QUERYING', payload: false });
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId, messageId: placeholderId,
                patch: { researchJobId: job.jobId, isResearch: true },
              },
            });
          } catch (submitError: unknown) {
            dispatch({ type: 'SET_QUERYING', payload: false });
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId, messageId: placeholderId,
                patch: {
                  content: submitError instanceof Error
                    ? submitError.message
                    : 'Deep research could not be started.',
                  isStreaming: false,
                  isError: true,
                },
              },
            });
          }
          return;
        }

        dispatch({ type: 'SET_QUERYING', payload: false });
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

  const toggleDark    = useCallback(() => dispatch({ type: 'TOGGLE_DARK' }), []);
  const toggleSidebar = useCallback(() => dispatch({ type: 'TOGGLE_SIDEBAR' }), []);
  const setSidebar    = useCallback((v: boolean) => dispatch({ type: 'SET_SIDEBAR', payload: v }), []);

  return (
    <Ctx.Provider value={{ state, activeSession, sendMessage, createSession, switchSession, deleteSession, toggleDark, toggleSidebar, setSidebar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useChatStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useChatStore must be inside <ChatProvider>');
  return ctx;
}