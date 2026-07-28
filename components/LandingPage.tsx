'use client';

import { useEffect, useRef, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

// ─── Demo conversations ────────────────────────────────────────────────────────

const DEMO = [
  {
    q: 'What are the requirements to incorporate a company in Nigeria?',
    a: 'Under CAMA 2020, incorporation requires a minimum of two subscribers, a registered address in Nigeria, and a memorandum of association. The CAC processes registration within 48 hours for online filings.',
    source: 'CAMA 2020 — s.18',
    excerpt: 'Every company shall have at least two subscribers to the memorandum and articles of association.',
  },
  {
    q: 'What notice period is required before terminating an employee?',
    a: "Under the Labour Act, minimum notice depends on length of service: one day for under three months, one week for three months to two years, and two weeks beyond two years.",
    source: 'Labour Act Cap L1 — s.11',
    excerpt: 'Notice of termination of a contract of employment shall be given in writing signed by the employer.',
  },
  {
    q: 'What are the SEC disclosure requirements for a public offering?',
    a: 'The Securities and Exchange Commission requires a prospectus approved by SEC, audited financial statements for the preceding three years, and a detailed risk statement, among other disclosures.',
    source: 'ISA 2007 — s.67',
    excerpt: 'No person shall make a public offer of securities without first filing a registration statement with the Commission.',
  },
];

// ─── Rotating practice areas (hero) ───────────────────────────────────────────

const AREAS = [
  'corporate law.',
  'employment.',
  'capital markets.',
  'property & real estate.',
  'intellectual property.',
];

// ─── Capabilities ─────────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    num: '01',
    title: 'Knowledge at hand',
    body: "The assistant draws on the firm's own documents — precedents, filed matters, practice notes — and returns the relevant passage alongside every answer.",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Sources, not summaries',
    body: 'Every response arrives with its citations ready. Not a paraphrase — the passage, the document, the page. The answer is provisional; the sources are the point.',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9,11 12,14 22,4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Conversation, not queries',
    body: 'Follow-up questions carry context from what came before. A thread of questions reads as a thread of reasoning — not a fresh search on each turn.',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

const STEPS = [
  {
    label: 'Ask',
    body: 'Type your question in plain language. No special syntax, no keywords. Ask the way you would ask a colleague who knows the file.',
  },
  {
    label: 'Retrieve',
    body: "The assistant searches the knowledge base semantically, finding passages whose meaning matches your question — not just their words.",
  },
  {
    label: 'Review',
    body: 'Your answer arrives with its sources. Open them, read the passage, confirm the ground. Where the record is silent, the assistant says so.',
  },
];

const PROMPTS = [
  'What are the requirements to incorporate a company in Nigeria?',
  'What should I look out for in a commercial lease?',
  'Summarise employee rights under the Labour Act',
  'What are the SEC requirements for a public offering?',
  'Explain the key clauses in a shareholders agreement',
  'What constitutes insider trading under Nigerian law?',
  'How does the CAC handle foreign-owned entities?',
  'What are the rules on termination of employment?',
];

// ─── Scroll reveal ─────────────────────────────────────────────────────────────

function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('pg-visible');
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -44px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`pg-reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// ─── Rotating practice area text ───────────────────────────────────────────────

function RotatingArea({ isDark }: { isDark: boolean }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex(i => (i + 1) % AREAS.length);
        setVisible(true);
      }, 320);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className={`inline-block font-bold transition-all duration-300 ${
        isDark ? 'text-white/88' : 'text-charcoal/88'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
    >
      {AREAS[index]}
    </span>
  );
}

// ─── Animated demo chat ────────────────────────────────────────────────────────

type Phase = 'typing-q' | 'thinking' | 'typing-a' | 'citing' | 'pausing';

function DemoChat({ isDark }: { isDark: boolean }) {
  const [convIdx, setConvIdx] = useState(0);
  const [displayedQ, setDisplayedQ] = useState('');
  const [displayedA, setDisplayedA] = useState('');
  const [phase, setPhase] = useState<Phase>('typing-q');

  const conv = DEMO[convIdx];

  // Colours derived from theme
  const raised   = isDark ? 'bg-[#1c1c1e]'      : 'bg-white';
  const border   = isDark ? 'border-white/[0.07]': 'border-charcoal/[0.07]';
  const divider  = isDark ? 'border-white/[0.07]': 'border-charcoal/[0.07]';
  const userBub  = isDark ? 'bg-[#2C2C2E] text-white/85' : 'bg-[#2C2C2E] text-white';
  const aiBub    = isDark
    ? 'bg-white/[0.055] border border-white/[0.07] text-white/78'
    : 'bg-[#f5f5f7] border border-charcoal/[0.07] text-charcoal/78';
  const dotCol   = isDark ? 'bg-white/22'        : 'bg-charcoal/22';
  const citeBar  = isDark
    ? 'border-white/20 bg-white/[0.03] text-white/35'
    : 'border-charcoal/20 bg-charcoal/[0.03] text-charcoal/40';
  const citeHead = isDark ? 'text-white/58'      : 'text-charcoal/60';
  const cursor   = isDark ? 'bg-white/35'        : 'bg-charcoal/30';
  const inputBox = isDark
    ? 'border-white/[0.08] text-white/18'
    : 'border-charcoal/[0.08] text-charcoal/22';
  const sendBtn  = isDark ? 'bg-white/[0.06]'    : 'bg-charcoal/[0.06]';
  const sendIco  = isDark ? 'text-white/35'      : 'text-charcoal/35';

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;

    if (phase === 'typing-q') {
      if (displayedQ.length < conv.q.length) {
        t = setTimeout(() => setDisplayedQ(conv.q.slice(0, displayedQ.length + 2)), 38);
      } else {
        t = setTimeout(() => setPhase('thinking'), 650);
      }
    } else if (phase === 'thinking') {
      t = setTimeout(() => setPhase('typing-a'), 1700);
    } else if (phase === 'typing-a') {
      if (displayedA.length < conv.a.length) {
        t = setTimeout(() => setDisplayedA(conv.a.slice(0, displayedA.length + 3)), 18);
      } else {
        t = setTimeout(() => setPhase('citing'), 380);
      }
    } else if (phase === 'citing') {
      t = setTimeout(() => setPhase('pausing'), 4800);
    } else if (phase === 'pausing') {
      t = setTimeout(() => {
        setDisplayedQ('');
        setDisplayedA('');
        setConvIdx(i => (i + 1) % DEMO.length);
        setPhase('typing-q');
      }, 700);
    }

    return () => clearTimeout(t);
  }, [phase, displayedQ, displayedA, conv]);

  return (
    <div className={`w-full max-w-[420px] rounded-2xl border overflow-hidden shadow-xl ${raised} ${border} ${
      isDark ? 'shadow-black/30' : 'shadow-charcoal/8'
    }`}>

      {/* Card header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${divider}`}>
        <span className="w-[6px] h-[6px] rounded-full bg-emerald-400 shrink-0" />
        <span className={`text-[11.5px] font-bold tracking-[0.1em] uppercase ${isDark ? 'text-white/70' : 'text-charcoal/65'}`}>
          P&G Legal AI
        </span>
        <span className={`ml-auto text-[10px] ${isDark ? 'text-white/22' : 'text-charcoal/28'}`}>
          Internal research tool
        </span>
      </div>

      {/* Message area */}
      <div className="px-4 py-4 space-y-3" style={{ minHeight: '268px' }}>

        {/* User bubble */}
        {displayedQ && (
          <div className="flex justify-end">
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-[12.5px] leading-relaxed ${userBub}`}>
              {displayedQ}
              {phase === 'typing-q' && displayedQ.length < conv.q.length && (
                <span className={`inline-block w-[2px] h-[13px] ml-0.5 rounded-full align-middle animate-pulse ${cursor}`} />
              )}
            </div>
          </div>
        )}

        {/* Thinking dots */}
        {phase === 'thinking' && (
          <div className="flex items-end gap-2.5">
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border ${isDark ? 'bg-white/[0.05] border-white/[0.07]' : 'bg-charcoal/[0.05] border-charcoal/[0.07]'}`}>
              <svg width="9" height="9" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L4 10.5l12 6 12-6L16 4z" fill={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(44,44,46,0.45)'}/>
              </svg>
            </div>
            <div className={`px-3.5 py-2.5 rounded-2xl rounded-tl-sm border ${aiBub}`}>
              <div className="flex gap-1.5">
                {[0, 0.18, 0.36].map((delay, i) => (
                  <span key={i} className={`w-1.5 h-1.5 rounded-full animate-bounce ${dotCol}`}
                    style={{ animationDelay: `${delay}s`, animationDuration: '0.9s' }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI answer */}
        {(phase === 'typing-a' || phase === 'citing' || phase === 'pausing') && displayedA && (
          <div className="flex gap-2.5">
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center border mt-0.5 ${isDark ? 'bg-white/[0.05] border-white/[0.07]' : 'bg-charcoal/[0.05] border-charcoal/[0.07]'}`}>
              <svg width="9" height="9" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L4 10.5l12 6 12-6L16 4z" fill={isDark ? 'rgba(255,255,255,0.55)' : 'rgba(44,44,46,0.45)'}/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-[12.5px] leading-[1.65] border ${aiBub}`}>
                {displayedA}
                {phase === 'typing-a' && displayedA.length < conv.a.length && (
                  <span className={`inline-block w-[2px] h-[13px] ml-0.5 rounded-full align-middle animate-pulse ${cursor}`} />
                )}
              </div>

              {/* Citation panel — appears when phase = citing or pausing */}
              <div
                className={`mt-2 mx-0.5 px-3 py-2 rounded-lg border-l-2 text-[11px] leading-relaxed transition-all duration-500 ${citeBar} ${
                  phase === 'citing' || phase === 'pausing' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
                }`}
              >
                <p className={`font-semibold mb-0.5 text-[10.5px] tracking-wide ${citeHead}`}>
                  {conv.source}
                </p>
                <p className="italic">"{conv.excerpt}"</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Static input bar */}
      <div className={`px-4 py-3 border-t ${divider}`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[12px] ${inputBox}`}>
          <span className="flex-1 select-none">Ask a legal question…</span>
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${sendBtn}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={sendIco}>
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Arrow icon ────────────────────────────────────────────────────────────────

function Arrow({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/>
    </svg>
  );
}

// ─── Landing Page ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router   = useRouter();
  const [isDark, setIsDark]   = useState(false); // default: light
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Hydrate theme from localStorage after mount
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('pg-landing-theme');
    if (saved === 'dark') setIsDark(true);
  }, []);

  // Persist theme changes
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('pg-landing-theme', isDark ? 'dark' : 'light');
  }, [isDark, mounted]);

  // Transition to /chat through surface-dark (per design system motion rules)
  const handleOpen = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => router.push('/chat'), 520);
  };

  // ── Derived theme tokens (avoids repetitive ternaries below) ──────────────
  const D = isDark;

  const bg        = D ? 'bg-[#111113]'                       : 'bg-[#f5f5f7]';
  const navBg     = D ? 'bg-[#111113]'                       : 'bg-[#f5f5f7]';
  const navBorder = D ? 'border-white/[0.07]'                : 'border-charcoal/[0.07]';
  const raised    = D ? 'bg-[#1c1c1e]'                       : 'bg-white';
  const cardBdr   = D ? 'border-white/[0.07]'                : 'border-charcoal/[0.07]';
  const hairline  = D ? 'bg-white/[0.07]'                    : 'bg-charcoal/[0.07]';
  const txtP      = D ? 'text-white/88'                      : 'text-charcoal/88';
  const txtS      = D ? 'text-white/45'                      : 'text-charcoal';
  const txtT      = D ? 'text-white/32'                      : 'text-charcoal';
  const txtQ      = D ? 'text-white/16'                      : 'text-charcoal';
  const wm        = D ? 'text-white/80'                      : 'text-charcoal/80';
  const numCol    = D ? 'text-white/16'                      : 'text-charcoal/18';
  const icoBg     = D ? 'bg-white/[0.06] border-white/[0.07]': 'bg-charcoal/[0.06] border-charcoal/[0.07]';
  const hrRule    = D ? 'bg-white/[0.07]'                    : 'bg-charcoal/[0.07]';
  const stepHr    = D ? 'bg-white/[0.07]'                    : 'bg-charcoal/[0.07]';
  const pillBg    = D ? `${raised} border-white/[0.07]`      : `${raised} border-charcoal/[0.07]`;
  const pillTxt   = D ? 'text-white/42'                      : 'text-charcoal';
  const pillHov   = D ? 'hover:text-white/72 hover:border-white/[0.14] hover:bg-white/[0.04]'
                      : 'hover:text-charcoal/75 hover:border-charcoal/[0.18] hover:bg-charcoal/[0.04]';

  // Nav ghost button
  const ghostBtn  = D
    ? 'border-white/[0.08] text-white/48 hover:text-white/80 hover:border-white/[0.18] hover:bg-white/[0.04]'
    : 'border-charcoal/[0.10] text-charcoal/50 hover:text-charcoal/80 hover:border-charcoal/[0.22] hover:bg-charcoal/[0.04]';

  // Theme toggle
  const togBg     = D ? 'bg-white/[0.06] border-white/[0.08]' : 'bg-charcoal/[0.06] border-charcoal/[0.08]';
  const togIco    = D ? 'text-white/50'                       : 'text-charcoal/50';

  // Primary button
  const primaryBtn = D
    ? 'bg-white text-[#111113] hover:bg-white/90'
    : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c]';

  // Footer wordmark
  const ftrWm     = D ? 'text-white/28'                      : 'text-charcoal';
  const ftrWmIco  = D ? 'bg-white/[0.05] border-white/[0.07]': 'bg-charcoal/[0.05] border-charcoal/[0.07]';
  const ftrTxt    = D ? 'text-white/18'                      : 'text-charcoal';

  return (
    <>
      {/* Cross-surface transition overlay */}
      <div
        aria-hidden
        className={`fixed inset-0 z-50 bg-[#111113] pointer-events-none transition-opacity duration-500 ease-in ${
          leaving ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div className={`min-h-screen font-sans transition-colors duration-300 ${bg}`}>

        {/* ── Fixed nav ──────────────────────────────────────────────────── */}
        <nav className={`fixed top-0 inset-x-0 z-40 flex items-center justify-between px-6 lg:px-10 h-[52px] border-b ${navBorder} ${navBg}`}>
          {/* Wordmark */}
          <div className="flex items-center gap-2.5">
            <div className={`w-[26px] h-[26px] rounded-lg flex items-center justify-center border ${icoBg}`}>
              <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L4 10.5l12 6 12-6L16 4z" fill={D ? 'rgba(255,255,255,0.8)' : 'rgba(44,44,46,0.75)'} />
                <path d="M4 16l12 6 12-6" stroke={D ? 'rgba(255,255,255,0.28)' : 'rgba(44,44,46,0.28)'} strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M4 22l12 6 12-6" stroke={D ? 'rgba(255,255,255,0.14)' : 'rgba(44,44,46,0.14)'} strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className={`text-[11.5px] font-bold tracking-[0.1em] uppercase ${wm}`}>
              P&G Legal AI
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            {/* <button
              onClick={() => setIsDark(!isDark)}
              title={isDark ? 'Switch to light' : 'Switch to dark'}
              className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all duration-200 ${togBg} ${togIco} hover:opacity-80`}
            >
              {isDark ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button> */}

            {/* Open assistant */}
            <button
              onClick={handleOpen}
              className={`flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg border text-[12px] font-medium transition-all duration-200 ${ghostBtn}`}
            >
              Open assistant
              <Arrow size={11} />
            </button>
          </div>
        </nav>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="min-h-screen pt-[52px] flex flex-col lg:flex-row items-center max-w-7xl mx-auto px-6 lg:px-10 gap-12 lg:gap-16 py-16 lg:py-0">

          {/* Left: text */}
          <div className="flex-1 flex flex-col justify-center lg:py-20">
            {/* Status */}
            <div className="flex items-center gap-2 mb-9">
              <span className="w-[6px] h-[6px] rounded-full bg-emerald-400 shrink-0" />
              <span className={`text-[11px] font-medium tracking-wide ${txtT}`}>
                Perchstone & Graeys · Online
              </span>
            </div>

            {/* Headline */}
            <h1
              className={`font-bold leading-[1.06] tracking-[-0.03em] max-w-[560px] mb-5 ${txtP}`}
              style={{ fontSize: 'clamp(1.85rem, 4.2vw, 3.25rem)' }}
            >
              Legal research that shows its work.
            </h1>

            {/* Rotating practice area */}
            <p className={`text-[15px] leading-relaxed mb-8 ${txtS}`}>
              Ask in plain language about{' '}
              <RotatingArea isDark={D} />
            </p>

            {/* Body */}
            <p className={`text-[13.5px] leading-[1.7] max-w-[420px] mb-10 ${txtT}`}>
              Every answer comes with the passage it came from — the document,
              the section, the page. The record speaks. The assistant shows you where.
            </p>

            {/* CTA */}
            <div className="flex items-center gap-4 flex-wrap">
              <button
                onClick={handleOpen}
                className={`inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] ${primaryBtn}`}
              >
                Open the assistant
                <Arrow size={13} />
              </button>
              <span className={`text-[10px] leading-relaxed ${txtQ}`}>
                For research only — not legal advice
              </span>
            </div>
          </div>

          {/* Right: demo chat */}
          <div className="flex-1 flex items-center justify-center w-full lg:py-20">
            <DemoChat isDark={D} />
          </div>
        </section>

        {/* ── Hairline ─────────────────────────────────────────────────────── */}
        <div className={`h-px ${hairline}`} />

        {/* ── Capabilities ─────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-10 py-24 max-w-6xl mx-auto">
          <Reveal>
            <div className="flex items-baseline gap-4 mb-14">
              <span className={`text-[11px] font-bold tabular-nums select-none ${numCol}`}>01</span>
              <h2 className={`text-[22px] font-bold tracking-tight ${txtP}`}>
                An instrument, not an oracle.
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {CAPABILITIES.map((cap, i) => (
              <Reveal key={cap.num} delay={i * 90}>
                <div className={`flex flex-col gap-4 p-6 rounded-2xl border h-full ${raised} ${cardBdr}`}>
                  <div className="flex items-start justify-between">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${icoBg} ${txtS}`}>
                      {cap.icon}
                    </div>
                    <span className={`text-[11px] font-bold tabular-nums select-none ${numCol}`}>
                      {cap.num}
                    </span>
                  </div>
                  <h3 className={`text-[14px] font-bold leading-snug ${txtP}`}>{cap.title}</h3>
                  <p className={`text-[13px] leading-[1.65] ${txtT}`}>{cap.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Hairline ─────────────────────────────────────────────────────── */}
        <div className={`h-px ${hrRule}`} />

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-10 py-24 max-w-6xl mx-auto">
          <Reveal>
            <div className="flex items-baseline gap-4 mb-14">
              <span className={`text-[11px] font-bold tabular-nums select-none ${numCol}`}>02</span>
              <h2 className={`text-[22px] font-bold tracking-tight ${txtP}`}>
                Three steps. No syntax.
              </h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-10">
            {STEPS.map((step, i) => (
              <Reveal key={step.label} delay={i * 100}>
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] font-bold tabular-nums shrink-0 ${numCol}`}>
                      0{i + 1}
                    </span>
                    <div className={`flex-1 h-px ${stepHr}`} />
                  </div>
                  <h3 className={`text-[15px] font-bold ${txtP}`}>{step.label}</h3>
                  <p className={`text-[13px] leading-[1.65] ${txtT}`}>{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Hairline ─────────────────────────────────────────────────────── */}
        <div className={`h-px ${hrRule}`} />

        {/* ── Sample prompts ───────────────────────────────────────────────── */}
        <section className="px-6 lg:px-10 py-24 max-w-6xl mx-auto">
          <Reveal>
            <div className="flex items-baseline gap-4 mb-4">
              <span className={`text-[11px] font-bold tabular-nums select-none ${numCol}`}>03</span>
              <h2 className={`text-[22px] font-bold tracking-tight ${txtP}`}>
                Start with a question.
              </h2>
            </div>
            <p className={`text-[13px] leading-relaxed mb-10 ${txtT}`} style={{ paddingLeft: 'calc(11px + 1rem)' }}>
              The assistant handles anything in the knowledge base. Each prompt below opens
              the assistant and starts the conversation immediately.
            </p>
          </Reveal>

          <div className="flex flex-wrap gap-2.5">
            {PROMPTS.map((prompt, i) => (
              <Reveal key={i} delay={Math.min(i * 55, 330)}>
                <button
                  onClick={handleOpen}
                  className={`px-4 py-2.5 rounded-xl border text-[13px] leading-snug text-left transition-all duration-200 ${pillBg} ${pillTxt} ${pillHov}`}
                >
                  {prompt}
                </button>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Hairline ─────────────────────────────────────────────────────── */}
        <div className={`h-px ${hrRule}`} />

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section className="px-6 lg:px-10 py-32">
          <div className="max-w-lg mx-auto text-center">
            <Reveal>
              <div className="flex items-center justify-center gap-2 mb-8">
                <span className="w-[6px] h-[6px] rounded-full bg-emerald-400" />
                <span className={`text-[11px] font-medium ${txtT}`}>Ready</span>
              </div>

              <h2
                className={`font-bold tracking-tight mb-5 ${txtP}`}
                style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)' }}
              >
                Ready when you are.
              </h2>

              <p className={`text-[13px] leading-[1.7] mb-10 max-w-sm mx-auto ${txtT}`}>
                For research only — not legal advice. Verify every answer with a
                qualified solicitor before it reaches a client.
              </p>

              <button
                onClick={handleOpen}
                className={`inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] ${primaryBtn}`}
              >
                Open the assistant
                <Arrow size={13} />
              </button>
            </Reveal>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <footer className={`border-t ${navBorder} px-6 lg:px-10 py-8`}>
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${ftrWmIco}`}>
                <svg width="9" height="9" viewBox="0 0 32 32" fill="none">
                  <path d="M16 4L4 10.5l12 6 12-6L16 4z" fill={D ? 'rgba(255,255,255,0.65)' : 'rgba(44,44,46,0.6)'}/>
                </svg>
              </div>
              <span className={`text-[11.5px] font-bold tracking-[0.1em] uppercase ${ftrWm}`}>
                Perchstone & Graeys
              </span>
            </div>
            <p className={`text-[10px] leading-relaxed max-w-sm ${ftrTxt}`}>
              P&G Legal AI is an internal research instrument and may make errors.
              Verify every answer against its cited source and with a qualified
              solicitor before it reaches a client.
            </p>
          </div>
        </footer>

      </div>
    </>
  );
}