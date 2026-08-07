# P&G Legal AI — Frontend

AI chat assistant for Perchstone & Graeys, powered by a RAG backend on AWS Lambda + API Gateway.

## Stack

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS 3.4.18**
- **Raleway** (Google Fonts via `next/font`)
- No UI component libraries — fully custom

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Edit .env.local if you need to override the production API Gateway URLs

# 3. Run dev server
npm run dev
# → http://localhost:3000/chat
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for the RAG API Gateway (no trailing slash) |
| `NEXT_PUBLIC_DOCUMENT_BASE_URL` | Optional document API base URL; defaults to `NEXT_PUBLIC_API_BASE_URL` |
| `RAG_RESEARCH_API_KEY` | **Server-only — never `NEXT_PUBLIC_*`.** API key for the deep legal-research endpoints. Unset ⇒ deep research returns 503; ordinary chat is unaffected. The older name `RESEARCH_API_KEY` is still read as a fallback |
| `RESEARCH_API_BASE_URL` | Optional backend for the research proxy; falls back to `API_PROXY_TARGET`, then prod |

---

## API Endpoints Used

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Check backend service health |
| `POST` | `/chat/query` | Send a question, receive an AI answer with citations |
| `POST` | `/chat/research` | Queue a verified Nigerian legal opinion (via `/api/research`) |
| `GET` | `/chat/research/:jobId` | Poll a research job (via `/api/research/:jobId`) |
| `GET` | `/api/research/status` | Whether `RAG_RESEARCH_API_KEY` is set (boolean only) |
| `GET` | `/chat/history/:sessionId` | Load existing conversation history |
| `DELETE` | `/chat/session/:sessionId` | Delete a stored conversation |
| `POST` | `/chat/search` | Semantic search across documents (no AI answer) |
| `POST` | `/documents` | Upload a document |
| `POST` | `/documents/generate` | Generate a downloadable document from a prompt |
| `POST` | `/documents/capture` | Queue camera or video frames for OCR |
| `GET` | `/documents` | List processed documents |
| `GET` | `/documents/:documentId` | Load document details |
| `DELETE` | `/documents/:documentId` | Delete a document |

---

## Deep legal research

Authority-heavy questions — long prompts, or ones asking for case law, statutory
provisions or a formal legal opinion — exceed API Gateway's synchronous ceiling.
The backend detects them and answers `POST /chat/query` with **HTTP 409**
(`researchRequired: true`) instead of an opinion.

`lib/chatStore.tsx` catches that and transparently continues on the async route:
it submits the job, polls to a terminal state (up to the worker's 900s ceiling)
with a live progress line in the message bubble, then renders the verified
opinion along with the web authorities the backend actually audited.

Those two endpoints sit behind an API-key usage plan, since each job spends money
on AgentCore web search. The key must never reach the browser, so requests go
through this app's own route handlers — `app/api/research/*` — which attach
`RAG_RESEARCH_API_KEY` server-side. `GET /api/research/status` reports only whether
the key is configured (a boolean, never the key itself), so the UI can avoid
offering a Run button that would just 503.

The flow is consent-first. When `/chat/query` returns 409, the message offers to
run the research or, for questions of 1000 characters or fewer, to answer
immediately instead — above that length the backend rejects a non-research query,
so only research is offered. If the key isn't configured, the consent card says
so and omits the Run button entirely. The Research toggle in the input bar asks
for depth directly, which is the only route for a short question the heuristic
would not flag.

Jobs are owned by `lib/researchJobs.ts`, which persists them to localStorage and
resumes polling after a reload, so closing the tab does not lose an opinion the
backend has already paid to produce. One job runs per session; several can run
across sessions. Only one browser tab polls, elected by a heartbeat lock, so
several open tabs never race the backend with duplicate requests. That lock
only decides who polls, not who announces — the polling tab can be a
background one the user isn't watching — so a separate first-come claim in
localStorage makes sure exactly one open tab shows the completion toast, even
though every tab sees the same underlying job record and sidebar dot.

While a job is queued or running, the chat header names it — "Researching…" with
an amber "Researching" pill — instead of the generic "Searching knowledge
base…" used for an ordinary synchronous answer; if a session somehow has both
an active research job and an ordinary query in flight, the header always
reports the research job, since it is the longer-running and less obvious
state. The sidebar row for that session shows a "· Researching" dot; once the
job completes it flips to "· Ready" until the result is opened. If the
session isn't the one on screen when the job finishes, a transient toast
announces it with a `View` button that jumps straight to that session. A
running job can be cancelled from its message bubble; a stalled one offers
"Check again"; a failed one offers "Try again" unless the failure was a
quota or rate-limit rejection, which cannot succeed on retry.

---

## Features

- **Multi-session chat** with auto-generated titles
- **Persistent sessions** — survives page refresh via `localStorage`
- **Typewriter effect** on assistant responses
- **Markdown rendering** — bold, italic, headings, lists, blockquotes, code
- **Collapsible citations panel** on each AI response
- **Deep legal research** — long authority-heavy questions run asynchronously and
  come back with verified, linked web authorities. Trigger it from a consent
  card or the Research toggle in the input bar; track it via the header's
  "Researching" pill, a sidebar "· Researching" / "· Ready" dot, and a
  completion toast (exactly one per job, even with several tabs open); cancel
  a running job, or retry one that failed for a reason retrying can fix
- **Document search mode** — toggle the 🔍 icon in the input bar
- **Dark / Light mode** — segmented toggle in sidebar footer, persisted
- **Conversation history** — lazy-loaded from API on first session open
- **Delete conversations** — hover a session row to reveal the trash icon
- **Suggested prompts** — shown when input is empty
- **Copy to clipboard** — hover any assistant message
- **Mobile responsive** — sidebar slides in as a drawer on small screens

---

## File Structure

```
app/
  page.tsx              → redirects / → /chat
  chat/page.tsx         → main chat route
  layout.tsx            → Raleway font, root layout
  globals.css           → Tailwind + blink animation + scrollbars

components/
  Sidebar.tsx           → session list, new chat, dark/light toggle
  ChatArea.tsx          → welcome screen, message feed, top bar
  ChatInput.tsx         → textarea, suggested prompts, search mode
  MessageBubble.tsx     → user/AI bubbles, markdown, citations, copy
  MarkdownMessage.tsx   → lightweight markdown renderer (no deps)
  ChatPage.tsx          → layout shell

lib/
  api.ts                → typed fetch wrappers for RAG and document endpoints
  cameraCapture.ts      → camera and video frame capture helpers
  chatStore.tsx         → all state (useReducer + Context + localStorage)
  useLocalStorage.ts    → SSR-safe localStorage hook (utility)
```
