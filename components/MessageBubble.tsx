'use client';

import { useState } from 'react';
import { Message } from '@/lib/chatStore';
import { Citation } from '@/lib/api';
import MarkdownMessage from './MarkdownMessage';

// ─── Citations Panel ──────────────────────────────────────────────────────────

function CitationsPanel({ citations, isDark }: { citations: Citation[]; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-current/10">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase transition-opacity
          ${isDark ? 'text-amber-400/60 hover:text-amber-400' : 'text-charcoal/45 hover:text-charcoal/75'}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        {citations.length} {citations.length === 1 ? 'source' : 'sources'}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {citations.map((c, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-lg text-xs leading-relaxed border-l-2
                ${isDark
                  ? 'bg-white/4 border-amber-400/35 text-white/45'
                  : 'bg-charcoal/4 border-charcoal/20 text-charcoal/50'
                }`}
            >
              <p className={`font-semibold mb-1 ${isDark ? 'text-white/70' : 'text-charcoal/75'}`}>
                {c.source || `Source ${i + 1}`}
              </p>
              {c.content && <p className="line-clamp-3">{c.content}</p>}
              {c.score !== undefined && (
                <p className={`mt-1.5 text-[10px] font-medium ${isDark ? 'text-white/22' : 'text-charcoal/30'}`}>
                  Relevance {Math.round(c.score * 100)}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingDots({ isDark }: { isDark: boolean }) {
  return (
    <span className="flex items-center gap-1.5 py-0.5">
      {[0, 0.18, 0.36].map((delay, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-white/25' : 'bg-charcoal/25'}`}
          style={{ animationDelay: `${delay}s`, animationDuration: '0.9s' }}
        />
      ))}
    </span>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

export default function MessageBubble({
  message,
  isDark,
}: {
  message: Message;
  isDark: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = () => {
    navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* ── Avatar ────────────────────────────────────────────────────────── */}
      <div className={`shrink-0 mt-1 w-7 h-7 rounded-full flex items-center justify-center
        ${isUser
          ? isDark ? 'bg-white/10 text-white/65' : 'bg-charcoal/8 text-charcoal/60'
          : isDark ? 'bg-amber-400/12 text-amber-400' : 'bg-charcoal/7 text-charcoal/65'
        }`}
      >
        {isUser ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L4 10l12 6 12-6-12-6z" fill="currentColor" opacity="0.9"/>
            <path d="M4 16l12 6 12-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.55"/>
          </svg>
        )}
      </div>

      {/* ── Bubble ────────────────────────────────────────────────────────── */}
      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            px-4 py-3 rounded-2xl text-[13.5px] shadow-sm
            ${isUser
              ? isDark
                ? 'bg-[#2C2C2E] text-white/88 rounded-tr-sm border border-white/8'
                : 'bg-[#2C2C2E] text-white rounded-tr-sm'
              : isDark
                ? 'bg-white/[0.055] text-white/82 rounded-tl-sm border border-white/8'
                : 'bg-white text-charcoal/82 rounded-tl-sm border border-charcoal/8 shadow-sm'
            }
            ${message.isError
              ? isDark ? '!bg-red-500/10 !border-red-400/20 !text-red-300' : '!bg-red-50 !border-red-200 !text-red-600'
              : ''
            }
          `}
        >
          {/* Content */}
          {!message.content && message.isStreaming ? (
            <ThinkingDots isDark={isDark} />
          ) : isUser ? (
            // User messages: plain text, preserve newlines
            <span className={`whitespace-pre-wrap break-words leading-[1.7] ${isDark ? 'text-white' : 'text-charcoal/88'}`}>
              {message.content}
            </span>
          ) : (
            // Assistant messages: render markdown
            <>
              <MarkdownMessage
                content={message.content}
                isDark={isDark}
              />
              {message.isStreaming && (
                <span
                  className={`inline-block w-[2px] h-[14px] ml-0.5 rounded-full align-middle
                    ${isDark ? 'bg-amber-400' : 'bg-charcoal/50'}
                    animate-[blink_0.8s_step-end_infinite]`}
                />
              )}
            </>
          )}

          {/* Citations */}
          {!isUser && !message.isError && !!message.citations?.length && (
            <CitationsPanel citations={message.citations} isDark={isDark} />
          )}
        </div>

        {/* ── Meta row ──────────────────────────────────────────────────── */}
        <div
          className={`flex items-center gap-2.5 px-1 text-[10px]
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
            ${isUser ? 'flex-row-reverse' : 'flex-row'}
            ${isDark ? 'text-white' : 'text-charcoal/28'}`}
        >
          <span>
            {new Date(message.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>

          {!isUser && message.content && !message.isError && (
            <button
              onClick={copy}
              className="flex items-center gap-1 hover:opacity-75 transition-opacity"
            >
              {copied ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}

          {message.chunksRetrieved !== undefined && (
            <span className={`opacity-60 ${isDark ? 'text-white' : 'text-charcoal/28'}`}>
              {message.chunksRetrieved} chunk{message.chunksRetrieved !== 1 ? 's' : ''} retrieved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
