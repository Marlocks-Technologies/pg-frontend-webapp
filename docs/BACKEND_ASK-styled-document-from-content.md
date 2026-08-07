# Backend ask — styled documents from research, and generation/research precedence

**From:** frontend (pg-frontend-webapp)
**Date:** 2026-08-07
**Context:** users want any AI answer — ordinary chat *or* a verified research opinion —
downloadable as a Word/PDF/Slides/Sheet document styled after a previously uploaded
reference document.

Two backend changes are needed. The first is a live bug with a reproducible failure;
the second is a missing capability that blocks the feature entirely.

---

## 1. BUG — generation short-circuits research, then times out

### Reproduce

In the UI: pick Generate mode, choose Word + a reference document, then send an
authority-heavy question, e.g.

> Draft a legal opinion regarding the succession of a parcel of land where the Head of
> the family died without a will, has a first child born out of wedlock, never married
> the child's mother but proceeded to traditionally marry another woman who gave birth
> to a male child. Your response should be within what is applicable under the Benin,
> Nigeria custom.

Result: **`Endpoint request timed out`** (API Gateway's 29s ceiling) after ~29s of dead air.

Equivalent direct call:

```bash
curl -X POST "$PROD/chat/query" -H 'Content-Type: application/json' -d '{
  "question": "Draft a legal opinion regarding the succession of a parcel of land ... Benin, Nigeria custom.",
  "sessionId": "repro-1",
  "generateDocument": { "format": "docx", "referenceDocumentId": "<a-docx-id>" }
}'
```

### Cause

`services/chat_handler/src/handler.py`, in `_handle_chat_query`:

```python
if explicit_generation:
    ...
    result = chat_handler.generate_document(request)
    return { "statusCode": 201, ... }      # ← returns here

if advanced_research:
    return { "statusCode": 409, ... }      # ← never reached
```

`explicit_generation` is evaluated and returned **before** `advanced_research`. So any
request carrying `generateDocument` can never receive the 409 that routes it to the
asynchronous research worker — it always takes the synchronous generation path, which
for an authority-heavy prompt exceeds API Gateway's limit.

The 12,000-character cap is raised for `explicit_generation or advanced_research`, so
long generate requests are *accepted* and then reliably time out.

### Asked change

Evaluate `advanced_research` **before** `explicit_generation`, so an authority-heavy
generate request returns the 409 rather than attempting synchronous generation.

The 409 body should preserve the caller's generation options so the client can reapply
them after research completes:

```jsonc
{
  "error": "...",
  "researchRequired": true,
  "researchPath": "/chat/research",
  "generateDocument": { "format": "docx", "referenceDocumentId": "..." },  // echoed back
  "requestId": "..."
}
```

Echoing is convenient but not essential — the frontend can hold the options itself. The
precedence change is the part that matters.

**Please confirm** whether flipping the order breaks any existing caller that relies on
generation winning. If it does, an opt-in flag (e.g. `preferResearch: true`) that the
frontend sets would work equally well for us.

---

## 2. MISSING CAPABILITY — render supplied content into a styled document

### The gap

`GenerationRequest` (`services/shared/src/document_generation.py`) is:

```python
prompt: str
output_format: str = "docx"
title: str | None
filename: str | None
session_id: str
reference_document_id: str | None
use_knowledge_base_style: bool = True
filters: dict | None
top_k: int = 8
download_ttl_seconds: int = 3600
```

Every field drives *producing* content. There is no way to say "here is the text —
render it." So a completed research opinion, or any answer already on screen, cannot be
turned into a document: passing the question as `prompt` re-runs RAG and yields
**different** content from what the user is reading.

Shipping that would put a download button under an opinion and hand the user a document
that isn't that opinion. We are not willing to do that, so the feature is blocked here.

### Asked change

Accept caller-supplied content and render it faithfully, applying only formatting and
the reference document's style — no retrieval, no regeneration, no editorialising.

Either shape works; pick whichever fits the codebase:

**Option A — extend the existing endpoint.** Add an optional `content` field to
`POST /documents/generate`. When present, skip retrieval and generation and render it
directly; `prompt` becomes optional and `topK`/`filters` are ignored.

```jsonc
POST /documents/generate
{
  "content": "## Opinion\n\n1. The applicable law is ...",   // markdown, already written
  "format": "docx",
  "referenceDocumentId": "<uploaded .docx used as the style template>",
  "title": "Opinion — succession under Benin custom",
  "sessionId": "pg-1234"
}
```

**Option B — a separate endpoint**, e.g. `POST /documents/render`, with the same body.
Cleaner separation if mixing the two modes in one handler would complicate it.

Response should match the existing generation response so we can reuse our artifact
handling unchanged:

```jsonc
{
  "success": true,
  "artifact": {
    "artifactId": "...", "filename": "...", "format": "docx",
    "mimeType": "...", "sizeBytes": 12345, "title": "...",
    "generatedAt": "...", "downloadUrl": "...", "downloadPath": "...",
    "downloadExpiresAt": "...",
    "styleReference": { "documentId": "...", "filename": "...", "nativeTemplateApplied": true }
  },
  "requestId": "..."
}
```

### Requirements that matter to us

- **Fidelity.** The rendered document must contain the supplied content, not a
  paraphrase. This is the whole point — users download a verified legal opinion and it
  must still be that opinion.
- **Markdown.** Our answers are markdown (headings, bold, italic, lists, blockquotes,
  horizontal rules). Rendering should map those to real document structure — the same
  treatment the current generator gives its own output.
- **Style reference.** Honour `referenceDocumentId` exactly as `/documents/generate`
  does today, including `nativeTemplateApplied` in the response so we can keep showing
  "Styled after <filename>".
- **Latency.** Rendering without retrieval or generation should sit well inside the 29s
  synchronous ceiling. If it cannot for large opinions, please say so — we would then
  need an async job for this too, and would rather know now than discover it in
  production.
- **Size.** A verified opinion can run to tens of thousands of characters. Please
  confirm the accepted `content` ceiling.

---

## What the frontend does in the meantime

Rather than wait for (2), we ship a working download today by leaning on the fact
that `_planning_prompt` embeds `request.prompt` verbatim and the planning system
prompt already forbids inventing facts. Any completed answer — ordinary chat or a
verified research opinion — gets a "Download as document" control. Choosing a
format (and, optionally, a style reference) sends the answer's own `content`,
wrapped in an explicit faithful-reproduction instruction, as `prompt` to
`POST /documents/generate` with `topK: 1` (retrieval still runs server-side; we
cannot disable it, but we keep it small so it has as little room as possible to
compete with the supplied text):

```
Reproduce the following text faithfully as a formal document. It is a finished
piece of work: do not summarise it, do not omit any part of it, do not add new
facts, citations, authorities or commentary, and do not soften or restate its
conclusions. Preserve every heading, citation, case name, statutory reference
and quotation exactly as written. Your only job is to lay this content out as a
well-structured document.

---
<the answer text>
```

The returned artifact attaches to the same message the same way a document
generated inline during Generate mode already does.

This is a workaround, not a substitute for (2):

- It is bounded by the same 12,000-character `prompt` cap as everything else that
  hits this endpoint. The client checks the wrapped prompt's length **before**
  calling and refuses outright — with a clear explanation of how far over the
  limit the answer is — rather than truncate a legal opinion and hand over a
  document that silently drops part of it.
- Retrieval still runs on every call even though nothing needs retrieving; `topK: 1`
  only shrinks the waste, it doesn't remove it.
- Fidelity rests entirely on the model honouring the reproduction instruction. It
  has no structural guarantee the way a real "render this" mode would.

For a research answer whose format/style was chosen in Generate mode before the
question routed to research (`pendingGenerate`), the control opens pre-selected
with that choice so the user doesn't have to repeat it.

Once (2) ships, the client change is small: swap the wrapped-prompt call for
whatever `content`-accepting shape lands, drop the character-cap guard (or raise
it to whatever ceiling the new path has), and the same control and artifact
rendering keep working unchanged.

## Questions back to you

1. Can `advanced_research` be evaluated before `explicit_generation`, or do you prefer
   an explicit `preferResearch` flag from us?
2. Option A (extend `/documents/generate`) or Option B (new `/documents/render`)?
3. What is the maximum `content` size, and does rendering stay inside 29s at that size?
