import { useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';

// Minimal safe markdown renderer: headings, bold, bullet lists, code fences.
// No raw HTML is ever injected — everything is rendered as React elements.

function renderInline(text: string, keyPrefix: string) {
  const nodes: Array<string | { bold: string }> = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push({ bold: match[1] });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.map((node, i) =>
    typeof node === 'string' ? (
      <span key={`${keyPrefix}-${i}`}>{node}</span>
    ) : (
      <strong key={`${keyPrefix}-${i}`} className="font-semibold text-pearl">
        {node.bold}
      </strong>
    ),
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="relative my-2">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-md border border-abyss-500/40 bg-abyss-900/90 px-2 text-[11px] font-medium text-muted transition-colors hover:text-pearl"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-abyss-600/40 bg-abyss-950/80 p-3 pr-16 font-mono text-xs leading-6 text-foam-100">
        {code}
      </pre>
    </div>
  );
}

export default function MarkdownChat({ content }: { content: string }) {
  const blocks = useMemo(() => {
    const segments: Array<{ type: 'code' | 'text'; body: string }> = [];
    const fence = /```(?:[a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = fence.exec(content)) !== null) {
      if (match.index > lastIndex) segments.push({ type: 'text', body: content.slice(lastIndex, match.index) });
      segments.push({ type: 'code', body: match[1] });
      lastIndex = fence.lastIndex;
    }
    if (lastIndex < content.length) segments.push({ type: 'text', body: content.slice(lastIndex) });
    return segments;
  }, [content]);

  return (
    <div className="space-y-2">
      {blocks.map((segment, si) => {
        if (segment.type === 'code') return <CodeBlock key={`b-${si}`} code={segment.body} />;

        const lines = segment.body.split('\n');
        const elements: Array<React.ReactNode> = [];
        let bullets: string[] = [];

        const flushBullets = (key: string) => {
          if (bullets.length === 0) return;
          elements.push(
            <ul key={key} className="my-1 list-disc space-y-1 pl-5">
              {bullets.map((item, bi) => (
                <li key={`${key}-${bi}`} className="leading-relaxed">
                  {renderInline(item, `${key}-${bi}`)}
                </li>
              ))}
            </ul>,
          );
          bullets = [];
        };

        lines.forEach((rawLine, li) => {
          const line = rawLine.trimEnd();
          const heading = line.match(/^(#{1,4})\s+(.*)$/);
          const bullet = line.match(/^\s*[-*•]\s+(.*)$/);

          if (bullet) {
            bullets.push(bullet[1]);
            return;
          }
          flushBullets(`ul-${si}-${li}`);
          if (heading) {
            const level = heading[1].length;
            elements.push(
              level <= 2 ? (
                <h4 key={`h-${si}-${li}`} className="mt-2 font-display text-base font-semibold text-pearl">
                  {renderInline(heading[2], `h-${si}-${li}`)}
                </h4>
              ) : (
                <h5 key={`h-${si}-${li}`} className="mt-2 text-sm font-semibold text-pearl">
                  {renderInline(heading[2], `h-${si}-${li}`)}
                </h5>
              ),
            );
            return;
          }
          if (line.trim() === '') return;
          elements.push(
            <p key={`p-${si}-${li}`} className="leading-relaxed">
              {renderInline(line, `p-${si}-${li}`)}
            </p>,
          );
        });
        flushBullets(`ul-${si}-end`);

        return <div key={`s-${si}`}>{elements}</div>;
      })}
    </div>
  );
}
