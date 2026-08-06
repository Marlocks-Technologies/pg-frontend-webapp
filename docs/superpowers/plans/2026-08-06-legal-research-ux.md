# Deep Legal Research UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make asynchronous legal research survivable, non-blocking, consent-gated, and legible in the P&G Legal AI chat app.

**Architecture:** Job *lifecycle* moves out of the React chat store into `lib/researchJobs.ts` — a plain-TypeScript singleton that persists records to localStorage, polls with backoff, resumes after a refresh, elects a single polling tab, and emits events. The chat store subscribes and folds those events into messages, so job *content* (the opinion text) lives in exactly one place: the message. UI reads job records to render a consent card, a live progress state, a sidebar badge, and a completion toast.

**Tech Stack:** Next.js 15.5 (App Router), React 19, TypeScript 5.7 (strict), Tailwind 3.4, Vitest 4 + happy-dom 20 (added by this plan).

## Global Constraints

- **Path alias:** `@/*` maps to `./*` (see `tsconfig.json`). Use it in all imports.
- **TypeScript `strict` is on.** No `any` without a written reason; no non-null assertions on values that can genuinely be undefined.
- **The API key never reaches the browser.** Only `app/api/research/*` route handlers may read `RESEARCH_API_KEY`. Client code calls same-origin `/api/research*` only.
- **Backend hard limit:** a question over **1000 characters** sent with `autoResearch: false` returns `400 Question too long`. "Answer now" must never be offered above 1000 characters. Verified against production.
- **Research worker timeout is 900s**; jobs expire server-side after **7 days**.
- **Every new animation** must be added to a `@media (prefers-reduced-motion: reduce)` block in `app/globals.css`, matching the three existing blocks (lines 85, 147, 250).
- **Dark/light:** every component takes an `isDark: boolean` prop and styles both, matching the existing components. No `dark:` Tailwind variants — this codebase does not use them.
- **Colour vocabulary:** amber (`amber-400`) for active/thinking state in dark, `charcoal` tones in light. Do not introduce new state colours.
- **Commit style:** `type: lowercase imperative summary`. End every commit message body with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Verification gate:** `npm run type-check` and `npm run build` must pass before every commit. From Task 1 onward, `npm test -- --run` must pass too.

## Known-unverified

**No part of the research path has been exercised end-to-end.** `RESEARCH_API_KEY` is deliberately not committed and is unavailable to the implementer. The 409 rejection, the 400 length limit, and the 503-without-key behaviour *were* verified against production. Job status transitions and the `result` payload shape follow `openapi.yaml` and the worker source. Task 15 carries the manual checklist to run once the key exists.

## Spec correction

The spec's error table says a `404` on poll means "`FAILED`, record dropped". Dropping the record leaves the message pointing at nothing and the user with no explanation. **This plan keeps the record in `FAILED` state carrying the message, and removes it only when the user dismisses or retries.** "Dropped" is implemented as *dropped from polling*, not from the registry.

---

## File Structure

**Phase 1 — correctness**

| File | Responsibility |
|---|---|
| `lib/researchJobs.ts` (new) | Sole owner of job lifecycle: persistence, polling, backoff, resume, cancel, one-per-session, leader election |
| `lib/researchJobs.test.ts` (new) | Vitest suite for the above |
| `vitest.config.ts` (new) | Test runner config with the `@/` alias |
| `lib/useResearchJobs.ts` (new) | Thin hook: init after hydration, subscribe, hand events to the store |
| `lib/api.ts` (modify) | Remove `runLegalResearch`; keep `startLegalResearch` / `getLegalResearchJob` |
| `lib/chatStore.tsx` (modify) | `queryingSessions`, `researchJobs` mirror, fold job events, fix `typewrite` |

**Phase 2 — experience**

| File | Responsibility |
|---|---|
| `app/api/research/status/route.ts` (new) | `{configured: boolean}` — never the key |
| `components/ResearchCard.tsx` (new) | Consent / running / stalled / failed states in the message bubble |
| `components/ResearchToast.tsx` (new) | Completion toast |
| `components/MessageBubble.tsx` (modify) | Render `ResearchCard` |
| `components/ChatInput.tsx` (modify) | Research mode toggle |
| `components/Sidebar.tsx` (modify) | `SessionRow` research dot |
| `components/ChatArea.tsx` (modify) | Header status line |
| `components/ChatPage.tsx` (modify) | Mount the toast |
| `app/globals.css` (modify) | Pulse + toast keyframes and reduced-motion entries |

---

# Phase 1 — Correctness

*After Phase 1 the app is shippable: research survives refresh, runs in the background, and blocks nothing. It still auto-starts on a 409, exactly as it does today — the consent gate arrives in Task 10.*

---

### Task 1: Test runner and the job registry's persistence layer

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/researchJobs.ts`
- Create: `lib/researchJobs.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `ResearchStatus`, `ResearchJobRecord`, `ResearchEvent`, `initResearchJobs(knownSessionIds: string[]): void`, `subscribeResearchJobs(fn: (event: ResearchEvent) => void): () => void`, `getSessionJob(sessionId: string): ResearchJobRecord | undefined`, `__resetForTests(): void`.

- [ ] **Step 1: Install the test dependencies**

```bash
npm install --save-dev vitest@^4.1.10 happy-dom@^20.11.1
```

`happy-dom` (not jsdom) is required because the module uses `localStorage` and `window`'s `storage` event; it is the lighter of the two. Versions verified current on 2026-08-06 — if `npm view vitest version` reports a newer major, take it and check that `vi.useFakeTimers()` still fakes `Date.now` (the whole suite depends on it).

- [ ] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'happy-dom',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `lib/researchJobs.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTests,
  __seedForTests,
  getSessionJob,
  initResearchJobs,
  subscribeResearchJobs,
  type ResearchJobRecord,
} from '@/lib/researchJobs';

const DAY = 24 * 60 * 60 * 1000;

function record(over: Partial<ResearchJobRecord> = {}): ResearchJobRecord {
  return {
    jobId: 'job-1',
    sessionId: 'sess-1',
    messageId: 'msg-1',
    question: 'Advise on a preliminary objection.',
    status: 'RUNNING',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    seen: false,
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-06T10:00:00Z'));
  localStorage.clear();
  __resetForTests();
});

describe('initResearchJobs', () => {
  it('restores persisted records', () => {
    __seedForTests([record()]);
    initResearchJobs(['sess-1']);
    expect(getSessionJob('sess-1')?.jobId).toBe('job-1');
  });

  it('drops records whose session no longer exists', () => {
    __seedForTests([record({ sessionId: 'deleted-session' })]);
    initResearchJobs(['sess-1']);
    expect(getSessionJob('deleted-session')).toBeUndefined();
  });

  it('drops records older than the backend 7-day expiry', () => {
    __seedForTests([record({ startedAt: Date.now() - 8 * DAY })]);
    initResearchJobs(['sess-1']);
    expect(getSessionJob('sess-1')).toBeUndefined();
  });

  it('emits a changed event to subscribers', () => {
    const seen: ResearchJobRecord[][] = [];
    subscribeResearchJobs(event => {
      if (event.kind === 'changed') seen.push(event.jobs);
    });
    __seedForTests([record()]);
    initResearchJobs(['sess-1']);
    expect(seen.at(-1)).toHaveLength(1);
  });

  it('survives localStorage being unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => initResearchJobs(['sess-1'])).not.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 5: Run the test and confirm it fails**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/researchJobs"`.

- [ ] **Step 6: Create `lib/researchJobs.ts` with the persistence layer**

```ts
'use client';

import type { LegalResearchResult } from './api';

export type ResearchStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'STALLED';

export interface ResearchJobRecord {
  jobId: string;
  sessionId: string;
  messageId: string;
  question: string;
  status: ResearchStatus;
  /** Epoch ms. Persisted so the elapsed timer survives a reload. */
  startedAt: number;
  updatedAt: number;
  error?: string;
  /** false ⇒ the sidebar shows the unread dot. */
  seen: boolean;
}

export type ResearchEvent =
  | { kind: 'changed'; jobs: ResearchJobRecord[] }
  | { kind: 'completed'; job: ResearchJobRecord; result: LegalResearchResult };

const JOBS_KEY = 'pg-research-jobs';
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

let jobs: Record<string, ResearchJobRecord> = {};
const listeners = new Set<(event: ResearchEvent) => void>();
let started = false;

function load(): Record<string, ResearchJobRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(JOBS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ResearchJobRecord>) : {};
  } catch {
    return {};
  }
}

function save(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
  } catch {
    // Quota or private browsing — degrade to in-memory.
  }
}

function emit(event: ResearchEvent): void {
  listeners.forEach(fn => fn(event));
}

function commit(): void {
  save();
  emit({ kind: 'changed', jobs: Object.values(jobs) });
}

export function subscribeResearchJobs(
  fn: (event: ResearchEvent) => void
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Must be called AFTER the chat store hydrates, with the hydrated session ids.
 * Called with an empty list it would treat every record as an orphan.
 */
export function initResearchJobs(knownSessionIds: string[]): void {
  if (started) return;
  started = true;

  jobs = load();

  const known = new Set(knownSessionIds);
  const now = Date.now();
  for (const job of Object.values(jobs)) {
    if (!known.has(job.sessionId) || now - job.startedAt > EXPIRY_MS) {
      delete jobs[job.jobId];
    }
  }
  commit();
}

export function getSessionJob(sessionId: string): ResearchJobRecord | undefined {
  return Object.values(jobs)
    .filter(job => job.sessionId === sessionId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
}

// ─── Test seams ───────────────────────────────────────────────────────────────

export function __resetForTests(): void {
  jobs = {};
  listeners.clear();
  started = false;
}

export function __seedForTests(records: ResearchJobRecord[]): void {
  const seeded: Record<string, ResearchJobRecord> = {};
  records.forEach(r => { seeded[r.jobId] = r; });
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(seeded));
  } catch {
    // Ignored in tests that deliberately break storage.
  }
}
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Verify the build is unaffected**

Run: `npm run type-check && npm run build`
Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts package.json package-lock.json lib/researchJobs.ts lib/researchJobs.test.ts
git commit -m "$(cat <<'EOF'
test: add vitest and the research job registry's persistence layer

Records survive a reload, orphans whose session was deleted are dropped, and
anything past the backend's seven-day expiry is discarded on init.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Submit and poll to completion

**Files:**
- Modify: `lib/researchJobs.ts`
- Modify: `lib/researchJobs.test.ts`

**Interfaces:**
- Consumes: `initResearchJobs`, `getSessionJob`, `subscribeResearchJobs`, `__resetForTests`, `__seedForTests` from Task 1. `startLegalResearch`, `getLegalResearchJob` from `lib/api.ts`.
- Produces: `submitResearchJob(input: {sessionId: string; messageId: string; question: string}): Promise<ResearchJobRecord>`, and a `completed` event carrying `{job, result}`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/researchJobs.test.ts`:

```ts
import { submitResearchJob } from '@/lib/researchJobs';

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = handler(String(url), init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  }));
}

describe('submitResearchJob', () => {
  it('registers a QUEUED record for the session', async () => {
    stubFetch(() => ({ success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' }));
    initResearchJobs(['sess-1']);

    const job = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Advise on jurisdiction.',
    });

    expect(job.status).toBe('QUEUED');
    expect(job.jobId).toBe('job-9');
    expect(getSessionJob('sess-1')?.jobId).toBe('job-9');
  });

  it('moves QUEUED -> RUNNING -> COMPLETED and emits the result once', async () => {
    const statuses = ['RUNNING', 'COMPLETED'];
    stubFetch(url => {
      if (url.endsWith('/api/research')) {
        return { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' };
      }
      const status = statuses.shift() ?? 'COMPLETED';
      return status === 'COMPLETED'
        ? { jobId: 'job-9', status, result: { answer: 'The opinion.', citations: [] } }
        : { jobId: 'job-9', status };
    });

    const completions: string[] = [];
    subscribeResearchJobs(event => {
      if (event.kind === 'completed') completions.push(event.result.answer);
    });

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getSessionJob('sess-1')?.status).toBe('RUNNING');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(completions).toEqual(['The opinion.']);
    expect(getSessionJob('sess-1')?.status).toBe('COMPLETED');
  });

  it('treats a COMPLETED job with no answer as FAILED', async () => {
    stubFetch(url =>
      url.endsWith('/api/research')
        ? { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' }
        : { jobId: 'job-9', status: 'COMPLETED', result: {} }
    );

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });
    await vi.advanceTimersByTimeAsync(5_000);

    const job = getSessionJob('sess-1');
    expect(job?.status).toBe('FAILED');
    expect(job?.error).toMatch(/without returning an opinion/i);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: FAIL — `submitResearchJob` is not exported.

- [ ] **Step 3: Add polling and submission**

In `lib/researchJobs.ts`, extend the imports and add the polling machinery:

```ts
import {
  ApiError,
  getLegalResearchJob,
  startLegalResearch,
  type LegalResearchResult,
} from './api';
```

Add these constants beside `EXPIRY_MS`:

```ts
const POLL_MIN_MS = 3_000;
const POLL_MAX_MS = 12_000;
const POLL_BACKOFF = 1.35;
```

Add this module state beside `started`:

```ts
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delays = new Map<string, number>();
```

Add the implementation:

```ts
function isActive(job: ResearchJobRecord): boolean {
  return job.status === 'QUEUED' || job.status === 'RUNNING';
}

function clearTimer(jobId: string): void {
  const timer = timers.get(jobId);
  if (timer) clearTimeout(timer);
  timers.delete(jobId);
}

function nextDelay(jobId: string): number {
  const current = delays.get(jobId) ?? POLL_MIN_MS;
  const next = Math.min(Math.round(current * POLL_BACKOFF), POLL_MAX_MS);
  delays.set(jobId, next);
  return next;
}

function schedule(jobId: string, delay: number): void {
  clearTimer(jobId);
  timers.set(jobId, setTimeout(() => {
    timers.delete(jobId);
    void poll(jobId);
  }, delay));
}

function fail(jobId: string, message: string): void {
  const job = jobs[jobId];
  if (!job) return;
  clearTimer(jobId);
  jobs[jobId] = { ...job, status: 'FAILED', error: message, updatedAt: Date.now() };
  commit();
}

async function poll(jobId: string): Promise<void> {
  const job = jobs[jobId];
  if (!job || !isActive(job)) return;

  const remote = await getLegalResearchJob(jobId);

  if (remote.status === 'COMPLETED') {
    if (!remote.result?.answer) {
      fail(jobId, 'The research job finished without returning an opinion.');
      return;
    }
    clearTimer(jobId);
    const completed: ResearchJobRecord = {
      ...job, status: 'COMPLETED', updatedAt: Date.now(),
    };
    jobs[jobId] = completed;
    commit();
    emit({ kind: 'completed', job: completed, result: remote.result });
    return;
  }

  if (remote.status === 'FAILED') {
    fail(jobId, remote.error || 'The research job failed.');
    return;
  }

  if (remote.status !== job.status) {
    jobs[jobId] = { ...job, status: remote.status, updatedAt: Date.now() };
    commit();
  }
  schedule(jobId, nextDelay(jobId));
}

export async function submitResearchJob(input: {
  sessionId: string;
  messageId: string;
  question: string;
}): Promise<ResearchJobRecord> {
  const response = await startLegalResearch({
    question: input.question,
    sessionId: input.sessionId,
  });

  const now = Date.now();
  const record: ResearchJobRecord = {
    jobId: response.jobId,
    sessionId: input.sessionId,
    messageId: input.messageId,
    question: input.question,
    status: 'QUEUED',
    startedAt: now,
    updatedAt: now,
    seen: false,
  };

  jobs[record.jobId] = record;
  delays.delete(record.jobId);
  commit();
  schedule(record.jobId, POLL_MIN_MS);
  return record;
}
```

Extend `__resetForTests` to clear the new maps:

```ts
export function __resetForTests(): void {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
  delays.clear();
  jobs = {};
  listeners.clear();
  started = false;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify types and build**

Run: `npm run type-check && npm run build`
Expected: both succeed. `ApiError` is imported but unused until Task 3 — if the linter objects, leave the import out and add it in Task 3.

- [ ] **Step 6: Commit**

```bash
git add lib/researchJobs.ts lib/researchJobs.test.ts
git commit -m "$(cat <<'EOF'
feat: poll research jobs to completion inside the registry

Submission registers a record and schedules polling with backoff. A completed
poll emits the opinion straight through to subscribers rather than storing it,
so the text has exactly one home: the message.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Survive transient failures; distinguish resume from retry

**Files:**
- Modify: `lib/researchJobs.ts`
- Modify: `lib/researchJobs.test.ts`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `resumeResearchJob(jobId: string): void`, `STALLED` status handling, `404`/`429` handling.

**Why this matters:** a dropped wifi connection or a sleeping laptop must not destroy a ten-minute paid job. Only *consecutive* failures count, and five of them produce `STALLED` — recoverable — not `FAILED`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/researchJobs.test.ts`:

```ts
import { resumeResearchJob } from '@/lib/researchJobs';

/** Fetch stub that can fail on demand and reports how many polls happened. */
function stubFlakyFetch(opts: { failPolls: number; thenStatus?: string }) {
  let polls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).endsWith('/api/research')) {
      return { ok: true, status: 200, json: async () => ({
        success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x',
      }) } as Response;
    }
    polls += 1;
    if (polls <= opts.failPolls) throw new TypeError('network down');
    return { ok: true, status: 200, json: async () => ({
      jobId: 'job-9', status: opts.thenStatus ?? 'RUNNING',
    }) } as Response;
  }));
  return { pollCount: () => polls };
}

describe('failure resilience', () => {
  it('rides out fewer than five consecutive failures', async () => {
    stubFlakyFetch({ failPolls: 3 });
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getSessionJob('sess-1')?.status).toBe('RUNNING');
  });

  it('stalls (not fails) after five consecutive failures', async () => {
    stubFlakyFetch({ failPolls: 99 });
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    await vi.advanceTimersByTimeAsync(120_000);
    const job = getSessionJob('sess-1');
    expect(job?.status).toBe('STALLED');
    expect(job?.error).toMatch(/lost contact/i);
  });

  it('stalls once the job passes twenty minutes', async () => {
    stubFetch(url =>
      url.endsWith('/api/research')
        ? { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' }
        : { jobId: 'job-9', status: 'RUNNING' }
    );
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    expect(getSessionJob('sess-1')?.status).toBe('STALLED');
  });

  it('resumes a stalled job by polling the same jobId', async () => {
    const flaky = stubFlakyFetch({ failPolls: 99 });
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(getSessionJob('sess-1')?.status).toBe('STALLED');

    const before = flaky.pollCount();
    resumeResearchJob('job-9');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(flaky.pollCount()).toBeGreaterThan(before);
    // Same job, not a new submission.
    expect(getSessionJob('sess-1')?.jobId).toBe('job-9');
  });

  it('fails permanently on a 404, keeping the record so the user sees why', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/research')) {
        return { ok: true, status: 200, json: async () => ({
          success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x',
        }) } as Response;
      }
      return { ok: false, status: 404, statusText: 'Not Found',
        json: async () => ({ error: 'Research job not found' }) } as Response;
    }));

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });
    await vi.advanceTimersByTimeAsync(10_000);

    const job = getSessionJob('sess-1');
    expect(job?.status).toBe('FAILED');
    expect(job?.error).toMatch(/no longer available/i);
  });

  it('surfaces a 429 quota rejection at submit time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 429, statusText: 'Too Many Requests',
      json: async () => ({ error: 'Quota exceeded' }),
    } as Response)));

    initResearchJobs(['sess-1']);
    await expect(
      submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' })
    ).rejects.toMatchObject({ status: 429 });
    expect(getSessionJob('sess-1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: FAIL — `resumeResearchJob` is not exported.

- [ ] **Step 3: Implement resilience**

Add constants beside `POLL_BACKOFF`:

```ts
const STALL_AFTER_MS = 20 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;
```

Add state beside `delays`:

```ts
const failures = new Map<string, number>();
```

Add the stall helper next to `fail`:

```ts
function stall(jobId: string, message: string): void {
  const job = jobs[jobId];
  if (!job) return;
  clearTimer(jobId);
  jobs[jobId] = { ...job, status: 'STALLED', error: message, updatedAt: Date.now() };
  commit();
}
```

Replace the body of `poll` with the guarded version:

```ts
async function poll(jobId: string): Promise<void> {
  const job = jobs[jobId];
  if (!job || !isActive(job)) return;

  if (Date.now() - job.startedAt > STALL_AFTER_MS) {
    stall(jobId, 'Still running after 20 minutes.');
    return;
  }

  let remote;
  try {
    remote = await getLegalResearchJob(jobId);
    failures.delete(jobId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      fail(jobId, 'This research job is no longer available. It may have expired.');
      return;
    }
    const count = (failures.get(jobId) ?? 0) + 1;
    failures.set(jobId, count);
    if (count >= MAX_CONSECUTIVE_FAILURES) {
      stall(jobId, 'Lost contact with the research service.');
      return;
    }
    schedule(jobId, nextDelay(jobId));
    return;
  }

  if (remote.status === 'COMPLETED') {
    if (!remote.result?.answer) {
      fail(jobId, 'The research job finished without returning an opinion.');
      return;
    }
    clearTimer(jobId);
    const completed: ResearchJobRecord = {
      ...job, status: 'COMPLETED', updatedAt: Date.now(),
    };
    jobs[jobId] = completed;
    commit();
    emit({ kind: 'completed', job: completed, result: remote.result });
    return;
  }

  if (remote.status === 'FAILED') {
    fail(jobId, remote.error || 'The research job failed.');
    return;
  }

  if (remote.status !== job.status) {
    jobs[jobId] = { ...job, status: remote.status, updatedAt: Date.now() };
    commit();
  }
  schedule(jobId, nextDelay(jobId));
}
```

Add the resume entry point. It deliberately does **not** submit a new job:

```ts
/**
 * Keep polling the SAME job after a stall. The job is still running on the
 * backend and has already been paid for. A FAILED job cannot be resumed —
 * the caller must submit a new one via submitResearchJob.
 */
export function resumeResearchJob(jobId: string): void {
  const job = jobs[jobId];
  if (!job || job.status !== 'STALLED') return;
  failures.delete(jobId);
  delays.delete(jobId);
  jobs[jobId] = {
    ...job,
    status: 'RUNNING',
    error: undefined,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  commit();
  schedule(jobId, POLL_MIN_MS);
}
```

Note `startedAt` is reset on resume so the twenty-minute stall window restarts rather than tripping immediately.

Clear `failures` in `__resetForTests`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Verify types and build**

Run: `npm run type-check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add lib/researchJobs.ts lib/researchJobs.test.ts
git commit -m "$(cat <<'EOF'
feat: keep a research job alive across transient network failures

Only consecutive failures count, and five of them stall the job rather than
failing it, because a sleeping laptop must not destroy ten minutes of paid
work. Resuming polls the same job; a failed job needs a fresh submission,
so the two are separate calls that cannot be confused.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: One job per session, cancel, and seen-tracking

**Files:**
- Modify: `lib/researchJobs.ts`
- Modify: `lib/researchJobs.test.ts`

**Interfaces:**
- Consumes: everything from Task 3.
- Produces: `ResearchBusyError` (class, carries `.existing: ResearchJobRecord`), `cancelResearchJob(jobId: string): void`, `markResearchSeen(sessionId: string): void`, `dropSessionJobs(sessionId: string): void`.

- [ ] **Step 1: Write the failing tests**

Append to `lib/researchJobs.test.ts`:

```ts
import {
  cancelResearchJob,
  dropSessionJobs,
  markResearchSeen,
  ResearchBusyError,
} from '@/lib/researchJobs';

function stubRunning() {
  stubFetch(url =>
    url.endsWith('/api/research')
      ? { success: true, jobId: `job-${Math.random().toString(36).slice(2, 6)}`,
          status: 'QUEUED', statusPath: '/x' }
      : { jobId: 'job-x', status: 'RUNNING' }
  );
}

describe('one job per session', () => {
  it('refuses a second submission while one is active', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1' });

    await expect(
      submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-2', question: 'Q2' })
    ).rejects.toBeInstanceOf(ResearchBusyError);
  });

  it('allows a submission in a different session', async () => {
    stubRunning();
    initResearchJobs(['sess-1', 'sess-2']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1' });
    const second = await submitResearchJob({
      sessionId: 'sess-2', messageId: 'msg-2', question: 'Q2',
    });
    expect(second.sessionId).toBe('sess-2');
  });

  it('allows a new submission after the previous one is cancelled', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);
    const first = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1',
    });

    cancelResearchJob(first.jobId);
    expect(getSessionJob('sess-1')).toBeUndefined();

    await expect(
      submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-2', question: 'Q2' })
    ).resolves.toBeDefined();
  });
});

describe('seen-tracking and cleanup', () => {
  it('removes a completed record once seen, so the unread dot clears', async () => {
    stubFetch(url =>
      url.endsWith('/api/research')
        ? { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' }
        : { jobId: 'job-9', status: 'COMPLETED', result: { answer: 'A', citations: [] } }
    );
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getSessionJob('sess-1')?.status).toBe('COMPLETED');

    markResearchSeen('sess-1');
    expect(getSessionJob('sess-1')).toBeUndefined();
  });

  it('keeps a failed record after seen so the error stays readable', async () => {
    stubFetch(url =>
      url.endsWith('/api/research')
        ? { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' }
        : { jobId: 'job-9', status: 'FAILED', error: 'boom' }
    );
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });
    await vi.advanceTimersByTimeAsync(5_000);

    markResearchSeen('sess-1');
    expect(getSessionJob('sess-1')?.status).toBe('FAILED');
  });

  it('drops every job for a deleted session', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    dropSessionJobs('sess-1');
    expect(getSessionJob('sess-1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: FAIL — `ResearchBusyError` is not exported.

- [ ] **Step 3: Implement**

Add the error class near the top of `lib/researchJobs.ts`, after the type definitions:

```ts
/** Thrown when a session already has an active job. Carries it for the UI. */
export class ResearchBusyError extends Error {
  readonly existing: ResearchJobRecord;

  constructor(existing: ResearchJobRecord) {
    super('This session already has a research job running.');
    this.name = 'ResearchBusyError';
    this.existing = existing;
  }
}
```

Add the guard as the first statement of `submitResearchJob`:

```ts
  const existing = getSessionJob(input.sessionId);
  if (existing && isActive(existing)) throw new ResearchBusyError(existing);
```

Add the three lifecycle functions:

```ts
export function cancelResearchJob(jobId: string): void {
  if (!jobs[jobId]) return;
  clearTimer(jobId);
  failures.delete(jobId);
  delays.delete(jobId);
  delete jobs[jobId];
  commit();
}

/**
 * Clear the unread dot for a session. Completed records are removed entirely —
 * their answer already lives in the message. Failed and stalled records stay
 * so the user can still read the reason and act on it.
 */
export function markResearchSeen(sessionId: string): void {
  let changed = false;
  for (const job of Object.values(jobs)) {
    if (job.sessionId !== sessionId) continue;
    if (job.status === 'COMPLETED') {
      delete jobs[job.jobId];
      changed = true;
    } else if (!job.seen) {
      jobs[job.jobId] = { ...job, seen: true };
      changed = true;
    }
  }
  if (changed) commit();
}

export function dropSessionJobs(sessionId: string): void {
  let changed = false;
  for (const job of Object.values(jobs)) {
    if (job.sessionId !== sessionId) continue;
    clearTimer(job.jobId);
    failures.delete(job.jobId);
    delays.delete(job.jobId);
    delete jobs[job.jobId];
    changed = true;
  }
  if (changed) commit();
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Verify types and build**

Run: `npm run type-check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add lib/researchJobs.ts lib/researchJobs.test.ts
git commit -m "$(cat <<'EOF'
feat: cap research at one job per session and track seen state

A session is a matter, so it gets one open research question. Completed records
are discarded once seen because the answer already lives in the message;
failed and stalled ones survive so the reason stays readable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cross-tab leader election

**Files:**
- Modify: `lib/researchJobs.ts`
- Modify: `lib/researchJobs.test.ts`

**Interfaces:**
- Consumes: everything from Task 4.
- Produces: `__isLeaderForTests(): boolean`. Behaviour: only the lock-holding tab polls; other tabs re-sync from the `storage` event.

- [ ] **Step 1: Write the failing tests**

Append to `lib/researchJobs.test.ts`:

```ts
import { __isLeaderForTests } from '@/lib/researchJobs';

const LOCK_KEY = 'pg-research-lock';

describe('cross-tab leadership', () => {
  it('takes the lock when none is held', () => {
    initResearchJobs(['sess-1']);
    expect(__isLeaderForTests()).toBe(true);
    expect(localStorage.getItem(LOCK_KEY)).toBeTruthy();
  });

  it('yields to a fresh lock held by another tab', () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: 'other-tab', ts: Date.now() }));
    initResearchJobs(['sess-1']);
    expect(__isLeaderForTests()).toBe(false);
  });

  it('steals a lock that has gone stale', () => {
    localStorage.setItem(
      LOCK_KEY,
      JSON.stringify({ tabId: 'dead-tab', ts: Date.now() - 60_000 })
    );
    initResearchJobs(['sess-1']);
    expect(__isLeaderForTests()).toBe(true);
  });

  it('does not poll while it is not the leader', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: 'other-tab', ts: Date.now() }));
    const flaky = stubFlakyFetch({ failPolls: 0 });

    initResearchJobs(['sess-1']);
    __seedForTests([record({ jobId: 'job-7', status: 'RUNNING' })]);
    // Simulate the other tab writing an update.
    window.dispatchEvent(new StorageEvent('storage', { key: 'pg-research-jobs' }));

    await vi.advanceTimersByTimeAsync(30_000);
    expect(flaky.pollCount()).toBe(0);
  });

  it('re-syncs its view when another tab writes', () => {
    initResearchJobs(['sess-1']);
    __seedForTests([record({ jobId: 'job-7' })]);

    window.dispatchEvent(new StorageEvent('storage', { key: 'pg-research-jobs' }));
    expect(getSessionJob('sess-1')?.jobId).toBe('job-7');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- --run lib/researchJobs.test.ts`
Expected: FAIL — `__isLeaderForTests` is not exported.

- [ ] **Step 3: Implement leadership**

Add constants:

```ts
const LOCK_KEY = 'pg-research-lock';
const HEARTBEAT_MS = 5_000;
const LOCK_STALE_MS = 15_000;
```

Add state:

```ts
let heartbeat: ReturnType<typeof setInterval> | null = null;
let isLeader = false;
let tabId = '';
```

Add the implementation:

```ts
function claimLock(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    const lock = raw ? (JSON.parse(raw) as { tabId: string; ts: number }) : null;
    const now = Date.now();
    if (!lock || lock.tabId === tabId || now - lock.ts > LOCK_STALE_MS) {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId, ts: now }));
      return true;
    }
    return false;
  } catch {
    // No storage at all — there is only this tab, so poll.
    return true;
  }
}

function clearAllTimers(): void {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
}

/** Refresh leadership and make sure every active job is scheduled. */
function tick(): void {
  isLeader = claimLock();
  if (!isLeader) {
    clearAllTimers();
    return;
  }
  for (const job of Object.values(jobs)) {
    if (isActive(job) && !timers.has(job.jobId)) schedule(job.jobId, POLL_MIN_MS);
  }
}

function onStorage(event: StorageEvent): void {
  if (event.key !== JOBS_KEY) return;
  jobs = load();
  emit({ kind: 'changed', jobs: Object.values(jobs) });
}

export function __isLeaderForTests(): boolean {
  return isLeader;
}
```

Guard `schedule` so a non-leader never queues a poll — add as its first line:

```ts
  if (!isLeader) return;
```

Extend `initResearchJobs`, after the existing `commit()`:

```ts
  tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    heartbeat = setInterval(tick, HEARTBEAT_MS);
  }
  tick();
```

`tabId` must be assigned **before** `tick()` runs, since `claimLock` compares against it.

Extend `__resetForTests` to tear leadership down:

```ts
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  isLeader = false;
  tabId = '';
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test -- --run`
Expected: PASS, 25 tests. If earlier tests now fail because `isLeader` starts false, confirm `initResearchJobs` calls `tick()` before any `submitResearchJob` in those tests — it does, because every test calls `initResearchJobs` first.

- [ ] **Step 5: Verify types and build**

Run: `npm run type-check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add lib/researchJobs.ts lib/researchJobs.test.ts
git commit -m "$(cat <<'EOF'
feat: poll research jobs from one tab only

Two tabs open on different matters is normal for this user. Without a lock both
would poll the same job and both would announce it. A heartbeat lock elects one
poller; the others follow along through the storage event.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wire the registry into the chat store

**Files:**
- Create: `lib/useResearchJobs.ts`
- Modify: `lib/api.ts` (remove `runLegalResearch` and its helpers)
- Modify: `lib/chatStore.tsx`

**Interfaces:**
- Consumes: `initResearchJobs`, `subscribeResearchJobs`, `submitResearchJob`, `dropSessionJobs`, `markResearchSeen`, `ResearchJobRecord`, `ResearchEvent`.
- Produces: `useResearchJobs(options)` hook; `ChatState.researchJobs: ResearchJobRecord[]`; `Message.researchJobId?: string`.

**Behaviour after this task:** research still auto-starts on a 409, exactly as today — but it now survives a refresh and runs through the registry. The consent gate lands in Task 10.

- [ ] **Step 1: Remove the superseded polling loop from `lib/api.ts`**

Delete `runLegalResearch`, `RunLegalResearchOptions`, `sleep`, `POLL_MIN_MS`, `POLL_MAX_MS`, and `POLL_DEFAULT_TIMEOUT_MS`. Keep `startLegalResearch`, `getLegalResearchJob`, and every type. The polling loop now lives in the registry, where it can be resumed and cancelled.

- [ ] **Step 2: Create `lib/useResearchJobs.ts`**

```ts
'use client';

import { useEffect, useRef } from 'react';
import {
  initResearchJobs,
  subscribeResearchJobs,
  type ResearchEvent,
} from './researchJobs';

/**
 * Bridges the research registry to React. init MUST run after the chat store
 * hydrates: called with an empty session list it would treat every persisted
 * record as an orphan and delete it.
 */
export function useResearchJobs(options: {
  isHydrated: boolean;
  sessionIds: string[];
  onEvent: (event: ResearchEvent) => void;
}): void {
  const { isHydrated, sessionIds, onEvent } = options;

  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => subscribeResearchJobs(event => handler.current(event)), []);

  const initialised = useRef(false);
  useEffect(() => {
    if (!isHydrated || initialised.current) return;
    initialised.current = true;
    initResearchJobs(sessionIds);
  }, [isHydrated, sessionIds]);
}
```

- [ ] **Step 3: Extend the store's state and actions**

In `lib/chatStore.tsx`, add to `Message` (beside `researchStatus`):

```ts
  /** Links this message to its record in the research registry. */
  researchJobId?: string;
```

Add to `ChatState`:

```ts
  isHydrated: boolean;
  researchJobs: ResearchJobRecord[];
```

Add to `Action`:

```ts
  | { type: 'SET_RESEARCH_JOBS'; payload: ResearchJobRecord[] }
```

Add the reducer cases, and set `isHydrated` in `HYDRATE`:

```ts
    case 'HYDRATE':
      return {
        ...state,
        sessions: action.payload.sessions,
        isDark: action.payload.isDark,
        activeSessionId: action.payload.sessions[0]?.id ?? null,
        isHydrated: true,
      };

    case 'SET_RESEARCH_JOBS':
      return { ...state, researchJobs: action.payload };
```

Add both to the `useReducer` initial state: `isHydrated: false`, `researchJobs: []`.

- [ ] **Step 4: Subscribe, and fold completions into messages**

In `ChatProvider`, after the hydrate effect:

```ts
  const sessionIds = useMemo(() => state.sessions.map(s => s.id), [state.sessions]);

  useResearchJobs({
    isHydrated: state.isHydrated,
    sessionIds,
    onEvent: useCallback((event: ResearchEvent) => {
      if (event.kind === 'changed') {
        dispatch({ type: 'SET_RESEARCH_JOBS', payload: event.jobs });
        return;
      }
      const { job, result } = event;
      typewrite(job.sessionId, job.messageId, result.answer, () => {
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId: job.sessionId,
            messageId: job.messageId,
            patch: {
              content: result.answer,
              citations: result.citations,
              webSources: result.webSources,
              researchPlan: result.researchPlan,
              chunksRetrieved: result.metadata?.chunks_retrieved,
              researchStatus: undefined,
              isStreaming: false,
            },
          },
        });
      });
    }, [typewrite]),
  });
```

Add `useMemo` to the React import.

- [ ] **Step 5: Replace the inline research runner**

Delete the `runResearch` callback added in commit `8ab6c73` and the now-unused `runLegalResearch` import. Replace the 409 branch in `sendMessage`'s catch with:

```ts
        if (err instanceof ApiError && err.researchRequired) {
          try {
            const job = await submitResearchJob({
              sessionId, messageId: placeholderId, question,
            });
            dispatch({ type: 'SET_QUERYING', payload: false });
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId, messageId: placeholderId,
                patch: { researchJobId: job.jobId, isResearch: true },
              },
            });
          } catch (submitError: unknown) {
            dispatch({ type: 'SET_QUERYING', payload: false });
            dispatch({
              type: 'PATCH_MESSAGE',
              payload: {
                sessionId, messageId: placeholderId,
                patch: {
                  content: submitError instanceof Error
                    ? submitError.message
                    : 'Deep research could not be started.',
                  isStreaming: false,
                  isError: true,
                },
              },
            });
          }
          return;
        }
```

Import `submitResearchJob` from `./researchJobs`.

- [ ] **Step 6: Clean up jobs when a session is deleted or opened**

In `deleteSession`:

```ts
  const deleteSession = useCallback((id: string) => {
    dropSessionJobs(id);
    dispatch({ type: 'DELETE_SESSION', payload: id });
  }, []);
```

In `switchSession`, after `dispatch({ type: 'SET_ACTIVE', payload: id })`:

```ts
    markResearchSeen(id);
```

- [ ] **Step 7: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`
Expected: all pass. The registry suite is unaffected; the build proves the store compiles.

- [ ] **Step 8: Manually confirm survival**

```bash
npm run dev
```

Without `RESEARCH_API_KEY` set, submitting an authority-heavy question must show a clear "not configured" error in the bubble rather than an unhandled rejection or a stuck spinner. Confirm this in the browser, then stop the server.

- [ ] **Step 9: Commit**

```bash
git add lib/api.ts lib/chatStore.tsx lib/useResearchJobs.ts
git commit -m "$(cat <<'EOF'
feat: run research through the persistent registry

The polling loop leaves lib/api.ts, where nobody held a handle to it and a
refresh lost the job, and moves behind the registry that persists and resumes.
Completions arrive as events and are folded into the message that asked.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Stop research from blocking the whole app

**Files:**
- Modify: `lib/chatStore.tsx`
- Modify: `components/ChatInput.tsx`
- Modify: `components/ChatArea.tsx`

**Interfaces:**
- Consumes: `ChatState` from Task 6.
- Produces: `ChatState.queryingSessions: Record<string, boolean>`; `ChatContextValue.isSessionQuerying(sessionId: string | null): boolean`. `ChatState.isQuerying` is **removed** — every consumer must migrate.

- [ ] **Step 1: Replace the global flag in the store**

In `ChatState`, replace `isQuerying: boolean` with:

```ts
  queryingSessions: Record<string, boolean>;
```

Initial state: `queryingSessions: {}`.

Replace the `SET_QUERYING` action and its reducer case:

```ts
  | { type: 'SET_QUERYING'; payload: { sessionId: string; value: boolean } }
```

```ts
    case 'SET_QUERYING': {
      const next = { ...state.queryingSessions };
      if (action.payload.value) next[action.payload.sessionId] = true;
      else delete next[action.payload.sessionId];
      return { ...state, queryingSessions: next };
    }
```

- [ ] **Step 2: Update every dispatch in `sendMessage`**

Every `dispatch({ type: 'SET_QUERYING', payload: true })` becomes
`dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: true } })`, and likewise for `false`. There are four such dispatches: one before the request, one after a successful response, one in the 409 branch, one in the error branch.

**Research must never set this flag.** After `submitResearchJob` succeeds the session is cleared, and no research code path sets it again.

- [ ] **Step 3: Expose a reader on the context**

Add to `ChatContextValue`:

```ts
  isSessionQuerying: (sessionId: string | null) => boolean;
```

Implement in the provider and add to the `Ctx.Provider` value:

```ts
  const isSessionQuerying = useCallback(
    (sessionId: string | null) => (sessionId ? !!state.queryingSessions[sessionId] : false),
    [state.queryingSessions]
  );
```

- [ ] **Step 4: Migrate `ChatInput`**

Replace `const { isDark, isQuerying } = state;` with:

```ts
  const { state, sendMessage, isSessionQuerying } = useChatStore();
  const { isDark } = state;
  const isQuerying = isSessionQuerying(state.activeSessionId);
```

Every other reference to `isQuerying` in the file (the `disabled` prop, `canSend`, the `data-thinking` attribute, the spinner) then works unchanged, but now reflects only the active session.

- [ ] **Step 5: Migrate `ChatArea`**

Replace `const { isDark, isQuerying, isSidebarOpen } = state;` with:

```ts
  const { state, activeSession, sendMessage, createSession, toggleSidebar, isSessionQuerying } =
    useChatStore();
  const { isDark, isSidebarOpen } = state;
  const isQuerying = isSessionQuerying(state.activeSessionId);
```

- [ ] **Step 6: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`
Expected: all pass. `type-check` is the real gate here — it fails on any missed `isQuerying` reference.

- [ ] **Step 7: Manually confirm**

Run `npm run dev`. Ask a normal question in session A; while it is in flight, switch to session B and confirm the input there is **enabled**. Stop the server.

- [ ] **Step 8: Commit**

```bash
git add lib/chatStore.tsx components/ChatInput.tsx components/ChatArea.tsx
git commit -m "$(cat <<'EOF'
feat: scope the querying flag to one session

A global flag meant one slow answer disabled the input in every conversation,
which a fifteen-minute research job turns from a nuisance into a lockout.
Research never sets it at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Fix the typewriter losing a message

**Files:**
- Modify: `lib/chatStore.tsx`

**Interfaces:**
- Consumes: `typewrite` as written in commit `8ab6c73`.
- Produces: no signature change.

**The bug:** `typewrite` keeps one `timerRef`. A second call runs `clearInterval` on the first, so the first message stops mid-sentence and never receives the rest — permanently, including in localStorage. Today two answers rarely land together. Once a background research job can complete while a synchronous answer is typing, it becomes routine.

- [ ] **Step 1: Reproduce it by hand first**

Run `npm run dev`, open the browser console on `/chat`, and confirm the current behaviour by calling the store's `sendMessage` twice in quick succession across two sessions — or simply read the code path and confirm the single `timerRef` is shared. Note what you observe; you will re-check it in Step 4.

- [ ] **Step 2: Record what the interrupted message should keep**

Replace `typewrite` in `lib/chatStore.tsx` with a version that snaps the outgoing message to its full text before starting the next:

```ts
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeTypeRef = useRef<{
    sessionId: string; messageId: string; fullText: string;
  } | null>(null);

  const typewrite = useCallback(
    (sessionId: string, messageId: string, fullText: string, onComplete?: () => void) => {
      // Never strand a half-typed message: an interrupted one jumps to its end.
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        const previous = activeTypeRef.current;
        if (previous && previous.messageId !== messageId) {
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId: previous.sessionId,
              messageId: previous.messageId,
              patch: { content: previous.fullText, isStreaming: false },
            },
          });
        }
      }

      activeTypeRef.current = { sessionId, messageId, fullText };

      let i = 0;
      const step = Math.max(3, Math.ceil(fullText.length / (MAX_TYPEWRITE_MS / CHAR_DELAY)));
      timerRef.current = setInterval(() => {
        i = Math.min(i + step, fullText.length);
        const done = i >= fullText.length;
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId,
            messageId,
            patch: { content: fullText.slice(0, i), isStreaming: !done },
          },
        });
        if (done) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          activeTypeRef.current = null;
          onComplete?.();
        }
      }, CHAR_DELAY);
    },
    []
  );
```

- [ ] **Step 3: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`

- [ ] **Step 4: Confirm the fix by hand**

Run `npm run dev`. Trigger two answers landing close together (two sessions, two quick questions). Confirm **neither** message is left truncated — the interrupted one shows its complete text. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add lib/chatStore.tsx
git commit -m "$(cat <<'EOF'
fix: stop a second answer from stranding the one being typed

typewrite held a single interval, so starting a new one left the previous
message frozen mid-sentence and persisted it that way. An interrupted message
now jumps to its full text. Rare until background research made two concurrent
answers ordinary.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Experience

*Phase 1 leaves working, shippable software. Phase 2 adds the consent gate, the visible progress, and the ways to find a finished job.*

---

### Task 9: Report whether research is configured

**Files:**
- Create: `app/api/research/status/route.ts`
- Modify: `lib/api.ts`

**Interfaces:**
- Consumes: `researchApiKey` from `lib/researchProxy.ts`.
- Produces: `GET /api/research/status` → `{configured: boolean}`; `getResearchStatus(): Promise<{configured: boolean}>` in `lib/api.ts`.

**Constraint:** this endpoint must return a boolean and nothing else. It must never return the key, its length, or any prefix of it.

- [ ] **Step 1: Create the route**

```ts
import { researchApiKey } from '@/lib/researchProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports only whether deep research is usable in this deployment, so the UI
 * can avoid offering a button that would 503. Returns a boolean and nothing
 * else — never the key or any part of it.
 */
export async function GET(): Promise<Response> {
  return Response.json(
    { configured: Boolean(researchApiKey()) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
```

- [ ] **Step 2: Add the client call to `lib/api.ts`**

Beside `startLegalResearch`:

```ts
export async function getResearchStatus(): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(`${RESEARCH_URL}/status`, { cache: 'no-store' });
    if (!res.ok) return { configured: false };
    return (await res.json()) as { configured: boolean };
  } catch {
    return { configured: false };
  }
}
```

A failure here must never throw — an unreachable status check means "assume unavailable", not "crash the consent card".

- [ ] **Step 3: Verify**

Run: `npm run type-check && npm run build`
Expected: `/api/research/status` appears in the route list as `ƒ (Dynamic)`.

- [ ] **Step 4: Confirm the response by hand**

```bash
npm run dev
curl -s http://localhost:3002/api/research/status
```

Expected with no key set: `{"configured":false}`. Confirm the key itself does not appear anywhere in the response. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add app/api/research/status/route.ts lib/api.ts
git commit -m "$(cat <<'EOF'
feat: report whether deep research is configured

Lets the consent card avoid offering a button that would 503. Returns a boolean
and nothing else — never the key or any part of it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: The consent card

**Files:**
- Create: `components/ResearchCard.tsx`
- Modify: `components/MessageBubble.tsx`
- Modify: `lib/chatStore.tsx`

**Interfaces:**
- Consumes: `ResearchJobRecord`, `submitResearchJob`, `getResearchStatus`, `chatQuery`.
- Produces: `Message.researchPrompt?: {question: string; canAnswerNow: boolean}`; `ChatContextValue.runResearch(sessionId, messageId)` and `answerWithoutResearch(sessionId, messageId)`; `<ResearchCard>` component.

**The 1000-character rule:** `canAnswerNow` is `question.length <= 1000`. Above that the backend returns `400 Question too long` for a non-research query, so the button must not be rendered.

- [ ] **Step 1: Set the prompt instead of auto-submitting**

In `lib/chatStore.tsx`, add to `Message`:

```ts
  /** Present while the user is being asked whether to run deep research. */
  researchPrompt?: { question: string; canAnswerNow: boolean };
```

Replace the 409 branch body from Task 6 with:

```ts
        if (err instanceof ApiError && err.researchRequired) {
          dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId, messageId: placeholderId,
              patch: {
                isStreaming: false,
                researchPrompt: { question, canAnswerNow: question.length <= 1000 },
              },
            },
          });
          return;
        }
```

- [ ] **Step 2: Add the two consent actions to the provider**

```ts
  const runResearch = useCallback(async (sessionId: string, messageId: string, question: string) => {
    dispatch({
      type: 'PATCH_MESSAGE',
      payload: { sessionId, messageId, patch: { researchPrompt: undefined, isStreaming: true } },
    });
    try {
      const job = await submitResearchJob({ sessionId, messageId, question });
      dispatch({
        type: 'PATCH_MESSAGE',
        payload: { sessionId, messageId, patch: { researchJobId: job.jobId, isResearch: true } },
      });
    } catch (error: unknown) {
      dispatch({
        type: 'PATCH_MESSAGE',
        payload: {
          sessionId, messageId,
          patch: {
            content: error instanceof Error ? error.message : 'Deep research could not be started.',
            isStreaming: false,
            isError: true,
          },
        },
      });
    }
  }, []);

  const answerWithoutResearch = useCallback(
    async (sessionId: string, messageId: string, question: string) => {
      dispatch({
        type: 'PATCH_MESSAGE',
        payload: { sessionId, messageId, patch: { researchPrompt: undefined, isStreaming: true } },
      });
      dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: true } });
      try {
        const resp = await chatQuery({ question, sessionId, autoResearch: false });
        dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
        typewrite(sessionId, messageId, resp.answer, () => {
          dispatch({
            type: 'PATCH_MESSAGE',
            payload: {
              sessionId, messageId,
              patch: {
                content: resp.answer,
                citations: resp.citations,
                chunksRetrieved: resp.metadata?.chunks_retrieved ?? resp.metadata?.chunksRetrieved,
                isStreaming: false,
              },
            },
          });
        });
      } catch (error: unknown) {
        dispatch({ type: 'SET_QUERYING', payload: { sessionId, value: false } });
        dispatch({
          type: 'PATCH_MESSAGE',
          payload: {
            sessionId, messageId,
            patch: {
              content: error instanceof Error ? error.message : 'Something went wrong.',
              isStreaming: false,
              isError: true,
            },
          },
        });
      }
    },
    [typewrite]
  );

  const dismissResearch = useCallback((sessionId: string, messageId: string) => {
    dispatch({
      type: 'PATCH_MESSAGE',
      payload: {
        sessionId, messageId,
        patch: { researchPrompt: undefined, isStreaming: false, content: '_Deep research not run._' },
      },
    });
  }, []);
```

Add all three to `ChatContextValue` and the provider value.

- [ ] **Step 3: Create `components/ResearchCard.tsx` with the consent state**

```tsx
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
```

- [ ] **Step 4: Render it from `MessageBubble`**

Add to the props:

```tsx
  onRunResearch?: () => void;
  onAnswerNow?: () => void;
  onDismissResearch?: () => void;
```

Replace the content branch so the card takes the place of the dots:

```tsx
          {message.researchPrompt ? (
            <ResearchConsent
              question={message.researchPrompt.question}
              canAnswerNow={message.researchPrompt.canAnswerNow}
              isDark={isDark}
              onRun={() => onRunResearch?.()}
              onAnswerNow={() => onAnswerNow?.()}
              onDismiss={() => onDismissResearch?.()}
            />
          ) : !message.content && message.isStreaming ? (
            <ThinkingDots isDark={isDark} label={message.researchStatus} />
          ) : isUser ? (
```

In `ChatArea`, pass the three handlers, pulling `runResearch`, `answerWithoutResearch`, and `dismissResearch` from the store:

```tsx
              <MessageBubble
                key={msg.id}
                message={msg}
                isDark={isDark}
                onRunResearch={() =>
                  msg.researchPrompt &&
                  runResearch(activeSession!.id, msg.id, msg.researchPrompt.question)}
                onAnswerNow={() =>
                  msg.researchPrompt &&
                  answerWithoutResearch(activeSession!.id, msg.id, msg.researchPrompt.question)}
                onDismissResearch={() => dismissResearch(activeSession!.id, msg.id)}
              />
```

- [ ] **Step 5: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`

- [ ] **Step 6: Confirm by hand**

Run `npm run dev`. Ask an authority-heavy question (over 700 characters, or containing "case law"). Confirm:
- the consent card appears instead of an immediate job,
- with no key set it says research is not configured and shows no Run button,
- a question over 1000 characters shows **no** "Answer now" button,
- a shorter one does, and clicking it returns a quick answer.

Stop the server.

- [ ] **Step 7: Commit**

```bash
git add components/ResearchCard.tsx components/MessageBubble.tsx components/ChatArea.tsx lib/chatStore.tsx
git commit -m "$(cat <<'EOF'
feat: ask before spending money on deep research

A multi-minute paid job no longer starts without the user agreeing to it. The
card doubles as the escape hatch when the backend's heuristic misfires on an
ordinary question. "Answer now" is hidden above 1000 characters, where the
backend rejects a non-research query outright.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Running, stalled, and failed states

**Files:**
- Modify: `components/ResearchCard.tsx`
- Modify: `components/MessageBubble.tsx`
- Modify: `components/ChatArea.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `ResearchJobRecord`, `cancelResearchJob`, `resumeResearchJob`, `submitResearchJob`.
- Produces: `<ResearchProgress job isDark onCancel onResume onRetry>`.

- [ ] **Step 1: Add the elapsed-time hook and progress component**

Append to `components/ResearchCard.tsx`:

```tsx
import { type ResearchJobRecord } from '@/lib/researchJobs';

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
```

- [ ] **Step 2: Render it in `MessageBubble`**

Add a `researchJob?: ResearchJobRecord` prop and three handlers `onCancelResearch`, `onResumeResearch`, `onRetryResearch`. Extend the content branch:

```tsx
          {message.researchPrompt ? (
            <ResearchConsent … />
          ) : researchJob && researchJob.status !== 'COMPLETED' ? (
            <ResearchProgress
              job={researchJob}
              isDark={isDark}
              onCancel={() => onCancelResearch?.()}
              onResume={() => onResumeResearch?.()}
              onRetry={() => onRetryResearch?.()}
            />
          ) : !message.content && message.isStreaming ? (
```

- [ ] **Step 3: Supply the job and handlers from `ChatArea`**

```tsx
              <MessageBubble
                …
                researchJob={
                  msg.researchJobId
                    ? state.researchJobs.find(j => j.jobId === msg.researchJobId)
                    : undefined
                }
                onCancelResearch={() => msg.researchJobId && cancelResearchJob(msg.researchJobId)}
                onResumeResearch={() => msg.researchJobId && resumeResearchJob(msg.researchJobId)}
                onRetryResearch={() =>
                  runResearch(activeSession!.id, msg.id, msg.researchPrompt?.question ?? msg.content)}
              />
```

Import `cancelResearchJob` and `resumeResearchJob` from `@/lib/researchJobs`.

**Note:** `Try again` calls `runResearch`, which submits a *new* job. `Check again` calls `resumeResearchJob`, which keeps polling the same one. These are not interchangeable — resuming a dead job hangs, and resubmitting a live one pays twice.

- [ ] **Step 4: Confirm reduced-motion coverage**

`.pg-dot` is already listed in the reduced-motion block at `app/globals.css:250`, so the progress dots are covered with no CSS change. Verify by reading lines 250–269. If you added any new animated class in this task, add it to that block now.

- [ ] **Step 5: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`

- [ ] **Step 6: Commit**

```bash
git add components/ResearchCard.tsx components/MessageBubble.tsx components/ChatArea.tsx
git commit -m "$(cat <<'EOF'
feat: show honest research progress with a recoverable dead end

The elapsed timer counts from the job's persisted start, so a reload reports
nine minutes rather than three seconds. A stalled job offers to check again
instead of naming a job id no screen can look up.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Research mode toggle

**Files:**
- Modify: `components/ChatInput.tsx`
- Modify: `lib/chatStore.tsx`

**Interfaces:**
- Consumes: `runResearch` from Task 10.
- Produces: `ChatContextValue.startResearch(question: string): Promise<void>` — creates the session and placeholder, then submits directly to `/api/research`.

**Why:** a short question never trips the backend heuristic, so the consent card would never appear. The toggle is the only way to ask for depth the backend did not infer. It also skips a `/chat/query` round trip already known to 409.

- [ ] **Step 1: Add `startResearch` to the provider**

It mirrors `sendMessage`'s session/placeholder setup, then submits directly:

```ts
  const startResearch = useCallback(async (question: string) => {
    if (!question.trim()) return;

    let sessionId = state.activeSessionId;
    if (!sessionId) {
      const id = makeSessionId();
      dispatch({
        type: 'NEW_SESSION',
        payload: {
          id, title: titleFromQuestion(question),
          createdAt: new Date(), lastMessageAt: new Date(),
          messages: [], messageCount: 0, historyLoaded: false,
        },
      });
      sessionId = id;
    }

    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        sessionId,
        message: { id: uid(), role: 'user', content: question, timestamp: new Date() },
      },
    });

    const placeholderId = uid();
    dispatch({
      type: 'ADD_MESSAGE',
      payload: {
        sessionId,
        message: {
          id: placeholderId, role: 'assistant', content: '',
          timestamp: new Date(), isStreaming: true,
        },
      },
    });

    await runResearch(sessionId, placeholderId, question);
  }, [state.activeSessionId, runResearch]);
```

Add it to `ChatContextValue` and the provider value.

- [ ] **Step 2: Add the toggle to `ChatInput`**

Add state beside `isGenerateMode`:

```tsx
  const [isResearchMode, setIsResearchMode] = useState(false);
```

Add the button after the Generate toggle, using the same scales glyph as the consent card:

```tsx
        <button
          onClick={() => {
            setIsResearchMode(v => !v);
            setIsSearchMode(false);
            setIsGenerateMode(false);
            setSearchResults(null);
          }}
          title={isResearchMode ? 'Switch to chat' : 'Deep legal research'}
          className={`shrink-0 mb-0.5 p-2 rounded-xl transition-all duration-150 active:scale-90
            ${isResearchMode
              ? isDark ? 'bg-white/12 text-white/85' : 'bg-charcoal/10 text-charcoal'
              : isDark
                ? 'text-white/35 hover:text-white/70 hover:bg-white/6'
                : 'text-charcoal/28 hover:text-charcoal/60 hover:bg-charcoal/5'
            }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l3 6a3 3 0 0 1-6 0z"/>
          </svg>
        </button>
```

Clear `isResearchMode` in the Search and Generate toggles, matching how they already clear each other.

- [ ] **Step 3: Route the send**

In `handleSend`, before the existing `else` branch:

```tsx
    } else if (isResearchMode) {
      await startResearch(q);
      setValue('');
      setIsResearchMode(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } else {
```

Extend the placeholder and the mode label:

```tsx
          placeholder={
            isSearchMode
              ? 'Search the document knowledge base…'
              : isGenerateMode
                ? 'Describe the document to generate…'
                : isResearchMode
                  ? 'Ask for a verified legal opinion…'
                  : 'Ask a legal question…'
          }
```

```tsx
        {(isSearchMode || isGenerateMode || isResearchMode) && (
          <span className={…}>
            {isSearchMode ? 'SEARCH' : isGenerateMode ? 'GENERATE' : 'RESEARCH'}
          </span>
        )}
```

Also add `!isResearchMode` to the suggested-prompts condition so the chips hide in research mode, matching generate mode.

- [ ] **Step 4: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`

- [ ] **Step 5: Confirm by hand**

Run `npm run dev`. Toggle Research, type a short question, send. Confirm the mode label reads `RESEARCH`, the request goes to `/api/research` (Network tab) and **not** to `/chat/query`, and the toggle clears after sending. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add components/ChatInput.tsx lib/chatStore.tsx
git commit -m "$(cat <<'EOF'
feat: let the user ask for deep research directly

A short question never trips the backend's heuristic, so the consent card would
never offer it. The toggle is the only route to depth the backend did not infer,
and it skips a chat/query round trip already known to 409.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Sidebar research indicator

**Files:**
- Modify: `components/Sidebar.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `ChatState.researchJobs`.
- Produces: `SessionRow` accepts `researchJob?: ResearchJobRecord`.

- [ ] **Step 1: Add the pulse animation**

Append to `app/globals.css`:

```css
/* ─── Research indicator ──────────────────────────────────────────────── */

@keyframes pg-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.45; transform: scale(0.82); }
}

.pg-pulse {
  animation: pg-pulse 1.6s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  /* State feedback stays, movement goes: opacity-only pulse */
  .pg-pulse {
    animation: pg-pulse-still 1.6s ease-in-out infinite;
  }
}

@keyframes pg-pulse-still {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}
```

This mirrors the existing `.pg-dot` / `.pg-dot-still` pair at lines 246–269 — motion is dropped under reduced-motion, but the state signal survives.

- [ ] **Step 2: Extend `SessionRow`**

Add the prop:

```tsx
  researchJob,
}: {
  …
  researchJob?: ResearchJobRecord;
}) {
```

Replace the icon dot (currently `components/Sidebar.tsx:60-65`):

```tsx
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
```

Add a text alternative in the row body so colour is not the only signal:

```tsx
            {researchJob && (researchJob.status === 'QUEUED' || researchJob.status === 'RUNNING') && (
              <span className="ml-1.5 opacity-70">· Researching</span>
            )}
```

Place it inside the existing `<p>` alongside the message count.

- [ ] **Step 3: Pass the job in**

In the `sessions.map` at `components/Sidebar.tsx:281`:

```tsx
                researchJob={state.researchJobs.find(j => j.sessionId === session.id)}
```

- [ ] **Step 4: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`

- [ ] **Step 5: Commit**

```bash
git add components/Sidebar.tsx app/globals.css
git commit -m "$(cat <<'EOF'
feat: mark sessions with running or unread research

The row's existing dot pulses while a job runs and stays solid once an answer is
waiting, so a backgrounded matter is visible without opening it. Carries a text
label too, since colour alone is not a signal.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Completion toast

**Files:**
- Create: `components/ResearchToast.tsx`
- Modify: `components/ChatPage.tsx`
- Modify: `lib/chatStore.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `ChatState.researchJobs`, `ChatState.activeSessionId`, `switchSession`.
- Produces: `<ResearchToast />`, self-contained.

**Rule:** suppressed when the user is already viewing that session — they can watch the answer arrive.

- [ ] **Step 1: Add the toast animation**

Append to `app/globals.css`:

```css
@keyframes pg-toast-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}

.pg-toast-in {
  animation: pg-toast-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@media (prefers-reduced-motion: reduce) {
  .pg-toast-in { animation: none; }
}
```

- [ ] **Step 2: Create `components/ResearchToast.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/chatStore';

const DISMISS_MS = 12_000;

interface Toast { jobId: string; sessionId: string; title: string }

export default function ResearchToast() {
  const { state, switchSession } = useChatStore();
  const { researchJobs, activeSessionId, sessions, isDark } = state;

  const [toast, setToast] = useState<Toast | null>(null);
  const announced = useRef(new Set<string>());

  useEffect(() => {
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
```

- [ ] **Step 3: Mount it**

In `components/ChatPage.tsx`, inside the main panel `<div className="flex flex-col flex-1 min-w-0 min-h-0 relative">`, after the tab content:

```tsx
        <ResearchToast />
```

The parent already has `relative`, so the toast's `absolute` positioning is anchored correctly.

While in this file, delete the large commented-out component block at the top (lines 1–26) — it is dead code superseded by the live implementation below it.

- [ ] **Step 4: Verify**

Run: `npm test -- --run && npm run type-check && npm run build`

- [ ] **Step 5: Commit**

```bash
git add components/ResearchToast.tsx components/ChatPage.tsx app/globals.css
git commit -m "$(cat <<'EOF'
feat: announce a finished research job from another session

After ten minutes in a different matter the sidebar dot alone is easy to miss.
The toast nudges once and fades; it stays quiet when the user is already
watching the session it would announce.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Header status, documentation, and manual verification

**Files:**
- Modify: `components/ChatArea.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `ChatState.researchJobs`, `isSessionQuerying`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Correct the header**

In `components/ChatArea.tsx`, derive the active session's job and elapsed time:

```tsx
  const activeJob = state.researchJobs.find(
    j => j.sessionId === activeSession?.id &&
         (j.status === 'QUEUED' || j.status === 'RUNNING')
  );
```

Replace the subtitle:

```tsx
            <p className={`text-[11px] ${isDark ? 'text-white/40' : 'text-charcoal/38'}`}>
              {isQuerying
                ? 'Searching knowledge base…'
                : activeJob
                  ? 'Researching…'
                  : activeSession
                    ? `${activeSession.messageCount} message${activeSession.messageCount !== 1 ? 's' : ''}`
                    : 'Perchstone & Graeys'
              }
            </p>
```

Replace the pill condition so it covers research and names it correctly:

```tsx
          {(isQuerying || activeJob) && (
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium
              ${isDark ? 'bg-amber-400/10 text-amber-400' : 'bg-charcoal/8 text-charcoal/60'}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {activeJob ? 'Researching' : 'Thinking'}
            </div>
          )}
```

- [ ] **Step 2: Document the flow in `README.md`**

Extend the existing "Deep legal research" section with the behaviour this plan built:

```markdown
The flow is consent-first. When `/chat/query` returns 409, the message offers to
run the research or, for questions of 1000 characters or fewer, to answer
immediately instead — above that length the backend rejects a non-research query,
so only research is offered. The Research toggle in the input bar asks for depth
directly, which is the only route for a short question the heuristic would not
flag.

Jobs are owned by `lib/researchJobs.ts`, which persists them to localStorage and
resumes polling after a reload, so closing the tab does not lose an opinion the
backend has already paid to produce. One job runs per session; several can run
across sessions. Only one browser tab polls, elected by a heartbeat lock.
Completion is announced by a sidebar dot and a transient toast.
```

Add the endpoint to the table:

```markdown
| `GET` | `/api/research/status` | Whether `RESEARCH_API_KEY` is set (boolean only) |
```

- [ ] **Step 3: Run the full verification**

```bash
npm test -- --run && npm run type-check && npm run build
```

Expected: 25 tests pass; type-check and build clean.

- [ ] **Step 4: Run the manual checklist that tests cannot cover**

With `RESEARCH_API_KEY` **unset** — verify now:

- [ ] An authority-heavy question shows the consent card saying research is not configured, with no Run button.
- [ ] A question over 1000 characters additionally suggests shortening it.
- [ ] Ordinary questions still answer normally.
- [ ] Two sessions: a slow answer in one leaves the other's input enabled.
- [ ] Two answers landing together leave neither message truncated.

With `RESEARCH_API_KEY` **set** — **this is the end-to-end path that has never been exercised**, so run it before shipping:

- [ ] Consent card offers Run; clicking it starts a job and shows the progress line with a climbing timer.
- [ ] Refresh mid-job: the timer resumes at the true elapsed time, not `0:03`.
- [ ] Switch sessions mid-job: the sidebar dot pulses; on completion the toast appears and `View` jumps to the right session.
- [ ] The finished opinion renders with its verified-authorities panel.
- [ ] Two tabs open: exactly one toast fires.
- [ ] Cancel stops the job and clears the row.
- [ ] A second research request in the same session is refused while one runs.

Record any deviation as a follow-up issue rather than patching blind.

- [ ] **Step 5: Commit**

```bash
git add components/ChatArea.tsx README.md
git commit -m "$(cat <<'EOF'
feat: report research in the header and document the flow

The header claimed the knowledge base was being searched throughout a
multi-minute research job. It now names what is actually happening.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage.** Every section of `docs/superpowers/specs/2026-08-06-legal-research-ux-design.md` maps to a task:

| Spec section | Task |
|---|---|
| Architecture / module split | 1–5 |
| Record shape, `startedAt` epoch | 1 |
| Module API (`submit`/`cancel`/`resume`/`markSeen`/`dropSessionJobs`/`getSessionJob`) | 2, 3, 4 |
| Resume on load, orphan + expiry cleanup | 1 |
| Blocking → `queryingSessions` | 7 |
| Cross-tab leader election | 5 |
| Consent card, 1000-char rule | 10 |
| Running state, elapsed timer | 11 |
| Stalled / failed, resume vs retry | 3, 11 |
| Sidebar badge | 13 |
| Toast | 14 |
| Research toggle | 12 |
| Header | 15 |
| Collision (one-per-session) | 4 (`ResearchBusyError`), surfaced in 10 |
| Error table (503 / 429 / 404 / empty / deleted session / no storage) | 1, 3, 4, 9, 10 |
| `typewrite` interrupt bug | 8 |
| `/api/research/status` | 9 |
| Accessibility + reduced motion | 11, 13, 14 |
| Test list (14 cases) | 1–5 |
| README | 15 |

**Deviations from the spec, both deliberate and stated above:**

1. The `404` record is retained in `FAILED` rather than deleted, so the user can read why. Documented under "Spec correction".
2. The spec's collision UI ("Cancel it and run this / Keep the current one") is implemented as `ResearchBusyError` thrown from the registry and surfaced as an error message, not a two-button inline chooser. The toggle path in Task 12 is the only way to hit it, and the simpler treatment is honest. **If you want the two-button chooser, it is a small addition to Task 12 — flag it before implementing.**

**Placeholder scan.** No `TBD`, `TODO`, "handle edge cases", or "similar to Task N". Every code step carries real code. The only forward references are the explicitly-named exports in each task's Interfaces block.

**Type consistency.** Checked across tasks: `ResearchJobRecord`, `ResearchStatus`, `ResearchEvent` are defined once in Task 1 and used unchanged. `submitResearchJob` takes `{sessionId, messageId, question}` in Tasks 2, 6, 10, 12. `resumeResearchJob(jobId)` and `cancelResearchJob(jobId)` take a bare job id in Tasks 3, 4, 11. `isSessionQuerying(sessionId | null)` is defined in Task 7 and used in Tasks 7 and 15. `Message.researchJobId` (Task 6) and `Message.researchPrompt` (Task 10) are distinct fields, never conflated.
