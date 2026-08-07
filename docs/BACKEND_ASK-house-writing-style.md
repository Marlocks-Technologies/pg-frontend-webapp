# Backend ask — adopt the house *writing* style, not just the visual template

**From:** frontend (pg-frontend-webapp)
**Date:** 2026-08-07
**Status:** design question first, then implementation

## What works today

`content` mode is doing exactly what it should. `DocumentGenerator.generate()`:

```python
if request.content is not None:
    # The caller supplied finished content. Do not retrieve evidence or
    # ask a model to rewrite it: parse structure deterministically and
    # apply only the requested output/template styling.
```

Verified live: `generationMode: content_render`, `chunksRetrieved: 0`,
`nativeTemplateApplied: true`, 1.17s, and the source text survives verbatim into the
`.docx` body. That fidelity guarantee is valuable and this ask must not break it.

## The gap

The reference document currently contributes **visual styling only** — fonts, heading
styles, the native template. It does not shape *how the text is written*: section
ordering, the firm's standard headings, where authorities sit relative to reasoning,
how assumptions and caveats are introduced, paragraph numbering conventions, tone.

`_extract_reference_outline` already distils that structure (heading styles + text,
table headers, first paragraphs — up to 80 lines). But `structure_outline` is consumed
only by `_planning_prompt`. **Content mode never reads it.** So a legal opinion rendered
through content mode has house *appearance* and non-house *writing*.

## The fork — please decide before building

### ❌ Option A — add a restyling model pass to content mode

Feed the finished text plus `structure_outline` to a model and have it reorganise into
house structure.

**We would rather you did not.** It reintroduces exactly the risk content mode was built
to eliminate: a model rewriting a finished legal opinion can drop a caveat, reorder
reasoning so emphasis shifts, merge two distinct authorities, or soften a conclusion.
Those are substantive changes wearing formatting clothes, and they are hard to detect by
looking at the output. If the firm downloads an opinion, it must be the opinion.

If you do build this, it needs to be a **separate mode** (`generationMode:
"content_restyle"`), never the default for `content`, so callers opt in knowingly.

### ✅ Option B — adopt the style at *writing* time (recommended)

The user picks the template **before** asking the question. So the house structure should
shape the answer as it is generated, not be retrofitted onto a finished one.

Concretely: when a request carries `referenceDocumentId`, include that document's
`structure_outline` in the prompt that writes the **answer** — for ordinary chat
generation, for document generation, and (most importantly) for the legal-research
worker. The opinion then comes out in house form, and content mode renders it faithfully
with no rewrite pass at all.

This preserves the fidelity guarantee completely: still `chunksRetrieved: 0`, still no
model touching finished text.

**What this needs:**

1. **`/chat/research` should accept the generation options.** `LegalResearchRequest` is
   currently `{question, sessionId, topK, filters}`. Add `referenceDocumentId` (and
   optionally the full `generateDocument` block, since the 409 already echoes it back to
   us). The research worker then loads that reference's outline and writes the opinion to
   match — the firm's section order, heading names, and conventions.

2. **The research worker's drafting prompt should carry the outline**, with wording along
   the lines of: *"Follow this organisation's document conventions — section order,
   heading names, how authorities and assumptions are presented. These govern structure
   and presentation only; they must never change your legal analysis, the authorities you
   rely on, or your conclusions."*

3. **Same for ordinary `/chat/query`** when `generateDocument.referenceDocumentId` is
   present, so a non-research answer is also written in house form before rendering.

4. **Echo it back** so we can show the user which conventions were applied — e.g.
   `metadata.styleConventionsApplied: true` alongside the existing
   `styleReferenceApplied`.

### Option C — both

Option B for anything generated *after* a template is chosen; Option A (as an explicit,
separately named mode) only for retrofitting answers that already exist — for instance a
user who reads an answer, then decides afterwards they want it in house form.

If you build C, please keep them distinguishable in `generationMode` so we can label the
result honestly in the UI. An opinion written in house style and an opinion rewritten
into house style are different artefacts and the user should be able to tell.

## Our recommendation

**Option B, and treat C's restyle path as a later addition if users actually ask for it.**
B is strictly safer, produces better results (a model writing to a structure beats one
reorganising prose it did not plan), and costs no extra model pass.

## What the frontend will do

Once `/chat/research` accepts `referenceDocumentId`, we will pass the user's chosen
template into the research job — we already hold it as `pendingGenerate` through the
409 detour, so this is a small change on our side.

Until then the client keeps sending `content` + `referenceDocumentId` to
`/documents/generate`, which gives house appearance and unmodified text.

## Questions back to you

1. Option B, or do you want A/C as well?
2. Can `/chat/research` take `referenceDocumentId`, and can the worker load the outline
   without a material latency cost on an already long job?
3. How much of `structure_outline` survives for a template whose distinguishing
   conventions live in numbering and paragraph layout rather than heading styles? The
   extractor keys on `style_name.startswith(("title","subtitle","heading"))`, so a firm
   template built from manually formatted paragraphs rather than real Word heading
   styles may yield almost nothing — worth checking against the actual
   "Legal Opinion 1.docx" and "Post Hearing Brief - Arbitration.docx" before committing.
