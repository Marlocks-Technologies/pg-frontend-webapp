'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PgIdentity, PgRole } from '@/lib/server/authSession';

type Account = PgIdentity & { enabled: boolean };
type AppSession = { sessionId: string; sub: string; email: string; startedAt: number; lastSeenAt: number; endedAt?: number; durationSeconds: number; active: boolean };
type Usage = { activeUsers: number; activeSessions: number; totalSessions: number; questionCount: number; inputTokens: number; outputTokens: number; usageKnownCount: number; usageUnknownCount: number; sessions: AppSession[] };
type Question = { eventId: string; email: string; question: string; kind: string; createdAt: number; inputTokens?: number; outputTokens?: number };

const roles: PgRole[] = ['regular_user', 'document_manager', 'admin'];
const date = (seconds: number) => new Date(seconds * 1000).toLocaleString();
const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

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

  return (
    <main className="min-h-screen bg-[#f5f5f3] p-5 text-[#252526] md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#666]">Perchstone & Graeys</p><h1 className="mt-2 text-3xl font-semibold">Admin dashboard</h1><p className="mt-1 text-sm text-[#666]">Signed in as {identity.email}</p></div>
          <div className="flex gap-4 text-sm"><a href="/chat" className="underline">Open chat</a><form action="/api/auth/logout" method="post"><button className="underline">Sign out</button></form></div>
        </header>
        {error && <p role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Active users', usage?.activeUsers], ['Active sessions', usage?.activeSessions],
            ['Questions (30 days)', usage?.questionCount], ['Known model tokens', usage ? usage.inputTokens + usage.outputTokens : undefined],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-[#ddd] bg-white p-5"><p className="text-xs text-[#666]">{label}</p><p className="mt-2 text-3xl font-semibold">{value ?? '—'}</p></div>)}
        </div>
        <p className="mt-3 text-xs text-[#666]">Active means a heartbeat within two minutes. Known tokens cover {usage?.usageKnownCount ?? '—'} questions; {usage?.usageUnknownCount ?? '—'} have unavailable or incomplete token data.</p>

        <section className="mt-10 rounded-xl border border-[#ddd] bg-white p-5"><h2 className="text-xl font-semibold">People <span className="text-sm font-normal text-[#666]">({accounts.length}/10)</span></h2>
          <form onSubmit={invite} className="mt-5 flex flex-wrap gap-2"><input aria-label="Invite email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="name@firm.com" className="min-w-56 flex-1 rounded-lg border p-2 text-sm" /><select aria-label="Invite role" value={role} onChange={e => setRole(e.target.value as PgRole)} className="rounded-lg border p-2 text-sm">{roles.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select><button disabled={busy} className="rounded-lg bg-[#252526] px-4 py-2 text-sm text-white disabled:opacity-50">Invite user</button></form>
          <div className="mt-5 divide-y">{accounts.map(account => <div key={account.email} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{account.email}</span><div className="flex items-center gap-3"><select aria-label={`Role for ${account.email}`} value={account.role} disabled={busy} onChange={e => void updateAccount(account, e.target.value as PgRole)} className="rounded border p-1">{roles.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}</select><button disabled={busy || account.sub === identity.sub} onClick={() => void updateAccount(account)} className="text-red-700 underline disabled:opacity-40">Disable</button></div></div>)}</div>
        </section>

        <section className="mt-8 rounded-xl border border-[#ddd] bg-white p-5"><h2 className="text-xl font-semibold">Login sessions</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead><tr className="border-b text-xs text-[#666]"><th className="p-2">User</th><th className="p-2">Logged in</th><th className="p-2">Last activity</th><th className="p-2">Duration</th><th className="p-2">Status</th></tr></thead><tbody>{usage?.sessions.map(s => <tr key={s.sessionId} className="border-b"><td className="p-2">{s.email}</td><td className="p-2">{date(s.startedAt)}</td><td className="p-2">{date(s.lastSeenAt)}</td><td className="p-2">{duration(s.durationSeconds)}</td><td className="p-2">{s.active ? 'Active' : s.endedAt ? 'Signed out' : 'Inactive'}</td></tr>)}</tbody></table></div></section>

        <section className="mt-8 rounded-xl border border-[#ddd] bg-white p-5"><h2 className="text-xl font-semibold">Questions</h2><div className="mt-4 space-y-3">{questions.map(q => <article key={q.eventId} className="border-b pb-3 text-sm"><div className="flex flex-wrap justify-between gap-2 text-xs text-[#666]"><span>{q.email} · {q.kind} · {date(q.createdAt)}</span><span>{q.inputTokens === undefined || q.outputTokens === undefined ? 'Tokens unknown' : `${q.inputTokens} input / ${q.outputTokens} output`}</span></div><p className="mt-1 whitespace-pre-wrap">{q.question}</p></article>)}</div>{cursor && <button onClick={() => void moreQuestions()} className="mt-4 text-sm underline">Load more</button>}</section>
      </div>
    </main>
  );
}
