'use client';

import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

type ResponseBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'unordered-list'; items: string[] }
  | { type: 'ordered-list'; items: string[] }
  | { type: 'code'; language?: string; text: string };

interface AIResponseProps {
  content: string;
  className?: string;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/80">
      <div className="flex items-center justify-between border-b border-border/40 bg-muted px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{language || 'Codigo'}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2.5 text-sm text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.92em] text-foreground">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    return <span key={index}>{part}</span>;
  });
}

function parseBlocks(content: string): ResponseBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ResponseBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language, text: codeLines.join('\n') });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    const paragraphLines: string[] = [trimmed];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || next.startsWith('```') || /^(#{1,3})\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) {
        break;
      }
      paragraphLines.push(next);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
}

export function AIResponse({ content, className }: AIResponseProps) {
  const blocks = parseBlocks(content || '');

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem resposta.</p>;
  }

  return (
    <div className={cn('space-y-3 break-words text-sm leading-relaxed text-foreground', className)}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Heading = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
          return (
            <Heading key={index} className="font-semibold text-foreground">
              {renderInline(block.text)}
            </Heading>
          );
        }

        if (block.type === 'unordered-list') {
          return (
            <ul key={index} className="space-y-1.5 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="list-disc pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered-list') {
          return (
            <ol key={index} className="space-y-1.5 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="list-decimal pl-1">
                  {renderInline(item)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'code') {
          return <CodeBlock key={index} code={block.text} language={block.language} />;
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}