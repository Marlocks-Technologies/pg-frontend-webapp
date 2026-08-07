'use client';

import { useEffect, useState } from 'react';
import { getResearchStatus } from '@/lib/api';
import { type ResearchJobRecord } from '@/lib/researchJobs';

export function ResearchConsent({
  question,
  canAnswerNow,
  isDark,
  onRun,
  onAnswerNow,
  onDismiss,
}: {
  question: string;
  canAnswerNow: boolean;
  isDark: boolean;
  onRun: () => void;
  onAnswerNow: () => void;
  onDismiss: () => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    getResearchStatus().then(s => { if (live) setConfigured(s.configured); });
    return () => { live = false; };
  }, []);

  const body = !canAnswerNow
    ? 'This question is too long for a quick answer, so deep research is the only route. It takes 2–10 minutes, and you can keep working while it runs.'
    : 'Verifying Nigerian authorities against live sources takes 2–10 minutes. You can keep working while it runs.';

  return (
    <div
      className={`pg-panel-in p-3.5 rounded-xl border
        ${isDark ? 'bg-white/4 border-white/[0.09]' : 'bg-charcoal/[0.03] border-charcoal/[0.09]'}`}
    >
      <p className={`flex items-center gap-2 text-[13px] font-semibold mb-1.5
        ${isDark ? 'text-white/85' : 'text-charcoal/85'}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l3 6a3 3 0 0 1-6 0z"/>
        </svg>
        This needs deep research
      </p>

      <p className={`text-[12.5px] leading-relaxed ${isDark ? 'text-white/50' : 'text-charcoal/55'}`}>
        {configured === false
          ? "Deep research isn't available right now."
          : body}
      </p>

      {question.length > 1000 && configured === false && (
        <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? 'text-white/40' : 'text-charcoal/45'}`}>
          Shorten the question to under 1,000 characters to get a quick answer instead.
        </p>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {configured === true && (
          <button
            onClick={onRun}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 active:scale-95
              ${isDark ? 'bg-white text-[#1c1c1e] hover:bg-white/90' : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c]'}`}
          >
            Run deep research
          </button>
        )}

        {configured === null && (
          <span className={`px-2 py-1.5 text-[12px] ${isDark ? 'text-white/35' : 'text-charcoal/35'}`}>
            Checking availability…
          </span>
        )}

        {canAnswerNow && (
          <button
            onClick={onAnswerNow}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors duration-200
              ${isDark
                ? 'border-white/12 text-white/65 hover:text-white/90 hover:border-white/22'
                : 'border-charcoal/14 text-charcoal/60 hover:text-charcoal/85 hover:border-charcoal/24'}`}
          >
            Answer now
          </button>
        )}

        <button
          onClick={onDismiss}
          className={`px-2 py-1.5 text-[12px] transition-colors duration-200
            ${isDark ? 'text-white/35 hover:text-white/60' : 'text-charcoal/35 hover:text-charcoal/60'}`}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

// ─── Research progress (running / stalled / failed) ───────────────────────────

/** Ticks once a second from the job's persisted start, so a reload is honest. */
function useElapsed(startedAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const RUNNING_LABELS: Record<string, string> = {
  QUEUED: 'Queued for deep legal research…',
  RUNNING: 'Searching Nigerian authorities and verifying citations…',
};

export function ResearchProgress({
  job, isDark, onCancel, onResume, onRetry,
}: {
  job: ResearchJobRecord;
  isDark: boolean;
  onCancel: () => void;
  onResume: () => void;
  onRetry: () => void;
}) {
  const elapsed = useElapsed(job.startedAt);
  const muted = isDark ? 'text-white/40' : 'text-charcoal/45';
  const body = isDark ? 'text-white/60' : 'text-charcoal/60';

  if (job.status === 'QUEUED' || job.status === 'RUNNING') {
    const longRunning = Date.now() - job.startedAt > 10 * 60 * 1000;
    return (
      <div aria-live="polite">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5">
            {[0, 0.15, 0.3].map((delay, i) => (
              <span key={i}
                className={`pg-dot w-1.5 h-1.5 rounded-full ${isDark ? 'bg-white/60' : 'bg-charcoal/50'}`}
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </span>
          <span className={`text-[12.5px] ${body}`}>{RUNNING_LABELS[job.status]}</span>
          <span className={`text-[11.5px] tabular-nums ${muted}`}>{elapsed}</span>
          <button
            onClick={onCancel}
            className={`text-[11.5px] underline underline-offset-2 transition-colors
              ${isDark ? 'text-white/35 hover:text-white/65' : 'text-charcoal/35 hover:text-charcoal/65'}`}
          >
            Cancel
          </button>
        </div>
        <p className={`mt-1 text-[11.5px] ${muted}`}>
          {longRunning ? 'Taking longer than usual — still running.' : 'Typically 2–10 minutes.'}
        </p>
      </div>
    );
  }

  if (job.status === 'STALLED') {
    return (
      <div aria-live="polite" className="flex items-center gap-2 flex-wrap">
        <span className={`text-[12.5px] ${body}`}>{job.error ?? 'Still running.'}</span>
        <button
          onClick={onResume}
          className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors
            ${isDark
              ? 'border-white/12 text-white/65 hover:text-white/90 hover:border-white/22'
              : 'border-charcoal/14 text-charcoal/60 hover:text-charcoal/85 hover:border-charcoal/24'}`}
        >
          Check again
        </button>
      </div>
    );
  }

  if (job.status === 'FAILED') {
    // A quota rejection cannot succeed on retry, so no button is offered.
    const isQuota = /quota|throttl/i.test(job.error ?? '');
    return (
      <div aria-live="polite" className="flex items-center gap-2 flex-wrap">
        <span className={`text-[12.5px] ${isDark ? 'text-red-300' : 'text-red-600'}`}>
          {job.error ?? 'The research job failed.'}
        </span>
        {!isQuota && (
          <button
            onClick={onRetry}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors
              ${isDark
                ? 'border-white/12 text-white/65 hover:text-white/90 hover:border-white/22'
                : 'border-charcoal/14 text-charcoal/60 hover:text-charcoal/85 hover:border-charcoal/24'}`}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return null;
}
