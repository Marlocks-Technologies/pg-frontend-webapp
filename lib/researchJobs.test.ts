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

describe('test harness storage', () => {
  it('supports length and key enumeration', () => {
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.length).toBe(2);
    expect([localStorage.key(0), localStorage.key(1)].sort()).toEqual(['a', 'b']);
    localStorage.clear();
    expect(localStorage.length).toBe(0);
  });
});
