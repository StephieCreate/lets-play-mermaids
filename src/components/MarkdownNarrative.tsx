import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownNarrativeProps {
  content: string;
  fontFamilyClass?: string;
  fontPx?: string;
}

interface CodeBlock {
  type: 'code';
  code: string;
  key: string;
}
interface TextBlock {
  type: 'text';
  lines: string[];
  key: string;
}

type Segment = CodeBlock | TextBlock;

function splitIntoSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n');
  const segments: Segment[] = [];
  let currentText: string[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let keyCounter = 0;

  const flushText = () => {
    if (currentText.length > 0) {
      segments.push({ type: 'text', lines: currentText, key: `t${keyCounter++}` });
      currentText = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        segments.push({ type: 'code', code: codeBuffer.join('\n'), key: `c${keyCounter++}` });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        flushText();
        inCodeBlock = true;
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }
    currentText.push(line);
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    segments.push({ type: 'code', code: codeBuffer.join('\n'), key: `c${keyCounter++}` });
  }
  flushText();

  return segments;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      nodes.push(<strong key={`b${key++}`} className="font-semibold text-pearl">{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic: *text* or _text_
    const italicMatch = remaining.match(/^[*_](.+?)[*_]/);
    if (italicMatch) {
      nodes.push(<em key={`i${key++}`} className="italic">{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      nodes.push(
        <code key={`code${key++}`} className="rounded bg-abyss-800/60 px-1.5 py-0.5 font-mono text-[0.85em] text-foam-300">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Find next marker, take plain text up to it
    const nextMarker = remaining.search(/(\*\*|[*_`])/);
    if (nextMarker === -1) {
      nodes.push(<span key={`s${key++}`}>{remaining}</span>);
      break;
    }
    if (nextMarker > 0) {
      nodes.push(<span key={`s${key++}`}>{remaining.slice(0, nextMarker)}</span>);
      remaining = remaining.slice(nextMarker);
    } else {
      // Marker at position 0 but didn't match any pattern above — take one char as literal
      nodes.push(<span key={`s${key++}`}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }
  }

  return nodes;
}

function renderTextBlock(lines: string[], fontClass?: string, fontPx?: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const paraStyle = fontClass ? { fontSize: fontPx } : undefined;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines (they separate blocks)
    if (trimmed === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr${key++}`} className="my-4 border-abyss-700/40" />);
      i++;
      continue;
    }

    // Headers
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const text = headerMatch[2];
      const sizes = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm'];
      const className = `font-display font-semibold text-pearl ${sizes[level - 1] ?? 'text-base'} mt-4 mb-2`;
      blocks.push(
        <p key={`h${key++}`} className={className} style={paraStyle}>
          {renderInline(text)}
        </p>
      );
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={`q${key++}`} className="my-3 border-l-2 border-abyss-500/50 pl-4 italic text-muted">
          {quoteLines.map((ql, qi) => (
            <p key={qi} style={paraStyle}>{renderInline(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].trim().match(/^[-*+]\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        i++;
      }
      blocks.push(
        <ul key={`ul${key++}`} className="my-2 space-y-1 pl-5 list-disc text-pearl/90" style={paraStyle}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].trim().match(/^\d+\.\s+(.*)$/);
        if (!itemMatch) break;
        items.push(itemMatch[1]);
        i++;
      }
      blocks.push(
        <ol key={`ol${key++}`} className="my-2 space-y-1 pl-5 list-decimal text-pearl/90" style={paraStyle}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const lt = lines[i].trim();
      if (lt === '') break;
      if (/^(#{1,6})\s+/.test(lt)) break;
      if (lt.startsWith('>')) break;
      if (/^[-*+]\s+/.test(lt)) break;
      if (/^\d+\.\s+/.test(lt)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(lt)) break;
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`p${key++}`} className={`my-2 text-pearl/90 ${fontClass ?? ''}`} style={paraStyle}>
        {paraLines.map((pl, pi) => (
          <span key={pi}>
            {renderInline(pl)}
            {pi < paraLines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  }

  return blocks;
}

function CodeBlockView({ code, fontPx }: { code: string; fontPx?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="relative my-3 rounded-xl border border-abyss-600/40 bg-abyss-950/60">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border border-abyss-600/40 bg-abyss-900/80 px-2.5 text-xs text-muted transition-colors hover:border-abyss-300/50 hover:text-pearl"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre
        className="overflow-x-auto p-4 pr-16 font-mono text-sm leading-7 text-foam-200/90"
        style={fontPx ? { fontSize: fontPx } : undefined}
      >
        {code}
      </pre>
    </div>
  );
}

export default function MarkdownNarrative({ content, fontFamilyClass, fontPx }: MarkdownNarrativeProps) {
  const segments = splitIntoSegments(content);

  return (
    <div className="space-y-1">
      {segments.map((seg) => {
        if (seg.type === 'code') {
          return <CodeBlockView key={seg.key} code={seg.code} fontPx={fontPx} />;
        }
        return (
          <div key={seg.key}>
            {renderTextBlock(seg.lines, fontFamilyClass, fontPx)}
          </div>
        );
      })}
    </div>
  );
}
