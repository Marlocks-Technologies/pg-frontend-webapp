'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import { chatQuery, getChatHistory, Citation } from './api';

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  citations?: Citation[];
  isStreaming?: boolean;
  isError?: boolean;
  chunksRetrieved?: number;
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
      // Never persist streaming state
      isStreaming: false,
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
  | { type: 'DELETE_SESSION'; payload: string };

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {

    case 'HYDRATE':
      return {
        ...state,
        sessions: action.payload.sessions,
        isDark: action.payload.isDark,
        activeSessionId: action.payload.sessions[0]?.id ?? null,
      };

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
  sendMessage: (question: string) => Promise<void>;
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  toggleDark: () => void;
  toggleSidebar: () => void;
  setSidebar: (v: boolean) => void;
}

const Ctx = createContext<ChatContextValue | null>(null);

const CHAR_DELAY = 6; // ms per 2-char tick — lower = faster

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    sessions: [],
    activeSessionId: null,
    isQuerying: false,
    isDark: true,
    isSidebarOpen: true,
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
    dispatch({ type: 'DELETE_SESSION', payload: id });
  }, []);

  // ── Switch session + lazy-load history ────────────────────────────────────
  const switchSession = useCallback(
    async (id: string) => {
      dispatch({ type: 'SET_ACTIVE', payload: id });
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
      timerRef.current = setInterval(() => {
        i = Math.min(i + 3, fullText.length); // 3 chars per tick
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

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (question: string) => {
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
                chunksRetrieved: resp.metadata?.chunks_retrieved,
                isStreaming: false,
              },
            },
          });
        });
      } catch (err: unknown) {
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