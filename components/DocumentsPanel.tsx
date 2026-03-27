'use client';

import { useState, useEffect, useRef, ChangeEvent, DragEvent } from 'react';
import {
  listDocuments,
  getDocumentDetails,
  uploadDocument,
  deleteDocument,
  DocumentSummary,
  DocumentDetail,
} from '@/lib/api';

// ─── Supported file types ─────────────────────────────────────────────────────

const ACCEPTED_TYPES: Record<string, string> = {
  'text/plain':                                                    'txt',
  'text/markdown':                                                 'md',
  'application/pdf':                                               'pdf',
  'application/msword':                                            'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/csv':                                                      'csv',
  'application/json':                                              'json',
  'text/html':                                                     'html',
  'text/xml':                                                      'xml',
  'application/xml':                                               'xml',
  'application/rtf':                                               'rtf',
};

const ACCEPTED_ATTR = Object.keys(ACCEPTED_TYPES).join(',') + ',.txt,.md,.pdf,.doc,.docx,.csv,.json,.html,.xml,.rtf';

// ─── File → plain text extraction ────────────────────────────────────────────

async function extractText(file: File): Promise<string> {
  const type = file.type;

  // PDF: use pdf.js from CDN (loaded lazily)
  if (type === 'application/pdf') {
    return extractPdf(file);
  }

  // DOCX: use mammoth.js from CDN (loaded lazily)
  if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  ) {
    return extractDocx(file);
  }

  // DOC (legacy binary): we can only do our best — read as text
  if (type === 'application/msword' || file.name.endsWith('.doc')) {
    return readAsText(file);
  }

  // Everything else (txt, md, csv, json, html, xml, rtf): read as UTF-8 text
  return readAsText(file);
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsText(file, 'utf-8');
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target?.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Load pdf.js from CDN and extract all page text
async function extractPdf(file: File): Promise<string> {
  // @ts-expect-error – CDN global
  if (!window.pdfjsLib) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    // @ts-expect-error
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const buffer = await readAsArrayBuffer(file);
  // @ts-expect-error
  const pdf    = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const tc      = await page.getTextContent();
    const text    = tc.items.map((item: { str: string }) => item.str).join(' ');
    pages.push(text);
  }
  return pages.join('\n\n');
}

// Load mammoth.js from CDN and extract DOCX text
async function extractDocx(file: File): Promise<string> {
  // @ts-expect-error
  if (!window.mammoth) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
  }
  const buffer = await readAsArrayBuffer(file);
  // @ts-expect-error
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value ?? '';
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { resolve(); return; }
    const s  = document.createElement('script');
    s.src    = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ─── File type display helpers ────────────────────────────────────────────────

function fileTypeLabel(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const labels: Record<string, string> = {
    pdf: 'PDF', docx: 'Word', doc: 'Word (legacy)',
    txt: 'Text', md: 'Markdown', csv: 'CSV',
    json: 'JSON', html: 'HTML', xml: 'XML', rtf: 'RTF',
  };
  return labels[ext] ?? ext.toUpperCase();
}

function fileTypeColor(file: File, isDark: boolean): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const dark: Record<string, string> = {
    pdf:  'bg-red-400/12 text-red-400',
    docx: 'bg-blue-400/12 text-blue-400',
    doc:  'bg-blue-400/12 text-blue-400',
    csv:  'bg-emerald-400/12 text-emerald-400',
    json: 'bg-amber-400/12 text-amber-400',
    md:   'bg-purple-400/12 text-purple-400',
    txt:  'bg-white/8 text-white/45',
    html: 'bg-orange-400/12 text-orange-400',
    xml:  'bg-orange-400/12 text-orange-400',
    rtf:  'bg-white/8 text-white/45',
  };
  const light: Record<string, string> = {
    pdf:  'bg-red-50 text-red-500',
    docx: 'bg-blue-50 text-blue-500',
    doc:  'bg-blue-50 text-blue-500',
    csv:  'bg-emerald-50 text-emerald-600',
    json: 'bg-amber-50 text-amber-600',
    md:   'bg-purple-50 text-purple-600',
    txt:  'bg-charcoal/5 text-charcoal/50',
    html: 'bg-orange-50 text-orange-500',
    xml:  'bg-orange-50 text-orange-500',
    rtf:  'bg-charcoal/5 text-charcoal/50',
  };
  return (isDark ? dark[ext] : light[ext]) ?? (isDark ? 'bg-white/8 text-white/45' : 'bg-charcoal/5 text-charcoal/50');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, isDark }: { status?: string; isDark: boolean }) {
  const s = (status ?? 'unknown').toLowerCase();
  const colours: Record<string, string> = {
    processed:  isDark ? 'bg-emerald-400/12 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
    processing: isDark ? 'bg-amber-400/12 text-amber-400'    : 'bg-amber-50 text-amber-600',
    failed:     isDark ? 'bg-red-400/12 text-red-400'        : 'bg-red-50 text-red-500',
    unknown:    isDark ? 'bg-white/6 text-white/35'           : 'bg-charcoal/5 text-charcoal/45',
  };
  const cls = colours[s] ?? colours.unknown;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${cls}`}>
      {status ?? 'unknown'}
    </span>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  isDark,
  onClose,
  onSuccess,
}: {
  isDark: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [filename, setFilename]     = useState('');
  const [content, setContent]       = useState('');
  const [category, setCategory]     = useState('');
  const [author, setAuthor]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError]           = useState('');
  const [dragOver, setDragOver]     = useState(false);
  const fileRef                     = useRef<HTMLInputElement>(null);

  // Process any picked file → extract text
  const processFile = async (file: File) => {
    setPickedFile(file);
    setFilename(file.name);
    setError('');
    setExtracting(true);
    try {
      const text = await extractText(file);
      if (!text.trim()) {
        setError('Could not extract text from this file. Try pasting the content manually.');
      } else {
        setContent(text);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to read file');
    } finally {
      setExtracting(false);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleSubmit = async () => {
    if (!filename.trim() || !content.trim()) {
      setError('Filename and content are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const metadata: Record<string, string> = {};
      if (category.trim()) metadata.category = category.trim();
      if (author.trim())   metadata.author   = author.trim();

      await uploadDocument({
        filename: filename.trim(),
        content: content.trim(),
        metadata: Object.keys(metadata).length ? metadata : undefined,
      });
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative z-10 w-full max-w-lg rounded-2xl border shadow-2xl max-h-[90vh] flex flex-col
          ${isDark ? 'bg-[#1c1c1e] border-white/10' : 'bg-white border-charcoal/10'}`}
      >
        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between px-5 py-4 border-b
          ${isDark ? 'border-white/8' : 'border-charcoal/8'}`}
        >
          <div>
            <h2 className={`text-[14px] font-bold ${isDark ? 'text-white/90' : 'text-charcoal/90'}`}>
              Upload Document
            </h2>
            <p className={`text-[11px] mt-0.5 ${isDark ? 'text-white' : 'text-charcoal/38'}`}>
              PDF, Word, TXT, MD, CSV, JSON, HTML, XML, RTF
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors
              ${isDark ? 'text-white/30 hover:text-white/70 hover:bg-white/6' : 'text-charcoal/30 hover:text-charcoal/70 hover:bg-charcoal/6'}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`
              relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-150 px-4 py-6
              flex flex-col items-center justify-center gap-2.5 text-center
              ${dragOver
                ? isDark
                  ? 'border-white/40 bg-white/6'
                  : 'border-charcoal/40 bg-charcoal/5'
                : pickedFile
                  ? isDark
                    ? 'border-emerald-400/30 bg-emerald-400/5'
                    : 'border-emerald-500/30 bg-emerald-50/50'
                  : isDark
                    ? 'border-white/10 hover:border-white/22 hover:bg-white/3'
                    : 'border-charcoal/12 hover:border-charcoal/25 hover:bg-charcoal/3'
              }
            `}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_ATTR}
              onChange={handleFileInput}
              className="hidden"
            />

            {extracting ? (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className={`animate-spin ${isDark ? 'text-white/35' : 'text-charcoal/40'}`}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                </svg>
                <p className={`text-[12.5px] font-medium ${isDark ? 'text-white/50' : 'text-charcoal/55'}`}>
                  Extracting text…
                </p>
              </>
            ) : pickedFile ? (
              <>
                <div className={`px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wide
                  ${fileTypeColor(pickedFile, isDark)}`}
                >
                  {fileTypeLabel(pickedFile)}
                </div>
                <p className={`text-[13px] font-semibold ${isDark ? 'text-white/80' : 'text-charcoal/80'}`}>
                  {pickedFile.name}
                </p>
                <p className={`text-[11px] ${isDark ? 'text-white/28' : 'text-charcoal/35'}`}>
                  {formatBytes(pickedFile.size)} · click to change
                </p>
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  className={isDark ? 'text-white/25' : 'text-charcoal/30'}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17,8 12,3 7,8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <div>
                  <p className={`text-[13px] font-medium ${isDark ? 'text-white/55' : 'text-charcoal/60'}`}>
                    Drop a file or click to browse
                  </p>
                  <p className={`text-[11px] mt-0.5 ${isDark ? 'text-white' : 'text-charcoal/32'}`}>
                    PDF · Word · TXT · MD · CSV · JSON · HTML · XML · RTF
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Filename */}
          <Field label="Filename *" isDark={isDark}>
            <input
              type="text"
              value={filename}
              onChange={e => setFilename(e.target.value)}
              placeholder="my-document.pdf"
              className={inputCls(isDark)}
            />
          </Field>

          {/* Content */}
          <Field label={`Content * ${content ? `(${content.length.toLocaleString()} chars)` : ''}`} isDark={isDark}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Text will be extracted automatically, or paste content here…"
              rows={5}
              className={`${inputCls(isDark)} resize-none`}
            />
          </Field>

          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" isDark={isDark}>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="e.g. corporate"
                className={inputCls(isDark)}
              />
            </Field>
            <Field label="Author" isDark={isDark}>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="e.g. Perchstone"
                className={inputCls(isDark)}
              />
            </Field>
          </div>

          {/* Error */}
          {error && (
            <p className={`text-[12px] ${isDark ? 'text-red-400' : 'text-red-500'}`}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className={`shrink-0 flex items-center justify-end gap-2.5 px-5 py-3.5 border-t
          ${isDark ? 'border-white/8' : 'border-charcoal/8'}`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors
              ${isDark ? 'text-white/40 hover:text-white/70 hover:bg-white/5' : 'text-charcoal/45 hover:text-charcoal/70 hover:bg-charcoal/5'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || extracting}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all active:scale-95
              ${isDark
                ? 'bg-white text-[#1c1c1e] hover:bg-white/90 disabled:opacity-40'
                : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c] disabled:opacity-40'
              }`}
          >
            {loading && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
              </svg>
            )}
            {loading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

function inputCls(isDark: boolean) {
  return `w-full px-3 py-2 rounded-xl text-[13px] outline-none border transition-colors
    ${isDark
      ? 'bg-white/5 border-white/10 text-white/85 placeholder-white/22 focus:border-white/25'
      : 'bg-charcoal/4 border-charcoal/12 text-charcoal/85 placeholder-charcoal/28 focus:border-charcoal/28'
    }`;
}

function Field({
  label, isDark, children,
}: {
  label: string; isDark: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`block text-[11px] font-semibold tracking-wide uppercase mb-1.5
        ${isDark ? 'text-white/35' : 'text-charcoal/45'}`}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({
  docId,
  isDark,
  onClose,
}: {
  docId: string;
  isDark: boolean;
  onClose: () => void;
}) {
  const [doc, setDoc]       = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDocumentDetails(docId)
      .then(d => { if (!cancelled) { setDoc(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [docId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 w-full max-w-md rounded-2xl border shadow-2xl
        ${isDark ? 'bg-[#1c1c1e] border-white/10' : 'bg-white border-charcoal/10'}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b
          ${isDark ? 'border-white/8' : 'border-charcoal/8'}`}
        >
          <h2 className={`text-[14px] font-bold truncate pr-4 ${isDark ? 'text-white/90' : 'text-charcoal/90'}`}>
            {doc?.filename ?? 'Document Details'}
          </h2>
          <button onClick={onClose} className={`shrink-0 p-1.5 rounded-lg transition-colors
            ${isDark ? 'text-white/30 hover:text-white/70 hover:bg-white/6' : 'text-charcoal/30 hover:text-charcoal/70 hover:bg-charcoal/6'}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2">
              {[0,1,2].map(i => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? 'bg-white/25' : 'bg-charcoal/25'}`}
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          ) : error ? (
            <p className={`text-[13px] py-6 text-center ${isDark ? 'text-red-400' : 'text-red-500'}`}>{error}</p>
          ) : doc ? (
            <dl className="space-y-3">
              {([
                ['Document ID', doc.documentId],
                ['Status',      <StatusBadge key="s" status={doc.status} isDark={isDark} />],
                ['Category',    doc.category ?? '—'],
                ['Uploaded',    formatDate(doc.uploadTime)],
                ['Size',        formatBytes(doc.size)],
                ['Chunks',      doc.chunkCount?.toString() ?? '—'],
                ['Storage',     doc.storageLocation ?? '—'],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4">
                  <dt className={`text-[11px] font-semibold tracking-wide uppercase shrink-0
                    ${isDark ? 'text-white/30' : 'text-charcoal/40'}`}>{k}</dt>
                  <dd className={`text-[12.5px] text-right break-all ${isDark ? 'text-white/70' : 'text-charcoal/70'}`}>{v}</dd>
                </div>
              ))}

              {/* Raw metadata */}
              {doc.metadata && Object.keys(doc.metadata).length > 0 && (
                <div>
                  <dt className={`text-[11px] font-semibold tracking-wide uppercase mb-1.5
                    ${isDark ? 'text-white/30' : 'text-charcoal/40'}`}>Metadata</dt>
                  <dd className={`text-[12px] rounded-xl px-3 py-2.5 font-mono leading-relaxed
                    ${isDark ? 'bg-white/4 text-white/55' : 'bg-charcoal/4 text-charcoal/60'}`}>
                    {JSON.stringify(doc.metadata, null, 2)}
                  </dd>
                </div>
              )}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Documents Panel ──────────────────────────────────────────────────────────

export default function DocumentsPanel({ isDark }: { isDark: boolean }) {
  const [docs, setDocs]               = useState<DocumentSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [showUpload, setShowUpload]   = useState(false);
  const [detailId, setDetailId]       = useState<string | null>(null);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [search, setSearch]           = useState('');

  const fetchDocs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listDocuments();
      setDocs(res.documents ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteDocument(id);
      setDocs(prev => prev.filter(d => d.documentId !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = search.trim()
    ? docs.filter(d =>
        d.filename.toLowerCase().includes(search.toLowerCase()) ||
        (d.category ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : docs;

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${isDark ? 'bg-[#111113]' : 'bg-[#f5f5f7]'}`}>

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className={`shrink-0 flex items-center justify-between px-5 h-14 border-b
        ${isDark ? 'bg-[#111113] border-white/8' : 'bg-[#f5f5f7] border-charcoal/8'}`}
      >
        <div>
          <h1 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-charcoal/88'}`}>
            Knowledge Base
          </h1>
          <p className={`text-[11px] ${isDark ? 'text-white' : 'text-charcoal/38'}`}>
            {loading ? 'Loading…' : `${docs.length} document${docs.length !== 1 ? 's' : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            onClick={fetchDocs}
            disabled={loading}
            className={`p-2 rounded-xl border transition-colors
              ${isDark
                ? 'border-white/10 text-white/35 hover:text-white/65 hover:bg-white/5 disabled:opacity-30'
                : 'border-charcoal/12 text-charcoal/40 hover:text-charcoal/65 hover:bg-charcoal/5 disabled:opacity-30'
              }`}
            title="Refresh"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={loading ? 'animate-spin' : ''}
            >
              <polyline points="23,4 23,10 17,10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>

          {/* Upload */}
          <button
            onClick={() => setShowUpload(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all active:scale-95
              ${isDark
                ? 'bg-white text-[#1c1c1e] hover:bg-white/90 shadow-sm'
                : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c] shadow-sm'
              }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Upload
          </button>
        </div>
      </header>

      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <div className={`shrink-0 px-5 py-3 border-b ${isDark ? 'border-white/6' : 'border-charcoal/6'}`}>
        <div className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border
          ${isDark
            ? 'bg-white/5 border-white/10 focus-within:border-white/22'
            : 'bg-white border-charcoal/12 focus-within:border-charcoal/25 shadow-sm'
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={isDark ? 'text-white/25' : 'text-charcoal/30'}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter by name or category…"
            className={`flex-1 bg-transparent text-[13px] outline-none
              ${isDark ? 'text-white/80 placeholder-white/22' : 'text-charcoal/80 placeholder-charcoal/30'}`}
          />
          {search && (
            <button onClick={() => setSearch('')}
              className={`${isDark ? 'text-white/25 hover:text-white/55' : 'text-charcoal/30 hover:text-charcoal/55'}`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Document list ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            {[0,1,2].map(i => (
              <span key={i} className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-white/20' : 'bg-charcoal/20'}`}
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"
              className={isDark ? 'text-red-400/50' : 'text-red-400'}
            >
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p className={`text-[13px] text-center ${isDark ? 'text-red-400' : 'text-red-500'}`}>{error}</p>
            <button onClick={fetchDocs}
              className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors
                ${isDark ? 'border-white/12 text-white/45 hover:bg-white/5' : 'border-charcoal/15 text-charcoal/50 hover:bg-charcoal/5'}`}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`flex flex-col items-center justify-center h-full gap-3 ${isDark ? 'text-white/18' : 'text-charcoal/22'}`}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
            <div className="text-center">
              <p className="text-[13px] font-medium">{search ? 'No matches found' : 'No documents yet'}</p>
              {!search && <p className={`text-[11px] mt-0.5 opacity-60  ${isDark ? 'text-white' : 'text-charcoal'}`}>Upload your first document to get started</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => (
              <div
                key={doc.documentId}
                className={`group flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border transition-all duration-150
                  ${isDark
                    ? 'bg-white/[0.035] border-white/[0.07] hover:bg-white/[0.06] hover:border-white/12'
                    : 'bg-white border-charcoal/8 hover:border-charcoal/16 shadow-sm hover:shadow-md hover:shadow-charcoal/5'
                  }`}
              >
                {/* File icon */}
                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center
                  ${isDark ? 'bg-white/6 text-white/45' : 'bg-charcoal/5 text-charcoal/50'}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[13px] font-semibold truncate leading-snug
                    ${isDark ? 'text-white' : 'text-charcoal/85'}`}
                  >
                    {doc.filename}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusBadge status={doc.status} isDark={isDark} />
                    {doc.category && (
                      <span className={`text-[10px] ${isDark ? 'text-white' : 'text-charcoal/38'}`}>
                        {doc.category}
                      </span>
                    )}
                    <span className={`text-[10px] ${isDark ? 'text-white' : 'text-charcoal/30'}`}>
                      {formatDate(doc.uploadTime)}
                    </span>
                    {doc.size !== undefined && (
                      <span className={`text-[10px] ${isDark ? 'text-white/18' : 'text-charcoal/28'}`}>
                        {formatBytes(doc.size)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {/* Details */}
                  <button
                    onClick={() => setDetailId(doc.documentId)}
                    title="View details"
                    className={`p-2 rounded-lg transition-colors
                      ${isDark ? 'text-white/25 hover:text-white/70 hover:bg-white/8' : 'text-charcoal/30 hover:text-charcoal/70 hover:bg-charcoal/6'}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(doc.documentId)}
                    disabled={deletingId === doc.documentId}
                    title="Delete document"
                    className={`p-2 rounded-lg transition-colors
                      ${isDark
                        ? 'text-white/20 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-30'
                        : 'text-charcoal/25 hover:text-red-500 hover:bg-red-50 disabled:opacity-30'
                      }`}
                  >
                    {deletingId === doc.documentId ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showUpload && (
        <UploadModal
          isDark={isDark}
          onClose={() => setShowUpload(false)}
          onSuccess={fetchDocs}
        />
      )}
      {detailId && (
        <DetailDrawer
          docId={detailId}
          isDark={isDark}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}