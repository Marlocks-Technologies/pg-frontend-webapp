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
    localStorage.clear();
    pollCount = 0;

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Advance to poll 6 time (41866ms), then add another 12000ms for poll 7.
    await vi.advanceTimersByTimeAsync(53_866);
    expect(pollCount).toBeGreaterThanOrEqual(7);
  });
});

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

describe('cancellation during in-flight requests', () => {
  it('cancel during poll: record stays gone, no completed event fires, no reschedule', async () => {
    let pollCount = 0;
    const completions: string[] = [];
    subscribeResearchJobs(event => {
      if (event.kind === 'completed') completions.push(event.result.answer);
    });

    // Stub that lets us intercept after the fetch starts but before it resolves.
    let resolveStatusFetch: ((value: unknown) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/research')) {
        return { ok: true, status: 200, json: async () => ({
          success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x',
        }) } as Response;
      }
      // Status check — hang until we resolve it.
      pollCount++;
      await new Promise(r => { resolveStatusFetch = r; });
      return { ok: true, status: 200, json: async () => ({
        jobId: 'job-9', status: 'COMPLETED', result: { answer: 'Result', citations: [] },
      }) } as Response;
    }));

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Let the first poll fire and hang.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pollCount).toBe(1);
    expect(getSessionJob('sess-1')?.status).toBe('QUEUED');

    // Cancel while the poll is in flight.
    const job = getSessionJob('sess-1')!;
    cancelResearchJob(job.jobId);
    expect(getSessionJob('sess-1')).toBeUndefined();

    // Resolve the hanging fetch.
    resolveStatusFetch?.({});

    // Let any pending microtasks settle.
    await vi.advanceTimersByTimeAsync(0);

    // Job must still be gone, no completed event should have fired.
    expect(getSessionJob('sess-1')).toBeUndefined();
    expect(completions).toHaveLength(0);

    // No reschedule should have happened, so next poll is forever.
    await vi.advanceTimersByTimeAsync(100_000);
    expect(pollCount).toBe(1); // Still just the one
  });

  it('dropSessionJobs during poll: job stays gone, no completed event, no reschedule', async () => {
    let pollCount = 0;
    const completions: string[] = [];
    subscribeResearchJobs(event => {
      if (event.kind === 'completed') completions.push(event.result.answer);
    });

    let resolveStatusFetch: ((value: unknown) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/research')) {
        return { ok: true, status: 200, json: async () => ({
          success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x',
        }) } as Response;
      }
      pollCount++;
      await new Promise(r => { resolveStatusFetch = r; });
      return { ok: true, status: 200, json: async () => ({
        jobId: 'job-9', status: 'COMPLETED', result: { answer: 'Result', citations: [] },
      }) } as Response;
    }));

    initResearchJobs(['sess-1']);
    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Let the first poll fire and hang.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pollCount).toBe(1);

    // Drop all jobs for the session while poll is in flight.
    dropSessionJobs('sess-1');
    expect(getSessionJob('sess-1')).toBeUndefined();

    // Resolve the hanging fetch.
    resolveStatusFetch?.({});
    await vi.advanceTimersByTimeAsync(0);

    // Job must still be gone.
    expect(getSessionJob('sess-1')).toBeUndefined();
    expect(completions).toHaveLength(0);

    // No reschedule.
    await vi.advanceTimersByTimeAsync(100_000);
    expect(pollCount).toBe(1);
  });
});

describe('resume constraints', () => {
  it('refuses to resume if the session has a different active job', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);

    // Submit job A.
    const jobA = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1',
    });
    const jobIdA = jobA.jobId;

    // Let it stall.
    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    expect(getSessionJob('sess-1')?.status).toBe('STALLED');

    // Submit job B (now the active job).
    const jobB = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-2', question: 'Q2',
    });
    const jobIdB = jobB.jobId;

    // B should be the active job now.
    expect(getSessionJob('sess-1')?.jobId).toBe(jobIdB);
    expect(getSessionJob('sess-1')?.status).toBe('QUEUED');

    // Try to resume job A — should throw ResearchBusyError with job B.
    expect(() => resumeResearchJob(jobIdA)).toThrow(ResearchBusyError);

    // B should STILL be the active job, and its status should not have changed.
    const afterResume = getSessionJob('sess-1');
    expect(afterResume?.jobId).toBe(jobIdB);
    expect(afterResume?.status).toBe('QUEUED');
    expect(afterResume?.startedAt).toBe(jobB.startedAt); // startedAt not bumped
  });
});

describe('reload simulation', () => {
  it('persists job across memory reset and re-init', async () => {
    stubFetch(url =>
      url.endsWith('/api/research')
        ? { success: true, jobId: 'job-9', status: 'QUEUED', statusPath: '/x' }
        : { jobId: 'job-9', status: 'RUNNING' }
    );

    initResearchJobs(['sess-1']);
    const submitted = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q',
    });

    // Simulate a page reload: reset in-memory state but leave localStorage intact.
    __resetForTests();

    // After reset, the job should be gone from memory.
    expect(getSessionJob('sess-1')).toBeUndefined();

    // Re-initialize (as the app would on load).
    initResearchJobs(['sess-1']);

    // The job should have been restored from localStorage.
    const restored = getSessionJob('sess-1');
    expect(restored?.jobId).toBe(submitted.jobId);
    expect(restored?.status).toBe('QUEUED');
    expect(restored?.question).toBe(submitted.question);
  });
});

import { __getInternalStateSizesForTests } from '@/lib/researchJobs';

describe('cancellation during error paths', () => {
  it('cancel during rejecting fetch: no state leak in failures/delays maps', async () => {
    let pollCount = 0;
    // Set only once poll 2's fetch is in flight, so the test controls exactly
    // when the rejection settles relative to the cancellation.
    let rejectSecondPoll: ((reason?: unknown) => void) | undefined;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/api/research')) {
        return { ok: true, status: 200, json: async () => ({
          success: true, jobId: 'job-test', status: 'QUEUED', statusPath: '/x',
        }) } as Response;
      }
      pollCount++;
      if (pollCount === 2) {
        // Hold this fetch open. poll() suspends here at `await getLegalResearchJob`
        // until the test explicitly rejects it below.
        return new Promise<Response>((_resolve, reject) => {
          rejectSecondPoll = reject;
        });
      }
      return { ok: true, status: 200, json: async () => ({
        jobId: 'job-test', status: 'RUNNING',
      }) } as Response;
    }));

    initResearchJobs(['sess-1']);
    const job1 = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1',
    });
    expect(job1.jobId).toBe('job-test');

    // Poll 1 fires at 3000ms and succeeds (QUEUED -> RUNNING), scheduling poll 2
    // at +4050ms per the verified backoff schedule (3000, 7050, ...).
    await vi.advanceTimersByTimeAsync(3_000);
    expect(pollCount).toBe(1);

    // Poll 2 fires at the 7050ms mark and hangs on our controlled promise —
    // poll() is now suspended awaiting getLegalResearchJob, not yet in the catch.
    await vi.advanceTimersByTimeAsync(4_050);
    expect(pollCount).toBe(2);
    expect(rejectSecondPoll).toBeDefined();

    // Cancel WHILE the rejecting fetch is still in flight. This deletes the
    // record and clears its Map entries before the catch branch ever runs.
    cancelResearchJob(job1.jobId);
    expect(getSessionJob('sess-1')).toBeUndefined();
    expect(__getInternalStateSizesForTests()).toEqual({ failures: 0, delays: 0, timers: 0 });

    // Now let the pending fetch reject, and flush microtasks so poll()'s catch
    // branch runs to completion against a record that's already gone.
    rejectSecondPoll?.(new TypeError('network error'));
    await vi.advanceTimersByTimeAsync(0);

    // The catch branch must bail without recreating any bookkeeping for a
    // jobId that no longer exists in `jobs` — otherwise this is a permanent
    // leak, since nothing else is ever keyed off a deleted jobId to clean it up.
    expect(__getInternalStateSizesForTests()).toEqual({ failures: 0, delays: 0, timers: 0 });
  });
});

describe('resume return values and errors', () => {
  it('returns false for non-existent job', async () => {
    initResearchJobs(['sess-1']);
    const result = resumeResearchJob('nonexistent-job');
    expect(result).toBe(false);
  });

  it('returns false for non-STALLED job', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);

    const job = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1',
    });

    // Job is QUEUED, not STALLED.
    const result = resumeResearchJob(job.jobId);
    expect(result).toBe(false);
  });

  it('throws ResearchBusyError if session has a different active job', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);

    const jobA = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1',
    });

    // Let it stall.
    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    expect(getSessionJob('sess-1')?.status).toBe('STALLED');

    // Submit job B (now the active job).
    const jobB = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-2', question: 'Q2',
    });

    // Try to resume job A — should throw ResearchBusyError with job B as existing.
    let thrownError: unknown;
    try {
      resumeResearchJob(jobA.jobId);
      throw new Error('resumeResearchJob should have thrown');
    } catch (err) {
      thrownError = err;
    }

    expect(thrownError).toBeInstanceOf(ResearchBusyError);
    if (thrownError instanceof ResearchBusyError) {
      expect(thrownError.existing.jobId).toBe(jobB.jobId);
    }
  });

  it('returns true and resumes when conditions are met', async () => {
    stubRunning();
    initResearchJobs(['sess-1']);

    const job = await submitResearchJob({
      sessionId: 'sess-1', messageId: 'msg-1', question: 'Q1',
    });

    // Let it stall.
    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    expect(getSessionJob('sess-1')?.status).toBe('STALLED');

    // Resume should succeed.
    const result = resumeResearchJob(job.jobId);
    expect(result).toBe(true);
    expect(getSessionJob('sess-1')?.status).toBe('RUNNING');
  });
});

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

    // Simulate the other tab being genuinely alive: it renews its own lock
    // every HEARTBEAT_MS (5s), same as ours would. Without this renewal the
    // lock legitimately goes stale after LOCK_STALE_MS (15s) and our own
    // heartbeat correctly reclaims it — that is desired behavior for a dead
    // tab, not the scenario this test is about (a tab that never stops
    // polling must not also poll).
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: 'other-tab', ts: Date.now() }));
    }
    expect(flaky.pollCount()).toBe(0);
  });

  // Not from the brief. Added because the brief's "does not poll" test above
  // only exercises tick()'s own bail-out — it never reaches schedule()'s
  // `if (!isLeader) return`, since tick() bails before its loop calls
  // schedule() at all. But submitResearchJob/resumeResearchJob call
  // schedule() directly, independent of tick(). If a user submits a new
  // research job from the non-leader tab (both tabs share the UI equally —
  // nothing restricts submission to the leader), that tab must still not
  // start polling its own copy of the job, or two tabs poll the same job.
  it('does not poll a job it just submitted while it is not the leader', async () => {
    localStorage.setItem(LOCK_KEY, JSON.stringify({ tabId: 'other-tab', ts: Date.now() }));
    const flaky = stubFlakyFetch({ failPolls: 0 });

    initResearchJobs(['sess-1']);
    expect(__isLeaderForTests()).toBe(false);

    await submitResearchJob({ sessionId: 'sess-1', messageId: 'msg-1', question: 'Q' });

    // Stay comfortably under LOCK_STALE_MS (15s) so the lock's own staleness
    // never becomes a confound — this test is purely about schedule()'s guard.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(flaky.pollCount()).toBe(0);
  });

  it('re-syncs its view when another tab writes', () => {
    initResearchJobs(['sess-1']);
    __seedForTests([record({ jobId: 'job-7' })]);

    window.dispatchEvent(new StorageEvent('storage', { key: 'pg-research-jobs' }));
    expect(getSessionJob('sess-1')?.jobId).toBe('job-7');
  });
});
