import { useMemo } from 'react';

interface Props {
  text: string;
  className?: string;
}

function escapeHtml(src: string): string {
  return src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 轻量 Markdown 渲染：支持 **粗体**、*斜体*、`code`、[链接](url)、
 * 标题 #、列表 -、代码块、> 引用、换行、分隔线、有序列表。
 * 不使用第三方依赖，避免引入外部库。
 */
function renderInline(src: string): string {
  let out = escapeHtml(src);

  // 行内代码 `code`
  out = out.replace(/`([^`]+)`/g, (_, code) =>
    `<code class="px-1.5 py-0.5 mx-0.5 rounded bg-theme-input text-brand-600 dark:text-brand-300 text-[0.9em] font-mono whitespace-pre-wrap">${code}</code>`,
  );

  // 粗体 **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-theme-primary">$1</strong>');

  // 斜体 *text*
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, (_, p, t) => `${p}<em class="italic">${t}</em>`);

  // 链接 [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-brand-500 hover:underline underline-offset-2">${text}</a>`,
  );

  return out;
}

interface Block {
  type: 'p' | 'h' | 'ul' | 'ol' | 'quote' | 'code' | 'hr';
  content: string;
  level?: number;
  orderedItems?: string[];
  unorderedItems?: string[];
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行跳过
    if (trimmed === '') {
      i++;
      continue;
    }

    // 代码块 ```
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // 跳过结束 ```
      blocks.push({
        type: 'code',
        content: codeLines.join('\n'),
      });
      continue;
    }

    // 分隔线
    if (/^-{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr', content: '' });
      i++;
      continue;
    }

    // 标题 # / ## / ###
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({ type: 'h', level, content: headingMatch[2] });
      i++;
      continue;
    }

    // 引用 >
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', content: quoteLines.join('\n') });
      continue;
    }

    // 无序列表 - / * / +
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', content: '', unorderedItems: items });
      continue;
    }

    // 有序列表 1. / 2.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', content: '', orderedItems: items });
      continue;
    }

    // 段落（可能多行）
    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== ''
      && !lines[i].trim().startsWith('```')
      && !lines[i].trim().startsWith('>')
      && !/^[-*+]\s+/.test(lines[i].trim())
      && !/^\d+\.\s+/.test(lines[i].trim())
      && !/^#{1,6}\s+/.test(lines[i].trim())
      && !/^-{3,}$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      blocks.push({ type: 'p', content: paragraphLines.join(' ') });
    }
  }

  return blocks;
}

function renderBlocks(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'p':
        parts.push(
          `<p class="my-2 leading-relaxed text-theme-secondary">${renderInline(block.content)}</p>`,
        );
        break;
      case 'h': {
        const level = Math.min(6, block.level ?? 2);
        const size = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-sm'][level - 1];
        parts.push(
          `<h${level} class="mt-4 mb-2 ${size} font-bold text-theme-primary">${renderInline(block.content)}</h${level}>`,
        );
        break;
      }
      case 'ul': {
        const items = (block.unorderedItems ?? []).map(
          (it) => `<li class="my-1 pl-1 text-theme-secondary before:mr-2 before:text-brand-500 before:content-['•']">${renderInline(it)}</li>`,
        );
        parts.push(`<ul class="my-3 pl-3 list-none space-y-1">${items.join('')}</ul>`);
        break;
      }
      case 'ol': {
        const items = (block.orderedItems ?? []).map(
          (it, idx) => `<li class="my-1 pl-1 text-theme-secondary"><span class="mr-2 text-brand-500 font-semibold">${idx + 1}.</span>${renderInline(it)}</li>`,
        );
        parts.push(`<ol class="my-3 pl-3 list-none space-y-1">${items.join('')}</ol>`);
        break;
      }
      case 'quote': {
        const inner = block.content.split('\n').map((l) => renderInline(l)).join('<br/>');
        parts.push(
          `<blockquote class="my-3 pl-3 border-l-4 border-brand-500/50 text-theme-secondary italic">${inner}</blockquote>`,
        );
        break;
      }
      case 'code': {
        parts.push(
          `<pre class="my-3 p-3 rounded-lg bg-theme-input text-theme-secondary text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed"><code>${escapeHtml(block.content)}</code></pre>`,
        );
        break;
      }
      case 'hr':
        parts.push(`<hr class="my-4 border-theme"/>`);
        break;
    }
  }
  return parts.join('\n');
}

export default function MarkdownText({ text, className = '' }: Props) {
  const html = useMemo(() => {
    if (!text) return '';
    const blocks = parseBlocks(text);
    return renderBlocks(blocks);
  }, [text]);

  if (!text) return null;

  return (
    <div
      className={`markdown-text ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
