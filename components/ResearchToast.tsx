'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/chatStore';
import { markResearchSeen } from '@/lib/researchJobs';

const DISMISS_MS = 12_000;

interface Toast { jobId: string; sessionId: string; title: string }

export default function ResearchToast() {
  const { state, switchSession } = useChatStore();
  const { researchJobs, activeSessionId, sessions, isDark, isSidebarOpen } = state;

  const [toast, setToast] = useState<Toast | null>(null);
  const announced = useRef(new Set<string>());

  useEffect(() => {
    // A completion in the session the user is already reading needs no toast —
    // but it must still be marked seen, or the sidebar keeps an unread dot on
    // the conversation that is open on screen.
    const here = researchJobs.find(
      job => job.status === 'COMPLETED' && !job.seen && job.sessionId === activeSessionId
    );
    if (here) markResearchSeen(here.sessionId);

    const ready = researchJobs.find(
      job =>
        job.status === 'COMPLETED' &&
        !job.seen &&
        job.sessionId !== activeSessionId &&      // they are already watching it
        !announced.current.has(job.jobId)
    );
    if (!ready) return;

    announced.current.add(ready.jobId);
    setToast({
      jobId: ready.jobId,
      sessionId: ready.sessionId,
      title: sessions.find(s => s.id === ready.sessionId)?.title ?? 'Research',
    });
  }, [researchJobs, activeSessionId, sessions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pg-toast-in absolute bottom-28 right-5 z-30 w-[280px] p-3.5 rounded-xl border shadow-lg
        ${isSidebarOpen ? 'max-lg:hidden' : ''}
        ${isDark ? 'bg-[#1c1c1e] border-white/12' : 'bg-white border-charcoal/12'}`}
    >
      <p className={`flex items-center gap-2 text-[12.5px] font-semibold
        ${isDark ? 'text-white/85' : 'text-charcoal/85'}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/>
        </svg>
        Research complete
      </p>
      <p className={`mt-0.5 text-[11.5px] truncate ${isDark ? 'text-white/45' : 'text-charcoal/45'}`}>
        {toast.title}
      </p>

      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={() => { switchSession(toast.sessionId); setToast(null); }}
          className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-all duration-200 active:scale-95
            ${isDark ? 'bg-white text-[#1c1c1e] hover:bg-white/90' : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c]'}`}
        >
          View
        </button>
        <button
          onClick={() => setToast(null)}
          className={`px-2 py-1 text-[11.5px] transition-colors
            ${isDark ? 'text-white/35 hover:text-white/60' : 'text-charcoal/35 hover:text-charcoal/60'}`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
