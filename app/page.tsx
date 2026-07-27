import type { Metadata } from 'next';
import Link from 'next/link';
import GavelSequence from '@/components/landing/GavelSequence';

export const metadata: Metadata = {
  title: 'P&G Legal AI | Perchstone & Graeys',
  description:
    "Legal research grounded in the Perchstone & Graeys record and Nigerian law. Every answer carries its sources. For research only — not legal advice.",
};

export default function LandingPage() {
  return (
    // Light only. The scene is a daylit office at the start of a working
    // session, and the render itself is studio-lit on pale grey.
    <div className="min-h-[100svh] bg-[#f5f5f7] text-charcoal">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-charcoal/[0.07] bg-[#f5f5f7]">
        <div className="flex h-14 items-center justify-between px-6 sm:px-10">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-charcoal/[0.07]">
              <svg width="17" height="17" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 4L4 10.5l12 6 12-6L16 4z" fill="#2C2C2E" />
                <path d="M4 22l12 6 12-6" stroke="#2C2C2E" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
                <path d="M4 16l12 6 12-6" stroke="#2C2C2E" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
              </svg>
            </span>
            <span>
              <span className="block text-[11.5px] font-bold uppercase tracking-[0.1em] text-charcoal/85">
                P&amp;G Legal AI
              </span>
              <span className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-charcoal/38">Ready</span>
              </span>
            </span>
          </div>

          {/* The door is reachable immediately — never gated on the sequence. */}
          <Link
            href="/chat"
            className="rounded-lg px-3 py-2 text-[11px] font-medium text-charcoal/80 transition-colors duration-200 hover:bg-charcoal/[0.06] hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal/40"
          >
            Open the assistant
          </Link>
        </div>
      </header>

      <main className="pt-14">
        <GavelSequence />
      </main>

      <footer className="border-t border-charcoal/[0.07] px-6 py-10 sm:px-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[56ch] text-[11px] leading-relaxed text-charcoal/72">
            <span className="font-medium text-charcoal/90">For research only — not legal advice.</span>{' '}
            P&amp;G Legal AI is an internal research instrument and may make
            errors. Verify every answer against its cited source and with a
            qualified solicitor before it reaches a client.
          </p>
          <p className="shrink-0 text-[11px] text-charcoal/72">Perchstone &amp; Graeys</p>
        </div>
      </footer>
    </div>
  );
}
