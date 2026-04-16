"use client";

import React from "react";

// ─── Token types ──────────────────────────────────────────────────────────────
type Token =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "hr" }
  | { type: "blockquote"; lines: string[] }
  | { type: "codeblock"; lang: string; code: string; closed: boolean }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "paragraph"; lines: string[] };

// ─── Parse inline markdown (bold, italic, code, links) ────────────────────────
// ADDED `prefix` parameter to guarantee unique keys across flatMap merges
function parseInline(text: string, prefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // Combine our unique block/line prefix with the regex index
    const k = `${prefix}-${match.index}-${keyCounter++}`;
    
    if (match[2] !== undefined) {
      parts.push(<strong key={k} className="font-semibold text-white">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={k} className="italic text-neutral-300">{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={k} className="px-1.5 py-0.5 rounded bg-neutral-700 text-purple-300 text-[11px] font-mono">
          {match[4]}
        </code>
      );
    } else if (match[5] !== undefined) {
      parts.push(
        // FIXED: Restored the <a tag opener
        <a
          key={k}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
        >
          {match[5]}
        </a>
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

// ─── Code block with copy button ──────────────────────────────────────────────
function CodeBlock({
  lang,
  code,
  isStreaming,
  closed,
}: {
  lang: string;
  code: string;
  isStreaming: boolean;
  closed: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-xl overflow-hidden border border-neutral-700">
      {/* Header bar */}
      <div className="px-4 py-1.5 bg-neutral-900 border-b border-neutral-700 flex items-center justify-between">
        <span className="text-[11px] text-purple-400 font-mono">
          {lang || "code"}
        </span>
        <div className="flex items-center gap-2">
          {isStreaming && !closed && (
            <span className="text-neutral-500 text-[10px]">streaming…</span>
          )}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150
              ${
                copied
                  ? "bg-green-500/20 text-green-400 border border-green-600/40"
                  : "bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 border border-neutral-700"
              }`}
          >
            {copied ? (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      {/* Code area */}
      <pre className="bg-neutral-950 p-4 overflow-x-auto text-xs leading-relaxed">
        <code className="text-green-300 font-mono whitespace-pre">{code}</code>
      </pre>
    </div>
  );
}

// ─── Block-level tokenizer ────────────────────────────────────────────────────
function tokenize(markdown: string): Token[] {
  // Guard against undefined streams
  const safeMarkdown = markdown || "";
  const lines = safeMarkdown.split("\n");
  const tokens: Token[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ────────────────────────────────────────────────────
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (/^```/.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      tokens.push({ type: "codeblock", lang, code: codeLines.join("\n"), closed });
      continue;
    }

    // ── Heading ──────────────────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      tokens.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2],
      });
      i++;
      continue;
    }

    // ── Horizontal rule ──────────────────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      tokens.push({ type: "hr" });
      i++;
      continue;
    }

    // ── Blockquote ───────────────────────────────────────────────────────────
    if (/^>\s?/.test(line)) {
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      tokens.push({ type: "blockquote", lines: bqLines });
      continue;
    }

    // ── Unordered list ───────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s/, ""));
        i++;
      }
      tokens.push({ type: "ul", items });
      continue;
    }

    // ── Ordered list ─────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      tokens.push({ type: "ol", items });
      continue;
    }

    // ── Blank line ───────────────────────────────────────────────────────────
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ── Paragraph ────────────────────────────────────────────────────────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      tokens.push({ type: "paragraph", lines: paraLines });
    }
  }

  return tokens;
}

// ─── Render tokens to JSX ─────────────────────────────────────────────────────
function renderToken(token: Token, idx: number, isStreaming: boolean): React.ReactNode {
  const baseKey = `block-${idx}`;

  switch (token.type) {
    case "heading": {
      const cls: Record<number, string> = {
        1: "text-xl font-bold text-white leading-tight",
        2: "text-lg font-bold text-white leading-tight",
        3: "text-base font-semibold text-purple-300",
        4: "text-sm font-semibold text-purple-400",
        5: "text-sm font-semibold text-neutral-300",
        6: "text-sm font-medium text-neutral-400",
      };
      return <div key={baseKey} className={cls[token.level]}>{parseInline(token.text, baseKey)}</div>;
    }

    case "hr":
      return <hr key={baseKey} className="border-neutral-700" />;

    case "blockquote":
      return (
        <blockquote key={baseKey} className="border-l-4 border-purple-500 pl-4 py-0.5 bg-purple-500/10 rounded-r-lg">
          {token.lines.map((l, j) => (
            <p key={`${baseKey}-p-${j}`} className="text-sm text-neutral-300 leading-relaxed">
              {parseInline(l, `${baseKey}-l-${j}`)}
            </p>
          ))}
        </blockquote>
      );

    case "codeblock":
      return (
        <CodeBlock
          key={baseKey}
          lang={token.lang}
          code={token.code}
          isStreaming={isStreaming}
          closed={token.closed}
        />
      );

    case "ul":
      return (
        <ul key={baseKey} className="space-y-2 pl-1">
          {token.items.map((item, j) => (
            <li key={`${baseKey}-li-${j}`} className="flex items-start gap-2.5 text-sm text-neutral-200 leading-relaxed">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
              <span>{parseInline(item, `${baseKey}-item-${j}`)}</span>
            </li>
          ))}
        </ul>
      );

    case "ol":
      return (
        <ol key={baseKey} className="space-y-2.5 pl-1">
          {token.items.map((item, j) => (
            <li key={`${baseKey}-li-${j}`} className="flex items-start gap-2.5 text-sm text-neutral-200 leading-relaxed">
              <span className="shrink-0 min-w-[22px] h-[22px] rounded-full bg-purple-600/40 text-purple-300 text-xs flex items-center justify-center font-bold mt-0.5">
                {j + 1}
              </span>
              <span className="flex-1">{parseInline(item, `${baseKey}-item-${j}`)}</span>
            </li>
          ))}
        </ol>
      );

    case "paragraph":
      return (
        <p key={baseKey} className="text-sm leading-[1.75] text-neutral-200">
          {token.lines.flatMap((line, j) => {
            // Because we pass the line index 'j', the keys will NEVER duplicate in the flatMap
            const parsed = parseInline(line, `${baseKey}-line-${j}`);
            return j < token.lines.length - 1 ? [...parsed, " "] : parsed;
          })}
        </p>
      );

    default:
      return null;
  }
}

// ─── Main exported component ──────────────────────────────────────────────────
interface MarkdownProps {
  content: string;
  isStreaming?: boolean;
}

export default function Markdown({ content, isStreaming = false }: MarkdownProps) {
  const tokens = tokenize(content);

  return (
    <div className="flex flex-col gap-3">
      {tokens.map((token, idx) => renderToken(token, idx, isStreaming))}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 bg-purple-400 ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}