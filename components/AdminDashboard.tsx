'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PgIdentity, PgRole } from '@/lib/server/authSession';
import { BrandLockup } from '@/components/Brand';

type Account = PgIdentity & { enabled: boolean };
type AppSession = { sessionId: string; sub: string; email: string; startedAt: number; lastSeenAt: number; endedAt?: number; durationSeconds: number; active: boolean };
type Usage = { activeUsers: number; activeSessions: number; totalSessions: number; questionCount: number; inputTokens: number; outputTokens: number; usageKnownCount: number; usageUnknownCount: number; sessions: AppSession[] };
type Question = { eventId: string; email: string; question: string; kind: string; createdAt: number; inputTokens?: number; outputTokens?: number };

const roles: PgRole[] = ['regular_user', 'document_manager', 'admin'];
const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const roleLabel = (role: PgRole) => ({ regular_user: 'Regular user', document_manager: 'Document manager', admin: 'Admin' })[role];
const link = 'font-medium text-charcoal/80 underline decoration-ember/60 underline-offset-4 transition-colors hover:text-ember-deep';
const field = 'rounded-lg border border-charcoal/[0.1] bg-[#f5f5f7] px-3 py-2 text-[13px] text-charcoal';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend/app/admin/${path}`, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
}

export default function AdminDashboard({ identity }: { identity: PgIdentity }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PgRole>('regular_user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [u, a, q] = await Promise.all([
        api<Usage>('usage'),
        api<{ users: Account[] }>('users'),
        api<{ questions: Question[]; nextCursor: string | null }>('questions'),
      ]);
      setUsage(u); setAccounts(a.users); setQuestions(q.questions); setCursor(q.nextCursor); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Dashboard unavailable'); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
      setEmail(''); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invitation failed'); }
    finally { setBusy(false); }
  }

  async function updateAccount(account: Account, nextRole?: PgRole) {
    setBusy(true); setError('');
    try {
      await api(`users/${encodeURIComponent(account.email)}`, {
        method: nextRole ? 'PATCH' : 'DELETE',
        headers: nextRole ? { 'Content-Type': 'application/json' } : undefined,
        body: nextRole ? JSON.stringify({ role: nextRole }) : undefined,
      });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Account update failed'); }
    finally { setBusy(false); }
  }

  async function moreQuestions() {
    if (!cursor) return;
    try {
      const page = await api<{ questions: Question[]; nextCursor: string | null }>(`questions?cursor=${encodeURIComponent(cursor)}`);
      setQuestions(previous => [...previous, ...page.questions]); setCursor(page.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Questions unavailable'); }
  }

  const adminCount = accounts.filter(a => a.role === 'admin').length;
  const tokenTotal = usage ? usage.inputTokens + usage.outputTokens : undefined;
  const figures: [string, number | undefined][] = [
    ['Active users', usage?.activeUsers],
    ['Active sessions', usage?.activeSessions],
    ['Questions · 30 days', usage?.questionCount],
    ['Known model tokens', tokenTotal],
  ];

  return (
    <main className="min-h-dvh bg-[#f5f5f7] text-charcoal lining-nums">
      <header className="border-b border-charcoal/[0.07] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-10">
          <BrandLockup className="w-[170px] sm:w-[200px]" />
          <nav className="flex items-center gap-5 text-[12px]">
            <span className="hidden text-charcoal/60 sm:inline">{identity.email}</span>
            <a href="/chat" className={link}>Open chat</a>
            <form action="/api/auth/logout" method="post"><button className={link}>Sign out</button></form>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 md:px-10">
        <h1 className="text-[22px] font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-[13px] text-charcoal/72">Accounts, sign-ins and usage for Legal AI. Refreshes every 30 seconds.</p>

        {error && <p role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">{error}</p>}

        {/* Ledger of headline figures: one ruled strip, not a row of cards. */}
        <dl className="mt-8 grid grid-cols-2 border-y border-charcoal/[0.09] lg:grid-cols-4">
          {figures.map(([label, value], index) => (
            <div key={label} className={`py-5 pr-4 ${index % 2 ? 'pl-4 border-l border-charcoal/[0.07]' : ''} ${index === 2 ? 'border-t border-charcoal/[0.07] lg:border-t-0 lg:border-l lg:pl-4' : ''} ${index === 3 ? 'border-t border-charcoal/[0.07] lg:border-t-0' : ''}`}>
              <dt className="text-[11px] font-medium text-charcoal/60">{label}</dt>
              <dd className="mt-1.5 text-[22px] font-bold tabular-nums tracking-tight">{value?.toLocaleString() ?? '—'}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-charcoal/60">
          Active means activity within the last two minutes. Known tokens cover {usage?.usageKnownCount ?? '—'} questions;
          {' '}{usage?.usageUnknownCount ?? '—'} have unavailable or incomplete token data.
        </p>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[14px] font-bold">People</h2>
              <p className="mt-1 text-[12px] text-charcoal/60">{accounts.length} of 10 accounts · {adminCount} of 2 admins</p>
            </div>
            <div className="flex gap-1" aria-label={`${accounts.length} of 10 accounts used`} role="img">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`h-3 w-1.5 rounded-full ${i < accounts.length ? 'bg-charcoal/70' : 'bg-charcoal/[0.12]'}`} />
              ))}
            </div>
          </div>

          <form onSubmit={invite} className="mt-5 flex flex-wrap gap-2 rounded-xl border border-charcoal/[0.07] bg-white p-2">
            <input aria-label="Invite email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@perchstonegraeys.com" className={`${field} min-w-56 flex-1`} />
            <select aria-label="Invite role" value={role} onChange={e => setRole(e.target.value as PgRole)} className={field}>
              {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <button disabled={busy || accounts.length >= 10} className="rounded-lg bg-ember px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ember-deep disabled:bg-charcoal/20">
              Send invitation
            </button>
          </form>

          <ul className="mt-4 divide-y divide-charcoal/[0.07] border-y border-charcoal/[0.07]">
            {accounts.map(account => (
              <li key={account.email} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
                <span className="min-w-0 truncate">
                  {account.email}
                  {account.sub === identity.sub && <span className="ml-2 text-[11px] text-charcoal/60">you</span>}
                </span>
                <div className="flex items-center gap-4">
                  <select aria-label={`Role for ${account.email}`} value={account.role} disabled={busy} onChange={e => void updateAccount(account, e.target.value as PgRole)} className={`${field} py-1.5`}>
                    {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                  <button disabled={busy || account.sub === identity.sub} onClick={() => void updateAccount(account)} className="text-[12px] font-medium text-red-700 underline-offset-4 hover:underline disabled:text-charcoal/30 disabled:no-underline">
                    Disable
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-[14px] font-bold">Sign-ins</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-charcoal/[0.07] bg-white">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-charcoal/[0.07] text-[11px] text-charcoal/60">
                  {['User', 'Signed in', 'Last activity', 'Duration', 'Status'].map(h => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal/[0.06]">
                {usage?.sessions.map(s => (
                  <tr key={s.sessionId}>
                    <td className="px-4 py-2.5">{s.email}</td>
                    <td className="px-4 py-2.5 tabular-nums text-charcoal/72">{date(s.startedAt)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-charcoal/72">{date(s.lastSeenAt)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-charcoal/72">{duration(s.durationSeconds)}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-charcoal/25'}`} />
                        {s.active ? 'Active' : s.endedAt ? 'Signed out' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usage && usage.sessions.length === 0 && <p className="px-4 py-6 text-[13px] text-charcoal/60">No sign-ins in the last 30 days.</p>}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-[14px] font-bold">Questions</h2>
          <div className="mt-4 divide-y divide-charcoal/[0.07] border-y border-charcoal/[0.07]">
            {questions.map(q => (
              <article key={q.eventId} className="py-4">
                <div className="flex flex-wrap justify-between gap-2 text-[11px] text-charcoal/60">
                  <span>{q.email} · {q.kind.replace('_', ' ')} · {date(q.createdAt)}</span>
                  <span className="tabular-nums">{q.inputTokens === undefined || q.outputTokens === undefined ? 'Tokens unknown' : `${q.inputTokens.toLocaleString()} in / ${q.outputTokens.toLocaleString()} out`}</span>
                </div>
                <p className="mt-1.5 max-w-[75ch] whitespace-pre-wrap text-[13px] leading-relaxed">{q.question}</p>
              </article>
            ))}
            {questions.length === 0 && <p className="py-6 text-[13px] text-charcoal/60">No questions recorded yet.</p>}
          </div>
          {cursor && <button onClick={() => void moreQuestions()} className={`mt-4 text-[12px] ${link}`}>Load more</button>}
        </section>
      </div>
    </main>
  );
}
