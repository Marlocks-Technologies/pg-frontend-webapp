# Deep legal research — UX design

**Date:** 2026-08-06
**Branch:** `feat/legal-research-integration`
**Status:** approved, ready for planning

## Background

The backend added an asynchronous, evidence-verified legal research path
(`POST /chat/research`, `GET /chat/research/{jobId}`). Because verified Nigerian
opinions run past API Gateway's synchronous ceiling, `POST /chat/query` now
answers authority-heavy questions with **HTTP 409 + `researchRequired: true`**
instead of an opinion.

The integration commit (`8ab6c73`) makes that path work: the chat store catches
the 409, submits the job, polls it, and renders the verified opinion with its web
authorities. This spec covers the user experience around that mechanism, which
the integration commit deliberately left minimal.

### Problems this solves

1. **A completed job can be lost.** The `jobId` lives only in a closure. A
   refresh, tab close, or navigation forgets the job forever while the backend
   finishes it and bills for the web search.
2. **The app locks for up to 15 minutes.** `isQuerying` is global — the textarea,
   the send button, and every other session are disabled for the whole job.
   There is no cancel.
3. **The header misreports.** It shows "Searching knowledge base…" and a
   "Thinking" pill during what is actually a multi-minute research job.
4. **No expectation is set.** The user gets an unexplained multi-minute wait with
   no elapsed time and no statement of how long this normally takes.
5. **The timeout message is a dead end.** It tells the user to "check job
   `<id>`" — there is no UI that can check a job.
6. **The 409 heuristic is loose.** Over 700 characters *or* a phrase like "case
   law" routes an otherwise-ordinary question to the slow path, with no way to
   ask for a fast answer or to deliberately request depth.

### Verified backend constraints

These were confirmed against the production API, not inferred from source:

- An authority-heavy question returns `409` with `researchRequired: true`.
- **A question over 1000 characters sent with `autoResearch: false` returns
  `400 Question too long (max 1000 characters)`.** The backend only raises the
  cap to 12,000 for research or generation requests. Therefore *"answer this
  quickly instead" is not available above 1000 characters*, and the UI must not
  offer it there.
- The research worker's Lambda timeout is 900s; jobs expire server-side after
  7 days.
- The research endpoints require `x-api-key`, attached server-side by
  `app/api/research/*`.

## Decisions

| Decision | Choice |
|---|---|
| 409 handling | **Consent first.** Offer the choice; never start a paid job silently |
| Job survival | **Must survive** refresh, navigation, and tab close |
| Blocking | Research **never** blocks input; only synchronous queries do |
| Completion signal | **Sidebar badge + transient toast** |
| Concurrency | **One research job per session**, several across sessions |
| Architecture | **Extract `lib/researchJobs.ts`**; lifecycle out of the chat store |
| Testing | **Add Vitest**, covering the module |
| Cross-tab | **Leader-elected polling** with a heartbeat lock |

## Architecture

Job *lifecycle* lives in the new module. Job *content* lives in the session
store. A record never holds the opinion text: on completion the answer is folded
into the message and the record is discarded, so there is exactly one copy.

```
lib/researchJobs.ts        plain TS, no React — submit, poll, cancel, resume,
                           persistence, one-per-session, orphan cleanup,
                           leader election
      │ subscribe(listener)
      ▼
lib/useResearchJobs.ts     thin hook: subscribes, dispatches into chatStore
      │
      ▼
lib/chatStore.tsx          folds job events into messages
```

`lib/api.ts` keeps only the raw calls — `startLegalResearch` and
`getLegalResearchJob`. **`runLegalResearch` is removed**; its polling loop moves
into the module, where it can be resumed, cancelled, and tested.

### Record shape

Persisted under its own localStorage key, `pg-research-jobs`:

Cancelling drops the record outright, so there is no `CANCELLED` state to
represent.

```ts
type ResearchStatus =
  | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STALLED';

interface ResearchJobRecord {
  jobId: string;
  sessionId: string;
  messageId: string;      // assistant placeholder this job fills
  question: string;
  status: ResearchStatus;
  startedAt: number;      // epoch ms
  updatedAt: number;      // epoch ms
  error?: string;
  seen: boolean;          // false ⇒ sidebar shows the unread dot
}
```

`startedAt` is an epoch number, not a `Date` in a closure. This is what makes the
elapsed timer survive a refresh — otherwise a nine-minute-old job reports `0:03`.

### Module API

```ts
type ResearchEvent =
  | { kind: 'changed'; jobs: ResearchJobRecord[] }
  | { kind: 'completed'; job: ResearchJobRecord; result: LegalResearchResult };

export function initResearchJobs(knownSessionIds: string[]): void;
export function subscribeResearchJobs(fn: (event: ResearchEvent) => void): () => void;
export function submitResearchJob(input: {
  sessionId: string; messageId: string; question: string;
}): Promise<ResearchJobRecord>;
export function cancelResearchJob(jobId: string): void;
export function resumeResearchJob(jobId: string): void;  // STALLED → keep polling same job
export function markResearchSeen(sessionId: string): void;
export function dropSessionJobs(sessionId: string): void;
export function getSessionJob(sessionId: string): ResearchJobRecord | undefined;
```

**The opinion text is never stored in a record.** A completed poll emits a
`completed` event carrying the `LegalResearchResult` straight through to the
subscriber, which folds it into the message; the record then holds only
`status: 'COMPLETED'` and `seen`, and is deleted once seen. This is what keeps a
single copy of the text.

**Two distinct recoveries, deliberately not the same call:**

- `resumeResearchJob` keeps polling the **same** `jobId` — used by `Check again`
  on a `STALLED` job, which is still running and already paid for.
- A `FAILED` job's `Try again` calls `submitResearchJob` for a **new** job with a
  new `jobId`, because the original is gone. It spends money again, so it is
  offered only where a retry can actually succeed — never for `429` quota.

**Initialisation order.** `initResearchJobs` is called from `useResearchJobs`
*after* the chat store has hydrated sessions from localStorage, and is passed the
hydrated session ids. Calling it earlier would see an empty session list and
delete every record as an orphan.

### Resume

`initResearchJobs` runs before first paint and, in order:

1. Drops records whose `sessionId` is not in the known set (the orphan case
   created by sessions and jobs living under separate keys).
2. Drops records whose `startedAt` is older than the backend's 7-day expiry.
3. Restarts polling for everything still `QUEUED` or `RUNNING`, computing elapsed
   from `startedAt`.

A job that completed while the tab was closed resolves on the first poll and
lands in its session.

### Blocking

`isQuerying: boolean` becomes `queryingSessions: Record<string, boolean>`, set
**only by synchronous queries**. Research never sets it. While an opinion is
being verified the user can still ask a quick question in the same session, and
every other session is unaffected.

### Cross-tab

Registry writes go through localStorage; every tab listens for `storage` on
`pg-research-jobs` and re-syncs its in-memory copy. Polling is leader-elected via
`pg-research-lock` holding `{tabId, ts}`, refreshed every 5s and stealable once
15s stale. Non-leader tabs render from the synced registry and do not poll.

## UI surfaces

### 1. Consent card

Replaces the thinking placeholder when the 409 arrives.

```
┌──────────────────────────────────────────────┐
│ ⚖  This needs deep research                  │
│                                              │
│ Verifying Nigerian authorities against live  │
│ sources takes 2–10 minutes. You can keep     │
│ working while it runs.                       │
│                                              │
│  [ Run deep research ]   Answer now   Not now│
└──────────────────────────────────────────────┘
```

- **Run deep research** → `submitResearchJob`, straight to `/api/research`.
- **Answer now** → resend with `autoResearch: false`. **Rendered only when
  `question.length <= 1000`**, because above that the backend returns 400. Above
  the limit the body instead reads: *"This question is too long for a quick
  answer, so deep research is the only route."*
- **Not now** → leaves a muted line in the transcript. The exchange is not
  silently deleted.
- If `/api/research/status` reports `configured: false`, the Run button is
  absent and the card explains that research is not configured for this
  deployment.

### 2. Running

```
● ● ●  Searching Nigerian authorities and verifying citations…   4:12   Cancel
       Typically 2–10 minutes
```

Status labels: `QUEUED` → "Queued for deep legal research…", `RUNNING` →
"Searching Nigerian authorities and verifying citations…". The timer counts from
persisted `startedAt` and ticks each second. After ten minutes the sub-line
becomes *"Taking longer than usual — still running."*

### 3. Stalled and failed

- **STALLED** (20 minutes elapsed, or five consecutive poll failures): *"Still
  running after 20 minutes."* with **`Check again`** → `resumeResearchJob`,
  which keeps polling the same job. It is still running and already paid for.
  This replaces the current dead-end message.
- **FAILED**: the backend's reason plus **`Try again`** → a **new** job via
  `submitResearchJob`, since the original is gone. Because that spends money
  again, it is omitted for `429` quota failures, where a retry cannot succeed.

### 4. Sidebar

`SessionRow` gains one dot: pulsing while a job runs, solid once an answer is
ready and unseen, cleared when the session is opened. Amber in dark, charcoal in
light — reusing the existing "Thinking" pill colors rather than introducing a new
state color.

### 5. Toast

Bottom-right, above the input. Auto-dismisses after 12s with a `View` action that
switches to the session. **Suppressed when the user is already viewing that
session.** The toast is the transient nudge; the sidebar dot is the durable
record.

### 6. Research toggle

A third mode button in `ChatInput` beside Search and Generate, mutually exclusive
with them, mode label `RESEARCH`, placeholder *"Ask for a verified legal
opinion…"*. When on, send goes **straight to `/api/research`**, skipping a
`/chat/query` round trip already known to 409. This is the only way a short
question can get deep research, since the heuristic would never offer it.

### 7. Header

- Synchronous query in the active session → "Searching knowledge base…"
- Research running in the active session → `Researching · 4:12`
- Otherwise → message count

The pill reads `Researching` rather than `Thinking` during a job.

### 8. Collision

Submitting research into a session that already has one running produces an
inline choice: `Cancel it and run this` / `Keep the current one`.

### Unchanged

The completed-opinion presentation ships as built in `8ab6c73`: the verified
web-authorities panel and the "Verified research" meta badge.

## Error handling

| Case | Handling |
|---|---|
| Transient poll failure | Count **consecutive** failures; keep backing off; only after five → `STALLED` with `Check again`. A sleeping laptop must not destroy a job |
| `503` not configured | Consent card degrades: no Run button; if the question is >1000 chars, say so, since no route remains |
| `429` quota/throttle | `FAILED`, "monthly research quota reached", **no** retry button |
| `404` on poll | Expired or gone. `FAILED`, record dropped |
| `COMPLETED`, empty result | `FAILED` with a real message, not an empty bubble |
| Session deleted mid-job | Cancel polling, drop record. The backend job continues and still bills — unavoidable, and stated plainly to the user |
| localStorage unavailable | Degrade to in-memory, matching the existing `loadSessions` guard. Job dies on refresh, as today |

### Pre-existing bug to fix

`typewrite` holds a single `timerRef`. A second call clears the first interval and
strands the first message mid-sentence permanently. This is rare today but becomes
routine once a background completion can fire while a synchronous answer types.
**Fix: on interrupt, snap the outgoing message to its full text before starting
the new one.**

### New endpoint

`GET /api/research/status` → `{configured: boolean}`. Reports only whether
`RESEARCH_API_KEY` is set. It must never return the key or any part of it.

## Accessibility and motion

- Every new animation (sidebar pulse, toast entry) is gated behind
  `prefers-reduced-motion: reduce`, matching the three existing blocks in
  `app/globals.css`.
- The running state and toast use `aria-live="polite"` so a completion after ten
  minutes is announced rather than silently swapped in.
- Consent card buttons are real buttons, reachable and operable by keyboard.
- The sidebar dot carries a text alternative — colour is not the only signal.

## Testing

Add **Vitest** (devDependency, config, `test` script) with fake timers and a
stubbed `fetch`. `lib/researchJobs.ts` is plain TypeScript, so no React or network
is involved.

Cases:

1. `submit` registers a record and begins polling.
2. `QUEUED → RUNNING → COMPLETED` emits the result exactly once.
3. Five consecutive network failures → `STALLED`, not `FAILED`; fewer than five
   recover and continue.
4. `404` on poll → `FAILED`, record dropped.
5. `429` on submit → `FAILED` with the quota message and no retry affordance.
6. Resume from localStorage restarts polling with elapsed computed from
   `startedAt`.
7. Orphan records (unknown `sessionId`) are dropped on init.
8. Records older than 7 days are dropped on init.
9. One-per-session: a second submit into a busy session is refused.
10. `cancel` stops polling and drops the record.
11. `COMPLETED` with an empty result is treated as `FAILED`.
12. Leader election: a non-leader tab does not poll; a stale lock is stolen.
13. `resumeResearchJob` polls the same `jobId`; a `FAILED` retry submits a new
    one. The two must not be interchangeable — resuming a dead job hangs, and
    resubmitting a live one pays twice.
14. `initResearchJobs` called with hydrated session ids keeps their records;
    called with an empty list it would drop everything, so ordering is asserted.

Manual verification, which automated tests cannot cover:

- A real end-to-end job against the live backend with `RESEARCH_API_KEY` set.
  **This is currently unverified — the key is deliberately not committed.**
- Refresh mid-job and confirm the timer resumes at the true elapsed time.
- Two tabs open: exactly one toast fires.

## Files

**New**

- `lib/researchJobs.ts` — lifecycle, persistence, polling, leader election
- `lib/useResearchJobs.ts` — hook wiring the module to the store
- `components/ResearchCard.tsx` — consent, running, stalled, failed states
- `components/ResearchToast.tsx` — completion toast
- `app/api/research/status/route.ts` — `{configured: boolean}`
- `lib/researchJobs.test.ts` — the suite above
- `vitest.config.ts`

**Modified**

- `lib/api.ts` — remove `runLegalResearch`; keep the raw calls
- `lib/chatStore.tsx` — `queryingSessions`; fold job events; fix `typewrite`
- `components/MessageBubble.tsx` — render `ResearchCard` states
- `components/ChatInput.tsx` — Research toggle
- `components/ChatArea.tsx` — header status, mount the toast
- `components/Sidebar.tsx` — `SessionRow` dot
- `app/globals.css` — pulse and toast keyframes, reduced-motion blocks
- `package.json` — Vitest and the `test` script
- `README.md` — document the flow and `/api/research/status`

## Out of scope

- A persistent research tray (rejected in favour of sidebar + toast).
- A generic async-task abstraction — there is exactly one such task today.
- Changing the backend's 409 heuristic. The loose trigger is handled in the UI
  via consent and the "answer now" escape hatch, not by asking the backend to
  change.
- Server-push completion (WebSocket). Polling is sufficient for a job measured in
  minutes.
