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

describe('submitResearchJob backoff schedule', () => {
  // Computed from POLL_MIN_MS=3000, POLL_MAX_MS=12000, POLL_BACKOFF=1.35.
  // Delay after poll N: min(round(prev_delay * 1.35), 12000)

  // Expected poll fire times (cumulative ms from submission):
  // Poll 1: 3000 (initial delay)
  // Poll 2: 3000 + 4050 = 7050
  // Poll 3: 7050 + 5468 = 12518
  // Poll 4: 12518 + 7382 = 19900
  // Poll 5: 19900 + 9966 = 29866
  // Poll 6: 29866 + 12000 = 41866 (delay capped at max)

  it('second poll does not fire before backoff time', async () => {
    let pollCount = 0;
    stubFetch(url => {
      if (url.endsWith('/api/research')) {
        return { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' };
      }
      // Status check URL — count these
      pollCount++;
      return { jobId: 'job-9', status: 'RUNNING' };
    });

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Advance to just before poll 2 should fire (at 7050ms).
    // Poll 1 fires at 3000ms, so at 7000ms we should still have only 1 poll.
    await vi.advanceTimersByTimeAsync(7_000);
    expect(pollCount).toBe(1);

    // Advance past poll 2 fire time to 7100ms — now poll 2 should have fired.
    await vi.advanceTimersByTimeAsync(100);
    expect(pollCount).toBe(2);
  });

  it('delays grow across successive polls', async () => {
    let pollCount = 0;

    stubFetch(url => {
      if (url.endsWith('/api/research')) {
        return { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' };
      }
      // Status check — each counts as a poll.
      pollCount++;
      return { jobId: 'job-9', status: 'RUNNING' };
    });

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // With correct backoff:
    // Poll 1 at 3000ms, poll 2 at 7050ms, poll 3 at 12518ms
    // If backoff is broken (flat at POLL_MIN_MS), all would be 3000ms apart:
    // Poll 1 at 3000ms, poll 2 at 6000ms, poll 3 at 9000ms (poll 3 would fire before 12518)

    // Advance to 10000ms. With broken backoff, poll 3 would already be at 9000ms.
    // With correct backoff, poll 3 is still pending at 12518ms.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pollCount).toBe(2); // Only polls 1 and 2 should have fired

    // Advance to 13000ms. Now even correct backoff has reached poll 3.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pollCount).toBe(3);
  });

  it('delay is capped at POLL_MAX_MS', async () => {
    let pollCount = 0;
    const POLL_MAX_MS = 12_000;

    stubFetch(url => {
      if (url.endsWith('/api/research')) {
        return { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' };
      }
      pollCount++;
      return { jobId: 'job-9', status: 'RUNNING' };
    });

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Advance far enough to reach the cap (poll 6 at ~41866ms).
    await vi.advanceTimersByTimeAsync(42_000);

    // With cap, poll count should be at least 6.
    // Expected times: 3000, 7050, 12518, 19900, 29866, 41866
    expect(pollCount).toBeGreaterThanOrEqual(6);

    // Verify that the schedule doesn't jump ahead faster than the cap allows.
    // The interval between polls should never exceed POLL_MAX_MS + small slack for rounding.
    // If cap is broken, the 7th poll would come much sooner (backoff keeps growing).
    // With cap, the gap between 6th and 7th would be exactly 12000ms.

    // Reset and test that gap doesn't exceed cap: advance more and verify poll count
    // increases at a rate consistent with 12000ms intervals (the cap).
    __resetForTests();
    pollCount = 0;

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Advance to poll 6 time (41866ms), then add another 12000ms for poll 7.
    await vi.advanceTimersByTimeAsync(53_866);
    expect(pollCount).toBeGreaterThanOrEqual(7);
  });
});
