'use client';

import { useEffect, useState } from 'react';
import { getResearchStatus } from '@/lib/api';

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
          ? 'Deep research is not configured for this deployment.'
          : body}
      </p>

      {question.length > 1000 && configured === false && (
        <p className={`mt-1.5 text-[12px] leading-relaxed ${isDark ? 'text-white/40' : 'text-charcoal/45'}`}>
          Shorten the question to under 1,000 characters to get a quick answer instead.
        </p>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {configured !== false && (
          <button
            onClick={onRun}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-200 active:scale-95
              ${isDark ? 'bg-white text-[#1c1c1e] hover:bg-white/90' : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c]'}`}
          >
            Run deep research
          </button>
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
