'use client';

import {
  getLegalResearchJob,
  startLegalResearch,
  type LegalResearchResult,
} from './api';

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
const POLL_MIN_MS = 3_000;
const POLL_MAX_MS = 12_000;
const POLL_BACKOFF = 1.35;

let jobs: Record<string, ResearchJobRecord> = {};
const listeners = new Set<(event: ResearchEvent) => void>();
let started = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delays = new Map<string, number>();

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

// ─── Test seams ───────────────────────────────────────────────────────────────

export function __resetForTests(): void {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
  delays.clear();
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
