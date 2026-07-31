# Document generation & download — frontend integration design

**Date:** 2026-07-31
**Status:** Approved
**Backend:** `pg-serverless-rag` — see `docs/DOCUMENT_GENERATION.md` in that repo.

## Goal

Let fee-earners generate native Word / PDF / PowerPoint / Excel files from the
chat UI and download them, using the backend's new generation routes. Two entry
points, one request path.

## Decisions

- **Both entry points ship:** natural-language auto-detection ("generate a
  policy document…") and an explicit generate mode in the chat input.
- **Both go through `POST /chat/query`.** The explicit mode passes the
  `generateDocument: { format?, referenceDocumentId?, topK? }` option that
  forces the workflow. The standalone `POST /documents/generate` endpoint is
  not used by the frontend — generations stay inside the conversation and its
  history.
- **Explicit mode exposes two controls only:** a format picker
  (Auto · Word · PDF · Slides · Sheet) and an optional "Match style" reference
  document picker. Title/filename are inferred by the backend.
- **Downloads always use the stable route**
  `GET {BASE_URL}/documents/generated/{artifactId}/download`, which refreshes
  the S3 signature and 302-redirects. Cards therefore never expire, including
  in restored sessions.

## Components

### 1. API layer — `lib/api.ts`

- `GeneratedArtifact` interface mirroring the backend `artifact` object:
  `artifactId`, `filename`, `format`, `mimeType`, `sizeBytes`, `title`,
  `generatedAt`, `downloadUrl`, `downloadPath`, `downloadExpiresAt`, optional
  `styleReference { documentId, filename, nativeTemplateApplied }`.
- `ChatQueryRequest` gains optional
  `generateDocument?: { format?: string; referenceDocumentId?: string; topK?: number }`.
- `ChatQueryResponse` gains optional `artifact?: GeneratedArtifact`.
- `artifactDownloadUrl(artifactId, ttl?)` helper returning the stable route URL.

### 2. State — `lib/chatStore.tsx`

- `Message` gains `artifact?: GeneratedArtifact`. Plain JSON, so existing
  localStorage serialisation carries it unchanged.
- `sendMessage(question, options?)` — optional
  `options.generateDocument` forwarded to `chatQuery`. On response, the
  artifact is patched onto the assistant message when the typewriter completes.
- No new actions, contexts, or stores.

### 3. Artifact card — `components/MessageBubble.tsx`

Rendered inside assistant bubbles that carry `message.artifact`:

- Raised surface + hairline (no shadow), `rounded-lg`, instrument styling.
- Format glyph (DOC / PDF / PPT / XLS), filename at 13px semibold,
  size + format at 10px micro.
- Solid-ink Download button → stable route (anchor, browser navigation
  follows the 302 to S3).
- If `styleReference.nativeTemplateApplied`, a micro note
  "Styled after {filename}".
- Enters with the existing `pg-rise` animation.

### 4. Generate mode — `components/ChatInput.tsx`

- Third toggle beside the search toggle (document-plus icon). Mutually
  exclusive with search mode.
- Active state: placeholder "Describe the document to generate…", GENERATE
  mode label, options row above the input:
  - Segmented format picker: Auto (default, backend infers) · Word · PDF ·
    Slides · Sheet.
  - "Match style" dropdown, lazily populated from `listDocuments()` on first
    open, filtered to DOCX/PPTX/XLSX (only native formats can be templates).
    Optional; "None" default.
- Send calls `sendMessage(q, { generateDocument: { format?, referenceDocumentId? } })`
  (omitting `format` when Auto).
- The existing input sheen (`data-thinking`) covers the longer generation wait.

## Error handling

- Generation failures flow through the existing error-bubble path.
- `listDocuments()` failure: style picker shows an unavailable state;
  generation proceeds without a reference.
- Sessions restored from localStorage keep working artifact cards via the
  stable download route.

## Testing

- `tsc --noEmit` clean.
- Live browser pass in both themes: auto-detect path, explicit mode with
  format + reference, download click, error path.
- Probe whether prod API has the routes deployed; if not, verify UI against a
  mocked response and flag deployment as pending.

## Out of scope

- No generated-documents library view (backend has no list-artifacts route).
- No direct `POST /documents/generate` wrapper.
- No Google-API integration (backend returns native Office files that Google
  Workspace imports).
