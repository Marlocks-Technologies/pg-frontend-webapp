'use client';

import {
  useState,
  useRef,
  useCallback,
  KeyboardEvent,
  ChangeEvent,
  CSSProperties,
} from 'react';
import { useChatStore } from '@/lib/chatStore';
import { documentSearch, listDocuments, DocumentSummary, SearchResult } from '@/lib/api';

// ─── Suggested prompts ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What are the requirements for company registration in Nigeria?',
  'Explain the key clauses in a commercial lease agreement',
  'What is the process for trademark registration?',
  'Summarise employee rights under the Labour Act',
];

// ─── Document generation options ──────────────────────────────────────────────

const GEN_FORMATS: Array<{ value: string | null; label: string }> = [
  { value: null,   label: 'Auto' },
  { value: 'docx', label: 'Word' },
  { value: 'pdf',  label: 'PDF' },
  { value: 'pptx', label: 'Slides' },
  { value: 'xlsx', label: 'Sheet' },
];

// Only native Office formats can serve as house-style templates
const NATIVE_TEMPLATE_EXT = /\.(docx|pptx|xlsx)$/i;

// ─── Search results panel ─────────────────────────────────────────────────────

function SearchPanel({
  results,
  loading,
  isDark,
  onClose,
}: {
  results: SearchResult[] | null;
  loading: boolean;
  isDark: boolean;
  onClose: () => void;
}) {
  if (!loading && results === null) return null;

  return (
    <div
      className={`pg-panel-in mb-3 rounded-2xl border overflow-hidden
        ${isDark
          ? 'bg-[#1c1c1e] border-white/10'
          : 'bg-white border-charcoal/10'
        }`}
    >
      {/* Panel header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b
        ${isDark ? 'border-white/6' : 'border-charcoal/6'}`}
      >
        <span className={`text-[11px] font-semibold tracking-wide uppercase
          ${isDark ? 'text-white/40' : 'text-charcoal/50'}`}
        >
          {loading ? 'Searching documents…' : `${results?.length ?? 0} results`}
        </span>
        <button
          onClick={onClose}
          className={`p-1 rounded-md transition-colors
            ${isDark ? 'text-white/40 hover:text-white/75 hover:bg-white/6' : 'text-charcoal/30 hover:text-charcoal/60 hover:bg-charcoal/6'}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Results */}
      <div className="max-h-52 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2">
            {[0, 1, 2].map(i => (
              <span key={i}
                className={`pg-dot w-1.5 h-1.5 rounded-full
                  ${isDark ? 'bg-white/60' : 'bg-charcoal/50'}`}
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        ) : results && results.length === 0 ? (
          <p className={`text-[13px] text-center py-8
            ${isDark ? 'text-white/40' : 'text-charcoal/35'}`}
          >
            No matching documents found
          </p>
        ) : (
          results?.map((r, i) => (
            <div
              key={i}
              className={`px-4 py-3 border-b last:border-b-0 text-[12.5px] leading-relaxed
                ${isDark
                  ? 'border-white/5 text-white/55'
                  : 'border-charcoal/5 text-charcoal/65'
                }`}
            >
              {r.source && (
                <p className={`text-[10px] font-semibold tracking-wide uppercase mb-1
                  ${isDark ? 'text-white/45' : 'text-charcoal/40'}`}
                >
                  {r.source}
                </p>
              )}
              <p className="line-clamp-2">{r.content}</p>
              <p className={`text-[10px] mt-1.5 font-medium
                ${isDark ? 'text-white/30' : 'text-charcoal/30'}`}
              >
                Relevance: {Math.round(r.score * 100)}%
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Chat Input ───────────────────────────────────────────────────────────────

export default function ChatInput() {
  const { state, sendMessage, startResearch, isSessionQuerying } = useChatStore();
  const { isDark } = state;
  const isQuerying = isSessionQuerying(state.activeSessionId);

  const [value, setValue] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const [isResearchMode, setIsResearchMode] = useState(false);

  const [isGenerateMode, setIsGenerateMode] = useState(false);
  const [genFormat, setGenFormat] = useState<string | null>(null); // null = Auto
  const [refDocId, setRefDocId] = useState<string | null>(null);
  const [refDocs, setRefDocs] = useState<DocumentSummary[] | null>(null); // null = not loaded
  const [refDocsFailed, setRefDocsFailed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleGenerateMode = () => {
    setIsGenerateMode(v => {
      const next = !v;
      if (next) {
        setIsSearchMode(false);
        setIsResearchMode(false);
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

  // Auto-resize textarea
  const resize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    resize(e.target);
  };

  const handleSend = async () => {
    const q = value.trim();
    if (!q) return;

    if (isSearchMode) {
      setIsSearching(true);
      setSearchResults(null);
      try {
        const res = await documentSearch({ query: q, topK: 6 });
        setSearchResults(res.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    } else if (isResearchMode) {
      await startResearch(q);
      setValue('');
      setIsResearchMode(false);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && (isSearchMode || !isQuerying);

  return (
    <div className={`shrink-0 px-4 pt-2 pb-5
      ${isDark ? 'bg-[#111113]' : 'bg-[#f5f5f7]'}`}
    >
      {/* Search results */}
      <SearchPanel
        results={searchResults}
        loading={isSearching}
        isDark={isDark}
        onClose={() => { setSearchResults(null); setIsSearchMode(false); }}
      />

      {/* Generation options */}
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

      {/* Suggested prompts (only when input empty + not searching/generating) */}
      {!value && !searchResults && !isSearching && !isGenerateMode && !isResearchMode && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => {
                setValue(s);
                textareaRef.current?.focus();
              }}
              style={{ animationDelay: `${i * 50}ms` }}
              className={`pg-rise text-[11px] px-3 py-1.5 rounded-full border transition-all duration-150
                active:scale-[0.97]
                ${isDark
                  ? 'border-white/12 text-white/55 hover:text-white/85 hover:border-white/25 hover:bg-white/5'
                  : 'border-charcoal/12 text-charcoal/55 hover:text-charcoal/85 hover:border-charcoal/25 hover:bg-charcoal/4'
                }`}
            >
              {s.length > 38 ? s.slice(0, 38) + '…' : s}
            </button>
          ))}
        </div>
      )}

      {/* Input row — the hairline carries a travelling sheen while focused/thinking */}
      <div
        data-thinking={(isQuerying && !isSearchMode) || isSearching ? 'true' : undefined}
        className={`
          pg-input-frame relative flex items-end gap-2 px-3 py-2.5 rounded-2xl border
          transition-colors duration-200
          ${isDark
            ? 'bg-[#1c1c1e] border-white/10 focus-within:border-white/22'
            : 'bg-white border-charcoal/12 focus-within:border-charcoal/25'
          }
        `}
        style={{
          '--pg-sheen-color': isDark ? 'rgba(255,255,255,0.55)' : 'rgba(44,44,46,0.45)',
          '--pg-sheen-color-faint': isDark ? 'rgba(255,255,255,0.18)' : 'rgba(44,44,46,0.15)',
        } as CSSProperties}
      >
        <span aria-hidden className="pg-sheen" />
        {/* Search toggle */}
        <button
          onClick={() => {
            setIsSearchMode(v => !v);
            setIsGenerateMode(false);
            setIsResearchMode(false);
            setSearchResults(null);
          }}
          title={isSearchMode ? 'Switch to chat' : 'Search documents'}
          className={`shrink-0 mb-0.5 p-2 rounded-xl transition-all duration-150 active:scale-90
            ${isSearchMode
              ? isDark
                ? 'bg-white/12 text-white/85'
                : 'bg-charcoal/10 text-charcoal'
              : isDark
                ? 'text-white/35 hover:text-white/70 hover:bg-white/6'
                : 'text-charcoal/28 hover:text-charcoal/60 hover:bg-charcoal/5'
            }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>

        {/* Generate toggle */}
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

        {/* Research toggle */}
        <button
          onClick={() => {
            setIsResearchMode(v => !v);
            setIsSearchMode(false);
            setIsGenerateMode(false);
            setSearchResults(null);
          }}
          title={isResearchMode ? 'Switch to chat' : 'Deep legal research'}
          className={`shrink-0 mb-0.5 p-2 rounded-xl transition-all duration-150 active:scale-90
            ${isResearchMode
              ? isDark ? 'bg-white/12 text-white/85' : 'bg-charcoal/10 text-charcoal'
              : isDark
                ? 'text-white/35 hover:text-white/70 hover:bg-white/6'
                : 'text-charcoal/28 hover:text-charcoal/60 hover:bg-charcoal/5'
            }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v18M5 7h14M7 7l-3 6a3 3 0 0 0 6 0zM17 7l3 6a3 3 0 0 1-6 0z"/>
          </svg>
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKey}
          disabled={isQuerying && !isSearchMode}
          placeholder={
            isSearchMode
              ? 'Search the document knowledge base…'
              : isGenerateMode
                ? 'Describe the document to generate…'
                : isResearchMode
                  ? 'Ask for a verified legal opinion…'
                  : 'Ask a legal question…'
          }
          rows={1}
          className={`
            flex-1 resize-none bg-transparent text-[13.5px] leading-[1.6] outline-none
            ${isDark ? 'text-white/88 placeholder-white/30' : 'text-charcoal/85 placeholder-charcoal/30'}
            disabled:opacity-50
          `}
          style={{ maxHeight: '160px', minHeight: '22px' }}
        />

        {/* Mode label */}
        {(isSearchMode || isGenerateMode || isResearchMode) && (
          <span className={`pg-pop shrink-0 mb-1 text-[10px] font-bold tracking-widest uppercase
            ${isDark ? 'text-white/45' : 'text-charcoal/40'}`}
          >
            {isSearchMode ? 'SEARCH' : isGenerateMode ? 'GENERATE' : 'RESEARCH'}
          </span>
        )}

        {/* Send / spinner */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`
            group shrink-0 mb-0.5 w-8 h-8 rounded-xl flex items-center justify-center
            transition-all duration-200 active:scale-90
            ${canSend
              ? isDark
                ? 'bg-white text-[#1c1c1e] hover:bg-white/90 scale-100'
                : 'bg-[#2C2C2E] text-white hover:bg-[#3a3a3c] scale-100'
              : isDark
                ? 'bg-white/8 text-white/25 cursor-not-allowed scale-95'
                : 'bg-charcoal/5 text-charcoal/22 cursor-not-allowed scale-95'
            }
          `}
        >
          {(isQuerying && !isSearchMode) || isSearching ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="transition-transform duration-200 group-hover:translate-x-[1.5px] group-hover:-translate-y-[1.5px]"
            >
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22,2 15,22 11,13 2,9"/>
            </svg>
          )}
        </button>
      </div>

      <p className={`text-center text-[10px] mt-2.5
        ${isDark ? 'text-white/30' : 'text-charcoal/30'}`}
      >
        P&G Legal AI · For research purposes only — not legal advice
      </p>
    </div>
  );
}
