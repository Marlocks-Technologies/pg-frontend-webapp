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
