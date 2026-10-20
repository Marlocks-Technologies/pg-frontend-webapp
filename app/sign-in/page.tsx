import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandLockup, BrandMark, FIRM_NAME } from '@/components/Brand';
import { readSession } from '@/lib/server/authCookies';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `Sign in | ${FIRM_NAME} Legal AI`,
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await readSession()) redirect('/chat');
  const { error } = await searchParams;
  return (
    <main className="min-h-dvh bg-[#f5f5f7] text-charcoal lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* The column: the firm's pillar at architectural scale on its own orange. */}
      <section
        aria-hidden
        className="relative h-36 overflow-hidden bg-ember sm:h-44 lg:h-auto lg:min-h-dvh"
      >
        {/* Stands on the panel's floor like a real column; cropped on small screens. */}
        <div className="pg-pillar-rise absolute inset-0 flex items-end justify-end pr-[10%] text-white sm:pr-[14%] lg:justify-center lg:pr-0">
          <BrandMark variant="glyph" className="h-[135%] w-auto translate-y-[26%] lg:h-[68vh] lg:max-h-[620px] lg:translate-y-[16%]" />
        </div>
        <div className="absolute inset-x-10 top-10 hidden items-baseline justify-between gap-6 text-white lg:flex">
          <p className="text-[12px] font-semibold text-white">Legal AI</p>
          <p className="text-[11px] font-medium text-white/85">Internal · By invitation</p>
        </div>
      </section>

      <section className="flex min-h-[calc(100dvh-9rem)] flex-col px-6 py-10 sm:min-h-[calc(100dvh-11rem)] sm:px-10 lg:min-h-dvh lg:px-16 lg:py-14">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
          <BrandLockup className="w-[240px] sm:w-[280px]" />

          <div className="mt-12 border-t border-charcoal/[0.09] pt-10">
            <h1 className="text-[clamp(1.75rem,3.2vw,2.375rem)] font-bold leading-[1.08] tracking-[-0.025em] text-balance">
              Sign in to Legal&nbsp;AI
            </h1>
            <p className="mt-4 text-[14px] leading-[1.65] text-charcoal/72">
              Research grounded in the firm&apos;s knowledge base and Nigerian law. Access is by
              invitation — use the account your administrator set up for you.
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-pretty text-red-800">
              Sign-in could not be completed. Check the email address on your invitation and try again,
              or ask your administrator to resend it.
            </p>
          )}

          <a
            href="/api/auth/start"
            className="group mt-9 flex items-center justify-between rounded-xl bg-ember px-6 py-4 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-ember-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember"
          >
            Continue to sign in
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              <path d="M4 10h11m-4.5-4.5L15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <p className="mt-3 text-[12px] leading-relaxed text-charcoal/60">
            You&apos;ll continue to the firm&apos;s secure sign-in page, then return here.
          </p>

          <p className="mt-10 text-[13px] text-charcoal/72">
            Need access?{' '}
            <span className="text-charcoal">Contact your {FIRM_NAME} administrator.</span>
          </p>
        </div>

        <footer className="mx-auto mt-12 flex w-full max-w-[420px] items-center justify-between gap-4 border-t border-charcoal/[0.09] pt-5 text-[11px] text-charcoal/60">
          <span>For research only — not legal advice.</span>
          <Link href="/" className="font-medium text-charcoal/72 underline decoration-ember/60 underline-offset-4 transition-colors hover:text-ember-deep">
            Back to home
          </Link>
        </footer>
      </section>
    </main>
  );
}
