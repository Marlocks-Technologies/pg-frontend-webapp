'use client';

import { useEffect, useRef } from 'react';
import { useChatStore } from '@/lib/chatStore';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

// ─── Practice area cards on the welcome screen ────────────────────────────────

const STARTER_CARDS = [
  {
    label: 'Contract Review',
    description: 'Analyse agreements for risks, obligations and missing clauses.',
    prompt: 'What should I look out for in a commercial contract?',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
    ),
  },
  {
    label: 'Corporate Law',
    description: 'Company formation, governance, compliance and M&A questions.',
    prompt: 'What are the requirements to incorporate a company in Nigeria?',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
  },
  {
    label: 'Capital Markets',
    description: 'SEC regulations, bond issuance, securities and structured finance.',
    prompt: 'What are the SEC disclosure requirements for a public offering in Nigeria?',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/>
      </svg>
    ),
  },
  {
    label: 'Employment Law',
    description: 'Employee rights, termination, contracts and labour regulations.',
    prompt: 'What are the rules around employee termination under Nigerian labour law?',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
];

// ─── Chat Area ────────────────────────────────────────────────────────────────

export default function ChatArea() {
  const {
    state,
    activeSession,
    sendMessage,
    createSession,
    toggleSidebar,
    isSessionQuerying,
    runResearch,
    answerWithoutResearch,
    dismissResearch,
  } = useChatStore();
  const { isDark, isSidebarOpen } = state;
  const isQuerying = isSessionQuerying(state.activeSessionId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasMessages = (activeSession?.messages.length ?? 0) > 0;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length]);

  return (
    <div
      className={`flex flex-col flex-1 min-w-0 min-h-0
        ${isDark ? 'bg-[#111113]' : 'bg-[#f5f5f7]'}`}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header
        className={`shrink-0 flex items-center justify-between px-4 h-14 border-b
          ${isDark
            ? 'bg-[#111113] border-white/8'
            : 'bg-[#f5f5f7] border-charcoal/8'
          }`}
      >
        <div className="flex items-center gap-3">
          {/* Mobile/collapsed sidebar hamburger */}
          {!isSidebarOpen && (
            <button
              onClick={toggleSidebar}
              className={`p-1.5 rounded-lg transition-colors
                ${isDark
                  ? 'text-white/35 hover:text-white/70 hover:bg-white/6'
                  : 'text-charcoal/35 hover:text-charcoal/70 hover:bg-charcoal/6'
                }`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          )}

          <div>
            <h1 className={`text-sm font-semibold leading-tight
              ${isDark ? 'text-white' : 'text-charcoal/88'}`}
            >
              {activeSession?.title ?? 'Legal AI Assistant'}
            </h1>
            <p className={`text-[11px] ${isDark ? 'text-white/40' : 'text-charcoal/38'}`}>
              {isQuerying
                ? 'Searching knowledge base…'
                : activeSession
                  ? `${activeSession.messageCount} message${activeSession.messageCount !== 1 ? 's' : ''}`
                  : 'Perchstone & Graeys'
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isQuerying && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
              ${isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-charcoal/8 text-charcoal/60'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Thinking
            </div>
          )}

          <button
            onClick={createSession}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-all duration-150
              ${isDark
                ? 'border-white/10 text-white/55 hover:text-white/85 hover:border-white/22 hover:bg-white/5'
                : 'border-charcoal/12 text-charcoal/45 hover:text-charcoal/70 hover:border-charcoal/22 hover:bg-charcoal/4'
              }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New chat
          </button>
        </div>
      </header>

      {/* ── Message feed ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {hasMessages ? (
          <div className="px-4 py-6 space-y-6 max-w-3xl mx-auto">
            {activeSession!.messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isDark={isDark}
                onRunResearch={() =>
                  msg.researchPrompt &&
                  runResearch(activeSession!.id, msg.id, msg.researchPrompt.question)}
                onAnswerNow={() =>
                  msg.researchPrompt &&
                  answerWithoutResearch(activeSession!.id, msg.id, msg.researchPrompt.question)}
                onDismissResearch={() => dismissResearch(activeSession!.id, msg.id)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-12">
            <div className="w-full max-w-2xl">
              {/* Hero */}
              <div className="pg-rise text-center mb-10">
                <div className={`inline-flex w-14 h-14 rounded-2xl items-center justify-center mb-5
                  ${isDark ? 'bg-[#1c1c1e] border border-white/10' : 'bg-white border border-charcoal/10'}`}
                >
                  <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                    <path d="M16 3L3 9.5l13 6.5 13-6.5L16 3z" fill={isDark ? 'rgba(255,255,255,0.85)' : '#2C2C2E'} />
                    <path d="M3 22l13 6.5L29 22" stroke={isDark ? 'rgba(255,255,255,0.4)' : '#2C2C2E'} strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
                    <path d="M3 16l13 6.5L29 16" stroke={isDark ? 'rgba(255,255,255,0.25)' : '#2C2C2E'} strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
                  </svg>
                </div>

                <h2 className={`text-[22px] font-bold tracking-tight mb-2
                  ${isDark ? 'text-white/90' : 'text-charcoal/90'}`}
                >
                  P&G Legal AI
                </h2>
                <p className={`text-[13.5px] leading-relaxed max-w-sm mx-auto
                  ${isDark ? 'text-white/55' : 'text-charcoal/50'}`}
                >
                  Ask anything from the Perchstone & Graeys knowledge base.
                  Get answers grounded in documents, with cited sources.
                </p>
              </div>

              {/* Starter cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {STARTER_CARDS.map((card, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (!activeSession) createSession();
                      setTimeout(() => sendMessage(card.prompt), 40);
                    }}
                    style={{ animationDelay: `${120 + i * 60}ms` }}
                    className={`
                      pg-rise group flex flex-col items-start gap-3 p-4 rounded-2xl border text-left
                      transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]
                      ${isDark
                        ? 'bg-[#1c1c1e] border-white/8 hover:border-white/18 hover:bg-[#222224]'
                        : 'bg-white border-charcoal/8 hover:border-charcoal/18'
                      }
                    `}
                  >
                    <div className={`p-2 rounded-xl transition-colors duration-200
                      ${isDark
                        ? 'bg-white/8 text-white/60 group-hover:bg-white/12 group-hover:text-white/85'
                        : 'bg-charcoal/6 text-charcoal/55 group-hover:bg-charcoal/10 group-hover:text-charcoal/80'
                      }`}
                    >
                      {card.icon}
                    </div>
                    <div>
                      <p className={`text-[13px] font-semibold mb-0.5
                        ${isDark ? 'text-white/85' : 'text-charcoal/85'}`}
                      >
                        {card.label}
                      </p>
                      <p className={`text-[12px] leading-relaxed
                        ${isDark ? 'text-white/45' : 'text-charcoal/48'}`}
                      >
                        {card.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Input ────────────────────────────────────────────────────────── */}
      <ChatInput />
    </div>
  );
}
