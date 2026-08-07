'use client';

import { useEffect, useState } from 'react';
import { Message, useChatStore } from '@/lib/chatStore';
import {
  Citation,
  DocumentSummary,
  GeneratedArtifact,
  WebSource,
  artifactDownloadUrl,
  listDocuments,
} from '@/lib/api';
import { GEN_FORMATS, NATIVE_TEMPLATE_EXT } from '@/lib/documentFormats';
import { type ResearchJobRecord } from '@/lib/researchJobs';
import MarkdownMessage from './MarkdownMessage';
import { ResearchConsent, ResearchProgress } from './ResearchCard';

// ─── Generated artifact card ──────────────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  docx: 'DOC', pdf: 'PDF', pptx: 'PPT', xlsx: 'XLS',
};

function formatBytes(bytes?: number): string | null {
  if (bytes === undefined || bytes === null) return null;
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
          text-[10px] font-bold tracking-wide
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

// ─── Download-as-document control ─────────────────────────────────────────────
//
// Sits under any completed answer — ordinary chat or a verified research
// opinion — that has no artifact yet. Renders the answer's own text into a
// Word/PDF/Slides/Sheet document, optionally styled after a previously
// uploaded reference document. See lib/chatStore.tsx's
// downloadAnswerAsDocument for the request itself (and the 12,000-character
// guard) and docs/BACKEND_ASK-styled-document-from-content.md for why the
// prompt has to be wrapped in a faithful-reproduction instruction rather than
// hitting a dedicated "render this" endpoint.

function DownloadAnswerControl({
  message, isDark, sessionId,
}: {
  message: Message;
  isDark: boolean;
  sessionId: string;
}) {
  const { downloadAnswerAsDocument } = useChatStore();
  const pending = message.pendingGenerate;

  // A research answer that already carries a format/style the user picked
  // before the question routed to research opens pre-selected and expanded —
  // that choice was already made once and shouldn't need repeating. Any other
  // completed answer starts collapsed, like the citations/authorities panels.
  const [open, setOpen] = useState(!!pending);
  const [format, setFormat] = useState<string | null>(pending?.format ?? null);
  const [refDocId, setRefDocId] = useState<string | null>(pending?.referenceDocumentId ?? null);
  const [refDocs, setRefDocs] = useState<DocumentSummary[] | null>(null);
  const [refDocsFailed, setRefDocsFailed] = useState(false);

  const busy = !!message.isGeneratingArtifact;

  // Lazy-load style references the first time the panel is open — including
  // immediately, for the pre-expanded pendingGenerate case.
  useEffect(() => {
    if (!open || refDocs !== null || refDocsFailed) return;
    listDocuments()
      .then(res => setRefDocs(res.documents.filter(d => NATIVE_TEMPLATE_EXT.test(d.filename))))
      .catch(() => setRefDocsFailed(true));
  }, [open, refDocs, refDocsFailed]);

  const handleDownload = () => {
    if (busy) return;
    downloadAnswerAsDocument(sessionId, message.id, {
      ...(format ? { format } : {}),
      ...(refDocId ? { referenceDocumentId: refDocId } : {}),
    });
  };

  return (
    <div className="mt-3 pt-3 border-t border-current/10">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200
          ${isDark ? 'text-white/45 hover:text-white/80' : 'text-charcoal/45 hover:text-charcoal/75'}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {busy ? 'Preparing document…' : 'Download as document'}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>

      <div className="pg-expand" data-open={open}>
        <div>
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {/* Format picker */}
            <div className={`flex items-center rounded-full border p-0.5
              ${isDark ? 'border-white/10' : 'border-charcoal/12'}`}
            >
              {GEN_FORMATS.map(f => (
                <button
                  key={f.label}
                  onClick={() => setFormat(f.value)}
                  disabled={busy}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors duration-150
                    disabled:cursor-not-allowed
                    ${format === f.value
                      ? isDark ? 'bg-white/12 text-white/90' : 'bg-charcoal/10 text-charcoal/90'
                      : isDark ? 'text-white/40 hover:text-white/70' : 'text-charcoal/40 hover:text-charcoal/70'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Style reference picker */}
            <select
              value={refDocId ?? ''}
              onChange={e => setRefDocId(e.target.value || null)}
              disabled={busy || refDocsFailed || (refDocs !== null && refDocs.length === 0)}
              className={`text-[11px] px-2.5 py-1.5 rounded-full border bg-transparent outline-none
                transition-colors duration-150 max-w-[200px] truncate
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

            {/* Trigger */}
            <button
              onClick={handleDownload}
              disabled={busy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium
                transition-all duration-150 active:scale-95 disabled:active:scale-100
                ${isDark
                  ? 'bg-white text-[#1c1c1e] hover:bg-white/90 disabled:bg-white/25 disabled:text-white/50'
                  : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c] disabled:bg-charcoal/20 disabled:text-white/70'
                }`}
            >
              {busy && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
                </svg>
              )}
              {busy ? 'Preparing…' : 'Download'}
            </button>
          </div>

          {message.artifactError && (
            <p className={`mt-2 text-[11px] leading-relaxed ${isDark ? 'text-red-300/80' : 'text-red-600/85'}`}>
              {message.artifactError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Citations Panel ──────────────────────────────────────────────────────────

function CitationsPanel({ citations, isDark }: { citations: Citation[]; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-current/10">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200
          ${isDark ? 'text-white/45 hover:text-white/80' : 'text-charcoal/45 hover:text-charcoal/75'}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        {citations.length} {citations.length === 1 ? 'source' : 'sources'}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>

      <div className="pg-expand" data-open={open}>
        <div>
          <div className="mt-2 space-y-2">
            {citations.map((c, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-lg text-xs leading-relaxed border
                  ${isDark
                    ? 'bg-white/4 border-white/[0.07] text-white/45'
                    : 'bg-charcoal/4 border-charcoal/[0.07] text-charcoal/50'
                  }`}
              >
                <p className={`font-semibold mb-1 ${isDark ? 'text-white/70' : 'text-charcoal/75'}`}>
                  {c.source || `Source ${i + 1}`}
                </p>
                {c.content && <p className="line-clamp-3">{c.content}</p>}
                {c.score !== undefined && (
                  <p className={`mt-1.5 text-[10px] font-medium ${isDark ? 'text-white/30' : 'text-charcoal/30'}`}>
                    Relevance {Math.round(c.score * 100)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Verified web authorities ─────────────────────────────────────────────────
//
// Only async legal-research answers carry these: sources the backend actually
// retrieved and audited, ranked by how authoritative the domain is.

const TIER_LABELS: Record<string, string> = {
  official: 'Official',
  legal_reporter: 'Law report',
  reporter: 'Law report',
  general: 'General web',
};

function tierLabel(tier?: string): string | null {
  if (!tier) return null;
  return TIER_LABELS[tier] ?? tier.replace(/_/g, ' ');
}

function WebSourcesPanel({ sources, isDark }: { sources: WebSource[]; isDark: boolean }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;

  return (
    <div className="mt-3 pt-3 border-t border-current/10">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase transition-colors duration-200
          ${isDark ? 'text-white/45 hover:text-white/80' : 'text-charcoal/45 hover:text-charcoal/75'}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        {sources.length} verified {sources.length === 1 ? 'authority' : 'authorities'}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>

      <div className="pg-expand" data-open={open}>
        <div>
          <div className="mt-2 space-y-2">
            {sources.map((s, i) => {
              const tier = tierLabel(s.authority_tier);
              return (
                <a
                  key={s.url || i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block p-2.5 rounded-lg text-xs leading-relaxed border transition-colors duration-200
                    ${isDark
                      ? 'bg-white/4 border-white/[0.07] hover:border-white/15'
                      : 'bg-charcoal/4 border-charcoal/[0.07] hover:border-charcoal/15'
                    }`}
                >
                  <p className={`font-semibold ${isDark ? 'text-white/70' : 'text-charcoal/75'}`}>
                    {s.title || s.url}
                  </p>
                  <p className={`mt-1 text-[10px] font-medium ${isDark ? 'text-white/35' : 'text-charcoal/35'}`}>
                    {[s.domain, tier, s.published_date].filter(Boolean).join(' · ')}
                  </p>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingDots({ isDark, label }: { isDark: boolean; label?: string }) {
  return (
    <span className="flex items-center gap-2 py-0.5">
      <span className="flex items-center gap-1.5">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span
            key={i}
            className={`pg-dot w-1.5 h-1.5 rounded-full ${isDark ? 'bg-white/60' : 'bg-charcoal/50'}`}
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </span>
      {label && (
        <span className={`text-[11.5px] ${isDark ? 'text-white/45' : 'text-charcoal/45'}`}>
          {label}
        </span>
      )}
    </span>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

export default function MessageBubble({
  message,
  isDark,
  sessionId,
  researchJob,
  resumeNotice,
  onRunResearch,
  onAnswerNow,
  onDismissResearch,
  onCancelResearch,
  onResumeResearch,
  onRetryResearch,
}: {
  message: Message;
  isDark: boolean;
  /** Owning session — needed to attach a rendered document back to this message. */
  sessionId: string;
  researchJob?: ResearchJobRecord;
  /** Inline feedback for a "Check again" click that couldn't proceed. */
  resumeNotice?: string;
  onRunResearch?: () => void;
  onAnswerNow?: () => void;
  onDismissResearch?: () => void;
  onCancelResearch?: () => void;
  onResumeResearch?: () => void;
  onRetryResearch?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = () => {
    navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`pg-message-in flex gap-3 group ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* ── Avatar ────────────────────────────────────────────────────────── */}
      <div className={`shrink-0 mt-1 w-7 h-7 rounded-full flex items-center justify-center
        ${isUser
          ? isDark ? 'bg-white/10 text-white/65' : 'bg-charcoal/8 text-charcoal/60'
          : isDark ? 'bg-white/10 text-white/75' : 'bg-charcoal/7 text-charcoal/65'
        }`}
      >
        {isUser ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L4 10l12 6 12-6-12-6z" fill="currentColor" opacity="0.9"/>
            <path d="M4 16l12 6 12-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.55"/>
          </svg>
        )}
      </div>

      {/* ── Bubble ────────────────────────────────────────────────────────── */}
      <div className={`flex flex-col gap-1 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`
            px-4 py-3 rounded-2xl text-[13.5px]
            ${isUser
              ? isDark
                ? 'bg-[#2C2C2E] text-white/88 rounded-tr-sm border border-white/8'
                : 'bg-[#2C2C2E] text-white rounded-tr-sm'
              : isDark
                ? 'bg-white/[0.055] text-white/82 rounded-tl-sm border border-white/8'
                : 'bg-white text-charcoal/82 rounded-tl-sm border border-charcoal/8'
            }
            ${message.isError
              ? isDark ? '!bg-red-500/10 !border-red-400/20 !text-red-300' : '!bg-red-50 !border-red-200 !text-red-600'
              : ''
            }
          `}
        >
          {/* Content */}
          {message.researchPrompt ? (
            <ResearchConsent
              question={message.researchPrompt.question}
              canAnswerNow={message.researchPrompt.canAnswerNow}
              isDark={isDark}
              onRun={() => onRunResearch?.()}
              onAnswerNow={() => onAnswerNow?.()}
              onDismiss={() => onDismissResearch?.()}
            />
          ) : researchJob && researchJob.status !== 'COMPLETED' ? (
            <ResearchProgress
              job={researchJob}
              isDark={isDark}
              onCancel={() => onCancelResearch?.()}
              onResume={() => onResumeResearch?.()}
              onRetry={() => onRetryResearch?.()}
              notice={resumeNotice}
            />
          ) : !message.content && message.isStreaming ? (
            <ThinkingDots isDark={isDark} label={message.researchStatus} />
          ) : isUser ? (
            // User messages: plain text, preserve newlines
            <span className="whitespace-pre-wrap break-words leading-[1.7] text-white">
              {message.content}
            </span>
          ) : (
            // Assistant messages: render markdown
            <>
              <MarkdownMessage
                content={message.content}
                isDark={isDark}
              />
              {message.isStreaming && (
                <span
                  className={`inline-block w-[2px] h-[14px] ml-0.5 rounded-full align-middle
                    ${isDark ? 'bg-white/70' : 'bg-charcoal/50'}
                    animate-[blink_0.8s_step-end_infinite]`}
                />
              )}
            </>
          )}

          {/* Generated artifact */}
          {!isUser && !message.isError && message.artifact && (
            <ArtifactCard artifact={message.artifact} isDark={isDark} />
          )}

          {/* Download-as-document control — any completed answer with no
              artifact yet. Only once the answer has actually landed:
              researchPrompt is set the moment the consent card appears, well
              before there is any content to download, and a still-running
              research job has nothing to download either. A failed attempt
              (from this control or from Generate mode's own automatic call)
              surfaces inline here — the answer text above stands regardless. */}
          {!isUser && !message.isError && !message.isStreaming && !!message.content &&
            !message.artifact &&
            !message.researchPrompt &&
            !(researchJob && researchJob.status !== 'COMPLETED') && (
              <DownloadAnswerControl message={message} isDark={isDark} sessionId={sessionId} />
            )}

          {/* Citations */}
          {!isUser && !message.isError && !!message.citations?.length && (
            <CitationsPanel citations={message.citations} isDark={isDark} />
          )}

          {/* Verified web authorities (async legal research only) */}
          {!isUser && !message.isError && !!message.webSources?.length && (
            <WebSourcesPanel sources={message.webSources} isDark={isDark} />
          )}
        </div>

        {/* ── Meta row ──────────────────────────────────────────────────── */}
        <div
          className={`flex items-center gap-2.5 px-1 text-[10px]
            opacity-0 group-hover:opacity-100 transition-opacity duration-200
            ${isUser ? 'flex-row-reverse' : 'flex-row'}
            ${isDark ? 'text-white/35' : 'text-charcoal/28'}`}
        >
          <span>
            {new Date(message.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>

          {!isUser && message.content && !message.isError && (
            <button
              onClick={copy}
              className="flex items-center gap-1 hover:opacity-75 transition-opacity"
            >
              {copied ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="pg-pop">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}

          {message.isResearch && !message.isError && (
            <span className="flex items-center gap-1 opacity-70">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              Verified research
            </span>
          )}

          {message.chunksRetrieved !== undefined && (
            <span className={`opacity-60 ${isDark ? 'text-white/35' : 'text-charcoal/28'}`}>
              {message.chunksRetrieved} chunk{message.chunksRetrieved !== 1 ? 's' : ''} retrieved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
