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

---

## API Endpoints Used

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Check backend service health |
| `POST` | `/chat/query` | Send a question, receive an AI answer with citations |
| `GET` | `/chat/history/:sessionId` | Load existing conversation history |
| `DELETE` | `/chat/session/:sessionId` | Delete a stored conversation |
| `POST` | `/chat/search` | Semantic search across documents (no AI answer) |
| `POST` | `/documents` | Upload a document |
| `POST` | `/documents/capture` | Queue camera or video frames for OCR |
| `GET` | `/documents` | List processed documents |
| `GET` | `/documents/:documentId` | Load document details |
| `DELETE` | `/documents/:documentId` | Delete a document |

---

## Features

- **Multi-session chat** with auto-generated titles
- **Persistent sessions** — survives page refresh via `localStorage`
- **Typewriter effect** on assistant responses
- **Markdown rendering** — bold, italic, headings, lists, blockquotes, code
- **Collapsible citations panel** on each AI response
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
