'use client';

import {
  ApiError,
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

/** Thrown when a session already has an active job. Carries it for the UI. */
export class ResearchBusyError extends Error {
  readonly existing: ResearchJobRecord;

  constructor(existing: ResearchJobRecord) {
    super('This session already has a research job running.');
    this.name = 'ResearchBusyError';
    this.existing = existing;
  }
}

const JOBS_KEY = 'pg-research-jobs';
const ANNOUNCED_KEY = 'pg-research-announced';
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const POLL_MIN_MS = 3_000;
const POLL_MAX_MS = 12_000;
const POLL_BACKOFF = 1.35;
const STALL_AFTER_MS = 20 * 60 * 1000;
const MAX_CONSECUTIVE_FAILURES = 5;
const LOCK_KEY = 'pg-research-lock';
const HEARTBEAT_MS = 5_000;
const LOCK_STALE_MS = 15_000;

let jobs: Record<string, ResearchJobRecord> = {};
const listeners = new Set<(event: ResearchEvent) => void>();
let started = false;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const delays = new Map<string, number>();
const failures = new Map<string, number>();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let isLeader = false;
let tabId = '';

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

  tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
    heartbeat = setInterval(tick, HEARTBEAT_MS);
  }
  tick();
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

function schedule(jobId: string, delay: number): void {
  if (!isLeader) return;
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

function stall(jobId: string, message: string): void {
  const job = jobs[jobId];
  if (!job) return;
  clearTimer(jobId);
  jobs[jobId] = { ...job, status: 'STALLED', error: message, updatedAt: Date.now() };
  commit();
}

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
    // Re-check job existence in error path — it may have been cancelled or dropped.
    if (!jobs[jobId]) return;

    const count = (failures.get(jobId) ?? 0) + 1;
    failures.set(jobId, count);
    if (count >= MAX_CONSECUTIVE_FAILURES) {
      stall(jobId, 'Lost contact with the research service.');
      return;
    }
    schedule(jobId, nextDelay(jobId));
    return;
  }

  // Re-check the job after the network call — it may have been cancelled or dropped.
  const fresh = jobs[jobId];
  if (!fresh || !isActive(fresh)) return;

  if (remote.status === 'COMPLETED') {
    if (!remote.result?.answer) {
      fail(jobId, 'The research job finished without returning an opinion.');
      return;
    }
    clearTimer(jobId);
    const completed: ResearchJobRecord = {
      ...fresh, status: 'COMPLETED', updatedAt: Date.now(),
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

  if (remote.status !== fresh.status) {
    jobs[jobId] = { ...fresh, status: remote.status, updatedAt: Date.now() };
    commit();
  }
  schedule(jobId, nextDelay(jobId));
}

export async function submitResearchJob(input: {
  sessionId: string;
  messageId: string;
  question: string;
}): Promise<ResearchJobRecord> {
  const existing = getSessionJob(input.sessionId);
  if (existing && isActive(existing)) throw new ResearchBusyError(existing);

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

/**
 * Keep polling the SAME job after a stall. The job is still running on the
 * backend and has already been paid for. A FAILED job cannot be resumed —
 * the caller must submit a new one via submitResearchJob.
 *
 * Returns true if resumed. Returns false if the job doesn't exist or is not STALLED.
 * Throws ResearchBusyError if the session already has a different active job
 * (violates the one-job cap).
 */
export function resumeResearchJob(jobId: string): boolean {
  const job = jobs[jobId];
  if (!job || job.status !== 'STALLED') return false;

  // Check if the session has a different active job (would violate the one-job cap).
  const currentJob = getSessionJob(job.sessionId);
  if (currentJob && currentJob.jobId !== jobId && isActive(currentJob)) {
    throw new ResearchBusyError(currentJob);
  }

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
  return true;
}

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

// ─── Cross-tab announcement claim ──────────────────────────────────────────────
//
// The heartbeat lock above (claimLock/isLeader) decides which tab *polls* —
// it says nothing about which tab may *show a toast*. The leader can be a
// background tab the user isn't even looking at, so gating the toast on
// leadership would mean the visible tab sometimes never announces at all.
// Instead, every tab that notices a job go COMPLETED races to claim it here;
// whichever tab's write lands first wins and shows the toast, the rest don't.

function loadAnnounced(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ANNOUNCED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveAnnounced(map: Record<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(map));
  } catch {
    // Quota or private browsing — degrade to "every tab announces", which is
    // a duplicate toast, not a lost one.
  }
}

/**
 * First-come claim on a completed job's announcement. Returns true if this
 * call won the claim (the caller should show the toast); false if another
 * tab already claimed it.
 *
 * Entries are pruned to the same 7-day window as job expiry (`EXPIRY_MS`) —
 * an announcement flag has no reason to outlive the job it refers to, and
 * this keeps the map from growing without bound across a long-lived profile.
 */
export function claimAnnouncement(jobId: string): boolean {
  const map = loadAnnounced();
  if (map[jobId]) return false;

  const now = Date.now();
  map[jobId] = now;
  for (const [id, ts] of Object.entries(map)) {
    if (now - ts > EXPIRY_MS) delete map[id];
  }
  saveAnnounced(map);
  return true;
}

// ─── Test seams ───────────────────────────────────────────────────────────────

export function __resetForTests(): void {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
  delays.clear();
  failures.clear();
  jobs = {};
  listeners.clear();
  started = false;

  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  isLeader = false;
  tabId = '';
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

/**
 * Test-only: reports the size of the module-private bookkeeping maps without
 * exposing their contents. Used to detect leaked entries for jobIds that no
 * longer exist in `jobs` (e.g. a cancelled job whose in-flight rejecting
 * fetch still runs its catch branch).
 */
export function __getInternalStateSizesForTests(): {
  failures: number;
  delays: number;
  timers: number;
} {
  return { failures: failures.size, delays: delays.size, timers: timers.size };
}
