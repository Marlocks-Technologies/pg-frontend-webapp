'use client';

import { useState } from 'react';
import React from 'react';
import { useChatStore, Session } from '@/lib/chatStore';
import { type ResearchJobRecord } from '@/lib/researchJobs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Session Row ──────────────────────────────────────────────────────────────

function SessionRow({
  session,
  isActive,
  isDark,
  onSelect,
  onDelete,
  researchJob,
}: {
  session: Session;
  isActive: boolean;
  isDark: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  researchJob?: ResearchJobRecord;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`
        relative w-full text-left px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer
        ${isActive
          ? isDark
            ? 'bg-white/10 border border-white/14'
            : 'bg-charcoal/8 border border-charcoal/12'
          : isDark
            ? 'hover:bg-white/5 border border-transparent'
            : 'hover:bg-charcoal/4 border border-transparent'
        }
      `}
    >
      <div className="flex items-start gap-2.5 pr-6">
        {/* Icon dot — doubles as the research indicator */}
        {researchJob && (researchJob.status === 'QUEUED' || researchJob.status === 'RUNNING') ? (
          <span
            title="Deep research running"
            className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full pg-pulse bg-amber-400"
          />
        ) : researchJob && researchJob.status === 'COMPLETED' && !researchJob.seen ? (
          <span
            title="Research ready"
            className="mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400"
          />
        ) : (
          <span className={`mt-[7px] shrink-0 w-1.5 h-1.5 rounded-full
            ${isActive ? 'bg-amber-400' : isDark ? 'bg-white/15' : 'bg-charcoal/18'}`}
          />
        )}

        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-medium truncate leading-snug
            ${isActive
              ? isDark ? 'text-white' : 'text-charcoal'
              : isDark ? 'text-white/60' : 'text-charcoal/65'
            }`}
          >
            {session.title}
          </p>
          <p className={`text-[11px] mt-0.5 ${isDark ? 'text-white' : 'text-charcoal/32'}`}>
            {relativeTime(session.lastMessageAt)}
            {session.messageCount > 0 && (
              <span className="ml-1.5 opacity-60">· {session.messageCount}</span>
            )}
            {researchJob && (researchJob.status === 'QUEUED' || researchJob.status === 'RUNNING') && (
              <span className="ml-1.5 opacity-70">· Researching</span>
            )}
            {researchJob && researchJob.status === 'COMPLETED' && !researchJob.seen && (
              <span className="ml-1.5 opacity-70">· Ready</span>
            )}
          </p>
        </div>
      </div>

      {/* Delete button — shown on hover */}
      {hovered && (
        <button
          onClick={onDelete}
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors
            ${isDark
              ? 'text-white/20 hover:text-red-400 hover:bg-red-400/10'
              : 'text-charcoal/25 hover:text-red-500 hover:bg-red-50'
            }`}
          title="Delete conversation"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type Tab = 'chat' | 'documents';

export default function Sidebar({
  activeTab,
  onTabChange,
}: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const {
    state,
    activeSession,
    createSession,
    switchSession,
    deleteSession,
    toggleDark,
    setSidebar,
  } = useChatStore();
  const { sessions, isDark, isSidebarOpen } = state;

  return (
    <>
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebar(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full z-30 flex flex-col w-[268px]
          transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 lg:z-auto lg:shrink-0
          ${isDark
            ? 'bg-[#1c1c1e] border-r border-white/[0.07]'
            : 'bg-[#f0f0f2] border-r border-charcoal/[0.07]'
          }
        `}
      >
        {/* ── Logo / header ─────────────────────────────────────────────── */}
        <div className={`flex items-center justify-between px-4 pt-5 pb-4 border-b
          ${isDark ? 'border-white/[0.07]' : 'border-charcoal/[0.07]'}`}
        >
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center
              ${isDark ? 'bg-white/9' : 'bg-charcoal/7'}`}
            >
              <svg width="17" height="17" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L4 10.5l12 6 12-6L16 4z"
                  fill={isDark ? 'rgba(255,255,255,0.88)' : '#2C2C2E'} />
                <path d="M4 22l12 6 12-6"
                  stroke={isDark ? 'rgba(255,255,255,0.38)' : '#2C2C2E'}
                  strokeWidth="2" strokeLinecap="round" opacity="0.7"/>
                <path d="M4 16l12 6 12-6"
                  stroke={isDark ? 'rgba(255,255,255,0.22)' : '#2C2C2E'}
                  strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
              </svg>
            </div>

            <div>
              <p className={`text-[11.5px] font-bold tracking-[0.1em] uppercase
                ${isDark ? 'text-white/85' : 'text-charcoal/85'}`}
              >
                P&G Legal AI
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <p className={`text-[10px] ${isDark ? 'text-white' : 'text-charcoal/38'}`}>
                  Ready
                </p>
              </div>
            </div>
          </div>

          {/* Mobile close */}
          <button
            onClick={() => setSidebar(false)}
            className={`lg:hidden p-1.5 rounded-lg transition-colors
              ${isDark
                ? 'text-white/25 hover:text-white/65 hover:bg-white/6'
                : 'text-charcoal/30 hover:text-charcoal/65 hover:bg-charcoal/6'
              }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Tab switcher: Chat / Documents ──────────────────────────── */}
        <div className={`flex items-center gap-1 mx-3 mt-3 p-1 rounded-xl
          ${isDark ? 'bg-white/[0.06]' : 'bg-charcoal/[0.06]'}`}
        >
          {([
            { id: 'chat',      label: 'Chat',      icon: (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            )},
            { id: 'documents', label: 'Docs',      icon: (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14,2 14,8 20,8"/>
              </svg>
            )},
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200
                ${activeTab === tab.id
                  ? isDark
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'bg-white text-charcoal shadow-sm'
                  : isDark
                    ? 'text-white/30 hover:text-white/60'
                    : 'text-charcoal/38 hover:text-charcoal/65'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── New conversation ──────────────────────────────────────────── */}
        <div className="px-3 py-3">
          <button
            onClick={createSession}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold
              transition-all duration-150 active:scale-[0.98]
              ${isDark
                ? 'bg-white text-[#1c1c1e] hover:bg-white/92 shadow-sm'
                : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c] shadow-sm'
              }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New conversation
          </button>
        </div>

        {/* ── Divider label ─────────────────────────────────────────────── */}
        {sessions.length > 0 && (
          <div className={`px-4 pb-1.5`}>
            <p className={`text-[10px] font-semibold tracking-widest uppercase
              ${isDark ? 'text-white' : 'text-charcoal/28'}`}
            >
              Recent
            </p>
          </div>
        )}

        {/* ── Session list ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {sessions.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-16 gap-3
              ${isDark ? 'text-white' : 'text-charcoal/22'}`}
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <div className="text-center">
                <p className={`text-[12px] font-medium ${isDark ? 'text-white' : 'text-charcoal'}`}>No conversations</p>
                <p className={`text-[11px] mt-0.5 opacity-60 ${isDark ? 'text-white' : 'text-charcoal/60'}`}>Start with a legal question</p>
              </div>
            </div>
          ) : (
            sessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={activeSession?.id === session.id}
                isDark={isDark}
                onSelect={() => switchSession(session.id)}
                onDelete={e => {
                  e.stopPropagation();
                  deleteSession(session.id);
                }}
                researchJob={state.researchJobs
                  .filter(j => j.sessionId === session.id)
                  .sort((a, b) => b.startedAt - a.startedAt)[0]}
              />
            ))
          )}
        </div>

        {/* ── Footer: theme toggle + disclaimer ────────────────────────── */}
        <div className={`px-4 py-4 border-t ${isDark ? 'border-white/[0.07]' : 'border-charcoal/[0.07]'}`}>
          {/* Segmented dark/light control */}
          <div className={`flex items-center p-1 rounded-xl
            ${isDark ? 'bg-white/[0.06]' : 'bg-charcoal/[0.06]'}`}
          >
            {/* Dark tab */}
            <button
              onClick={() => !isDark && toggleDark()}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200
                ${isDark
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-charcoal/38 hover:text-charcoal/65'
                }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              Dark
            </button>
            {/* Light tab */}
            <button
              onClick={() => isDark && toggleDark()}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200
                ${!isDark
                  ? 'bg-white text-charcoal shadow-sm'
                  : 'text-white hover:text-white/55'
                }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              Light
            </button>
          </div>

          <p className={`text-[10px] text-center mt-3 leading-relaxed
            ${isDark ? 'text-white' : 'text-charcoal'}`}
          >
            P&G Legal AI may make errors.<br/>Verify all answers with a qualified solicitor.
          </p>
        </div>
      </aside>
    </>
  );
}
