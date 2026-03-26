'use client';

import React from 'react';

/**
 * Renders a subset of Markdown commonly returned by RAG/LLM responses:
 *   - **bold**
 *   - *italic*
 *   - `inline code`
 *   - # Headings (h1–h3)
 *   - - unordered lists
 *   - 1. ordered lists
 *   - > blockquotes
 *   - --- horizontal rules
 *   - Plain paragraphs with line-break support
 *
 * Intentionally lightweight — no external dependencies.
 */

interface Props {
  content: string;
  isDark: boolean;
  className?: string;
}

// ─── Inline styles ─────────────────────────────────────────────────────────────

function renderInline(text: string, isDark: boolean): React.ReactNode[] {
  // Split on bold, italic, inline-code patterns
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className={isDark ? 'text-white/95 font-semibold' : 'text-charcoal font-semibold'}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className={`px-1.5 py-0.5 rounded text-[12px] font-mono
            ${isDark ? 'bg-white/8 text-amber-300' : 'bg-charcoal/6 text-charcoal'}`}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

// ─── Block types ──────────────────────────────────────────────────────────────

type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'p'; text: string };

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (listType && listItems.length) {
      blocks.push({ type: listType, items: [...listItems] });
      listItems = [];
      listType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    if (h3) { flushList(); blocks.push({ type: 'h3', text: h3[1] }); continue; }
    if (h2) { flushList(); blocks.push({ type: 'h2', text: h2[1] }); continue; }
    if (h1) { flushList(); blocks.push({ type: 'h1', text: h1[1] }); continue; }

    // HR
    if (/^---+$/.test(line.trim())) {
      flushList();
      blocks.push({ type: 'hr' });
      continue;
    }

    // Blockquote
    const bq = line.match(/^>\s+(.*)/);
    if (bq) { flushList(); blocks.push({ type: 'blockquote', text: bq[1] }); continue; }

    // Unordered list
    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) {
      if (listType === 'ol') flushList();
      listType = 'ul';
      listItems.push(ul[1]);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\d+\.\s+(.*)/);
    if (ol) {
      if (listType === 'ul') flushList();
      listType = 'ol';
      listItems.push(ol[1]);
      continue;
    }

    // Empty line — flush list, then add spacing via empty paragraph
    if (line.trim() === '') {
      flushList();
      // Don't add empty blocks — they just create gaps between list and paragraph
      continue;
    }

    // Plain paragraph text
    flushList();
    // Try to merge with previous paragraph block
    const prev = blocks[blocks.length - 1];
    if (prev && prev.type === 'p') {
      prev.text += '\n' + line;
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }

  flushList();
  return blocks;
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

export default function MarkdownMessage({ content, isDark, className = '' }: Props) {
  const blocks = parseBlocks(content);

  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h1':
            return (
              <h1 key={i} className={`text-[15px] font-bold leading-snug mt-3 mb-1
                ${isDark ? 'text-white' : 'text-charcoal'}`}
              >
                {renderInline(block.text, isDark)}
              </h1>
            );
          case 'h2':
            return (
              <h2 key={i} className={`text-[14px] font-bold leading-snug mt-3 mb-1
                ${isDark ? 'text-white/90' : 'text-charcoal/90'}`}
              >
                {renderInline(block.text, isDark)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={i} className={`text-[13px] font-semibold leading-snug mt-2
                ${isDark ? 'text-white' : 'text-charcoal/85'}`}
              >
                {renderInline(block.text, isDark)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={i} className="space-y-1 pl-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className={`mt-[7px] w-1.5 h-1.5 rounded-full shrink-0
                      ${isDark ? 'bg-amber-400/50' : 'bg-charcoal/30'}`}
                    />
                    <span className="leading-relaxed">{renderInline(item, isDark)}</span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="space-y-1 pl-1">
                {block.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2.5">
                  <span className={`shrink-0 text-[11px] font-bold tabular-nums mt-0.5
                    ${isDark ? 'text-amber-400/60' : 'text-charcoal/40'}`}
                  >
                    {j + 1}.
                  </span>
                  <span className={`leading-relaxed ${isDark ? 'text-white' : 'text-charcoal'}`}>
                    {renderInline(item, isDark)}
                  </span>
                </li>
                ))}
              </ol>
            );
          case 'blockquote':
            return (
              <blockquote key={i} className={`pl-3 border-l-2 italic
                ${isDark
                  ? 'border-amber-400/30 text-white/55'
                  : 'border-charcoal/25 text-charcoal/55'
                }`}
              >
                {renderInline(block.text, isDark)}
              </blockquote>
            );
          case 'hr':
            return (
              <hr key={i} className={`my-2 border-0 border-t
                ${isDark ? 'border-white/10' : 'border-charcoal/10'}`}
              />
            );
          case 'p':
            return (
              <p key={i} className={`leading-[1.75] whitespace-pre-wrap  ${isDark
                  ? 'text-white'
                  : 'text-charcoal'
                }`} >
                {block.text.split('\n').map((line, j, arr) => (
                  <React.Fragment key={j}>
                    {renderInline(line, isDark)}
                    {j < arr.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
