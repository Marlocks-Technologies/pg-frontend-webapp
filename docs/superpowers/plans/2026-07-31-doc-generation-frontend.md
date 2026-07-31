# Document Generation Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users generate Word/PDF/PowerPoint/Excel documents from chat (auto-detected or via an explicit generate mode) and download them from artifact cards in assistant messages.

**Architecture:** Both entry points go through the existing `POST /chat/query` pipeline — the explicit mode adds a `generateDocument` option to the request. The response's `artifact` object is stored on the assistant `Message` and rendered as a download card. Downloads use the backend's stable refresh route so links never expire.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 3, no test framework (verification = `npm run type-check` + live browser via Playwright MCP).

## Global Constraints

- Achromatic design system (DESIGN.md): no accent colors, no gradients, no glow, no decorative shadow; hairlines at 7% ink; color only for state.
- Both themes authored by hand via the `isDark` prop, matching existing components.
- Raleway only; compressed type ramp (10/11/12/13/13.5/14/22px).
- Respect `prefers-reduced-motion` (existing `pg-*` utility classes already do).
- No new dependencies.
- Verification per task: `npm run type-check` must pass. No unit test framework exists; do not add one.

---

### Task 1: API layer — artifact types and generateDocument option

**Files:**
- Modify: `lib/api.ts` (extend section 2, Chat Query)

**Interfaces:**
- Consumes: existing `BASE_URL`, `Citation`.
- Produces: `GeneratedArtifact` (exported interface), `GenerateDocumentOptions` (exported interface), extended `ChatQueryRequest` (optional `generateDocument`), extended `ChatQueryResponse` (optional `artifact`), `artifactDownloadUrl(artifactId: string): string`.

- [ ] **Step 1: Add types + helper to `lib/api.ts`**

After the `Citation` interface, add:

```ts
// ─── Generated document artifacts ─────────────────────────────────────────────

export interface ArtifactStyleReference {
  documentId: string;
  filename?: string;
  nativeTemplateApplied?: boolean;
}

export interface GeneratedArtifact {
  artifactId: string;
  filename: string;
  format: string;                 // "docx" | "pdf" | "pptx" | "xlsx"
  mimeType?: string;
  sizeBytes?: number;
  title?: string;
  generatedAt?: string;
  styleReference?: ArtifactStyleReference;
  downloadUrl?: string;           // short-lived signed URL
  downloadPath?: string;          // stable path, e.g. /documents/generated/{id}/download
  downloadExpiresAt?: string;
}

/** Stable download route — refreshes the S3 signature and 302-redirects. */
export function artifactDownloadUrl(artifactId: string): string {
  return `${BASE_URL}/documents/generated/${encodeURIComponent(artifactId)}/download`;
}
```

In `ChatQueryRequest`, add:

```ts
export interface GenerateDocumentOptions {
  format?: string;                // "docx" | "pdf" | "pptx" | "xlsx" — omit for auto
  referenceDocumentId?: string;
  topK?: number;
}
```

and the field `generateDocument?: GenerateDocumentOptions;`.

In `chatQuery`, forward it:

```ts
  if (payload.generateDocument !== undefined) body.generateDocument = payload.generateDocument;
```

In `ChatQueryResponse`, add `artifact?: GeneratedArtifact;` and extend metadata with `chunksRetrieved?: number;` (generation responses use camelCase).

- [ ] **Step 2: Verify**

Run: `npm run type-check` — expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/api.ts
git commit -m "feat: add document generation types to chat API layer"
```

### Task 2: chatStore — carry artifacts on messages, options on sendMessage

**Files:**
- Modify: `lib/chatStore.tsx`

**Interfaces:**
- Consumes: `GeneratedArtifact`, `GenerateDocumentOptions` from `./api`.
- Produces: `Message.artifact?: GeneratedArtifact`; `sendMessage(question: string, options?: { generateDocument?: GenerateDocumentOptions }): Promise<void>` (context signature updated).

- [ ] **Step 1: Extend Message and sendMessage**

Import `GeneratedArtifact, GenerateDocumentOptions` from `./api`. Add to `Message`:

```ts
  artifact?: GeneratedArtifact;
```

(Serialisation needs no change — artifact is plain JSON and survives the existing spread-based serialise/deserialise.)

Update the context type:

```ts
  sendMessage: (question: string, options?: { generateDocument?: GenerateDocumentOptions }) => Promise<void>;
```

In `sendMessage`, accept the parameter and forward it:

```ts
  async (question: string, options?: { generateDocument?: GenerateDocumentOptions }) => {
    ...
    const resp = await chatQuery({
      question,
      sessionId,
      ...(isFollowUp ? { useHistory: true } : {}),
      ...(options?.generateDocument ? { generateDocument: options.generateDocument } : {}),
    });
```

In the typewriter completion patch, add the artifact and camelCase chunks fallback:

```ts
      patch: {
        content: resp.answer,
        citations: resp.citations,
        chunksRetrieved: resp.metadata?.chunks_retrieved ?? resp.metadata?.chunksRetrieved,
        artifact: resp.artifact,
        isStreaming: false,
      },
```

- [ ] **Step 2: Verify**

Run: `npm run type-check` — expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/chatStore.tsx
git commit -m "feat: carry generated artifacts through chat store"
```

### Task 3: ArtifactCard in MessageBubble

**Files:**
- Modify: `components/MessageBubble.tsx`

**Interfaces:**
- Consumes: `message.artifact` (`GeneratedArtifact`), `artifactDownloadUrl` from `@/lib/api`.
- Produces: `ArtifactCard({ artifact, isDark })` — internal component, rendered inside the assistant bubble below content, above citations.

- [ ] **Step 1: Add ArtifactCard component**

Import `Citation, GeneratedArtifact, artifactDownloadUrl` from `@/lib/api`. Add above `MessageBubble`:

```tsx
// ─── Generated artifact card ──────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  docx: 'DOC', pdf: 'PDF', pptx: 'PPT', xlsx: 'XLS',
};

function formatBytes(bytes?: number): string | null {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactCard({ artifact, isDark }: { artifact: GeneratedArtifact; isDark: boolean }) {
  const label = FORMAT_LABELS[artifact.format] ?? artifact.format.toUpperCase().slice(0, 4);
  const size = formatBytes(artifact.sizeBytes);
  const styledAfter =
    artifact.styleReference?.nativeTemplateApplied && artifact.styleReference.filename;

  return (
    <div
      className={`pg-rise mt-3 flex items-center gap-3 p-3 rounded-lg border
        ${isDark ? 'bg-white/4 border-white/[0.07]' : 'bg-charcoal/[0.03] border-charcoal/[0.07]'}`}
    >
      {/* Format glyph */}
      <div
        className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center
          text-[9px] font-bold tracking-wide
          ${isDark ? 'border-white/12 text-white/70' : 'border-charcoal/15 text-charcoal/70'}`}
      >
        {label}
      </div>

      {/* Meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-semibold truncate
          ${isDark ? 'text-white/85' : 'text-charcoal/85'}`}
        >
          {artifact.filename}
        </p>
        <p className={`text-[10px] ${isDark ? 'text-white/40' : 'text-charcoal/40'}`}>
          {[label, size].filter(Boolean).join(' · ')}
          {styledAfter ? ` · Styled after ${artifact.styleReference!.filename}` : ''}
        </p>
      </div>

      {/* Download — stable route refreshes the signed URL */}
      <a
        href={artifactDownloadUrl(artifact.artifactId)}
        download={artifact.filename}
        className={`group/dl shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg
          text-[11px] font-medium transition-all duration-200 active:scale-95
          ${isDark
            ? 'bg-white text-[#1c1c1e] hover:bg-white/90'
            : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c]'}`}
      >
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className="transition-transform duration-200 group-hover/dl:translate-y-[1px]"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download
      </a>
    </div>
  );
}
```

In `MessageBubble`, render it between content and citations:

```tsx
          {/* Generated artifact */}
          {!isUser && !message.isError && message.artifact && (
            <ArtifactCard artifact={message.artifact} isDark={isDark} />
          )}
```

- [ ] **Step 2: Verify**

Run: `npm run type-check` — expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/MessageBubble.tsx
git commit -m "feat: render generated document artifact cards in chat"
```

### Task 4: Generate mode in ChatInput

**Files:**
- Modify: `components/ChatInput.tsx`

**Interfaces:**
- Consumes: `sendMessage(question, { generateDocument })` from Task 2; `listDocuments`, `DocumentSummary` from `@/lib/api`.
- Produces: UI only. Modes: `isSearchMode`, `isGenerateMode` — mutually exclusive booleans.

- [ ] **Step 1: Add generate mode state + options row**

Imports: add `listDocuments, DocumentSummary` to the `@/lib/api` import.

New state:

```tsx
  const [isGenerateMode, setIsGenerateMode] = useState(false);
  const [genFormat, setGenFormat] = useState<string | null>(null); // null = Auto
  const [refDocId, setRefDocId] = useState<string | null>(null);
  const [refDocs, setRefDocs] = useState<DocumentSummary[] | null>(null); // null = not loaded
  const [refDocsFailed, setRefDocsFailed] = useState(false);
```

Format options constant (module level):

```tsx
const GEN_FORMATS: Array<{ value: string | null; label: string }> = [
  { value: null,   label: 'Auto' },
  { value: 'docx', label: 'Word' },
  { value: 'pdf',  label: 'PDF' },
  { value: 'pptx', label: 'Slides' },
  { value: 'xlsx', label: 'Sheet' },
];

const NATIVE_TEMPLATE_EXT = /\.(docx|pptx|xlsx)$/i;
```

Toggle handler (placed next to the search toggle button; document-plus icon). Turning it on turns search mode off and lazily loads reference documents once:

```tsx
  const toggleGenerateMode = () => {
    setIsGenerateMode(v => {
      const next = !v;
      if (next) {
        setIsSearchMode(false);
        setSearchResults(null);
        if (refDocs === null && !refDocsFailed) {
          listDocuments()
            .then(res => setRefDocs(res.documents.filter(d => NATIVE_TEMPLATE_EXT.test(d.filename))))
            .catch(() => setRefDocsFailed(true));
        }
      }
      return next;
    });
  };
```

The search toggle's own onClick must also call `setIsGenerateMode(false)`.

Generate toggle button JSX (after the search toggle):

```tsx
        <button
          onClick={toggleGenerateMode}
          title={isGenerateMode ? 'Switch to chat' : 'Generate a document'}
          className={`shrink-0 mb-0.5 p-2 rounded-xl transition-all duration-150 active:scale-90
            ${isGenerateMode
              ? isDark ? 'bg-white/12 text-white/85' : 'bg-charcoal/10 text-charcoal'
              : isDark
                ? 'text-white/35 hover:text-white/70 hover:bg-white/6'
                : 'text-charcoal/28 hover:text-charcoal/60 hover:bg-charcoal/5'
            }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="12" x2="12" y2="18"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </button>
```

Options row, rendered above the input row when `isGenerateMode` (below SearchPanel, replacing suggestions):

```tsx
      {isGenerateMode && (
        <div className="pg-panel-in flex items-center gap-2 mb-3 flex-wrap">
          {/* Format picker */}
          <div className={`flex items-center rounded-full border p-0.5
            ${isDark ? 'border-white/10' : 'border-charcoal/12'}`}
          >
            {GEN_FORMATS.map(f => (
              <button
                key={f.label}
                onClick={() => setGenFormat(f.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors duration-150
                  ${genFormat === f.value
                    ? isDark ? 'bg-white/12 text-white/90' : 'bg-charcoal/10 text-charcoal/90'
                    : isDark ? 'text-white/40 hover:text-white/70' : 'text-charcoal/40 hover:text-charcoal/70'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Reference document picker */}
          <select
            value={refDocId ?? ''}
            onChange={e => setRefDocId(e.target.value || null)}
            disabled={refDocsFailed || (refDocs !== null && refDocs.length === 0)}
            className={`text-[11px] px-2.5 py-1.5 rounded-full border bg-transparent outline-none
              transition-colors duration-150 max-w-[220px] truncate
              ${isDark
                ? 'border-white/10 text-white/55 hover:border-white/20 disabled:text-white/25'
                : 'border-charcoal/12 text-charcoal/55 hover:border-charcoal/22 disabled:text-charcoal/25'
              }`}
          >
            <option value="">
              {refDocsFailed
                ? 'Style match unavailable'
                : refDocs === null
                  ? 'Match style — loading…'
                  : refDocs.length === 0
                    ? 'No template documents'
                    : 'Match style: none'}
            </option>
            {(refDocs ?? []).map(d => (
              <option key={d.documentId} value={d.documentId}>{d.filename}</option>
            ))}
          </select>
        </div>
      )}
```

(Note: native `<option>` elements can't be styled per theme; the `<select>` itself follows the hairline style. Acceptable — it's a native affordance.)

- [ ] **Step 2: Wire send + placeholder + mode label**

Suggestions row condition gains `&& !isGenerateMode`. Placeholder:

```tsx
placeholder={
  isSearchMode
    ? 'Search the document knowledge base…'
    : isGenerateMode
      ? 'Describe the document to generate…'
      : 'Ask a legal question…'
}
```

Mode label: render `GENERATE` (same styling as `SEARCH`) when `isGenerateMode`.

In `handleSend`, the non-search branch becomes:

```tsx
    } else {
      if (isQuerying) return;
      await sendMessage(
        q,
        isGenerateMode
          ? {
              generateDocument: {
                ...(genFormat ? { format: genFormat } : {}),
                ...(refDocId ? { referenceDocumentId: refDocId } : {}),
              },
            }
          : undefined
      );
      setValue('');
      ...
```

- [ ] **Step 3: Verify**

Run: `npm run type-check` — expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/ChatInput.tsx
git commit -m "feat: add explicit document generate mode to chat input"
```

### Task 5: Live verification

**Files:** none (verification only)

- [ ] **Step 1: Probe whether prod API has the generation routes**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST \
  "$(grep -o 'https://[^\x27\"]*' lib/api.ts | head -1)/documents/generate" \
  -H 'Content-Type: application/json' -d '{}'
```

Expected: `400`/`422` (route exists, invalid body) or `403`/`404`/`{"message":"Missing Authentication Token"}` (not deployed yet — flag to user, continue with mock).

- [ ] **Step 2: Browser pass**

Start `npm run dev`, open `/chat` with Playwright MCP. Verify in both themes:
1. Generate toggle activates; options row appears; format picker cycles; reference select populates or degrades.
2. Send in generate mode fires `POST /chat/query` with `generateDocument` (inspect via browser network log).
3. If backend live: artifact card renders; Download navigates through 302 to a file. If not: inject a mocked assistant message with an artifact via the browser console (`localStorage` seed) and verify the card renders and the download href points at the stable route.
4. Reduced-motion and mobile-width spot check.

- [ ] **Step 3: Final commit if any fixes**

```bash
git add -A && git commit -m "fix: polish document generation integration"
```
