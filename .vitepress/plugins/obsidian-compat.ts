import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const calloutTypeMap: Record<string, string> = {
  abstract: 'info',
  attention: 'warning',
  bug: 'danger',
  caution: 'warning',
  check: 'tip',
  danger: 'danger',
  error: 'danger',
  example: 'info',
  fail: 'danger',
  failure: 'danger',
  hint: 'tip',
  important: 'tip',
  info: 'info',
  note: 'info',
  question: 'warning',
  success: 'tip',
  summary: 'info',
  tip: 'tip',
  tldr: 'info',
  warning: 'warning',
};

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveAttachment(markdownFile: string, target: string) {
  const markdownDir = path.dirname(markdownFile);
  const candidates = [
    path.resolve(markdownDir, target),
    path.resolve(markdownDir, 'img', target),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const relativePath = toPosixPath(path.relative(markdownDir, candidate));
      return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    }
  }

  return null;
}

function transformObsidianCallouts(source: string) {
  const lines = source.split(/\r?\n/);
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^>\s*\[!([^\]]+)\]([+-])?\s*(.*)$/i);

    if (!match) {
      result.push(line);
      continue;
    }

    const [, rawType, _collapseFlag, rawTitle] = match;
    const typeParts = rawType.trim().split(/\s+/);
    const normalizedType = (typeParts.shift() || 'info').toLowerCase();
    const containerType = calloutTypeMap[normalizedType] || 'info';
    const title = rawTitle.trim() || typeParts.join(' ');

    result.push(`::: ${containerType}${title ? ` ${title}` : ''}`);

    index += 1;
    while (index < lines.length && /^>\s?/.test(lines[index])) {
      result.push(lines[index].replace(/^>\s?/, ''));
      index += 1;
    }

    result.push(':::');
    index -= 1;
  }

  return result.join('\n');
}

function renderObsidianEmbed(body: string, markdownFile: string, block = true) {
    const [rawTarget, rawMeta] = body.split('|', 2);
    const target = rawTarget.trim();
    const meta = rawMeta?.trim();
    const resolved = resolveAttachment(markdownFile, target);

    if (!resolved) {
      return block
        ? `<div class="obsidian-missing-asset">缺失附件：<code>${escapeHtml(target)}</code></div>`
        : `<span class="obsidian-missing-asset-inline">缺失附件：<code>${escapeHtml(target)}</code></span>`;
    }

    const alt = escapeHtml(path.basename(target, path.extname(target)));
    const attrs = [
      `src="${encodeURI(resolved)}"`,
      `alt="${alt}"`,
      'class="obsidian-embed-image"',
      'loading="lazy"',
      'decoding="async"',
    ];

    let caption = '';
    if (meta) {
      if (/^\d+$/.test(meta)) {
        attrs.push(`width="${meta}"`);
      } else {
        const safeMeta = escapeHtml(meta);
        attrs.push(`title="${safeMeta}"`);
        caption = `<figcaption>${safeMeta}</figcaption>`;
      }
    }

    if (!block) {
      return `<img ${attrs.join(' ')} />`;
    }

    return `<figure class="obsidian-figure"><img ${attrs.join(' ')} />${caption}</figure>`;
}

function transformObsidianEmbeds(source: string, markdownFile: string) {
  const lines = source.split(/\r?\n/);
  const result: string[] = [];

  for (const line of lines) {
    const standaloneMatch = line.match(/^(\s*)!\[\[([^\]\n]+)\]\]\s*$/);
    if (standaloneMatch) {
      const [, indent, body] = standaloneMatch;
      result.push('');
      result.push(`${indent}${renderObsidianEmbed(body, markdownFile, true)}`);
      result.push('');
      continue;
    }

    const listItemMatch = line.match(/^(\s*[-*+]\s+)!\[\[([^\]\n]+)\]\]\s*$/);
    if (listItemMatch) {
      const [, prefix, body] = listItemMatch;
      result.push(`${prefix}${renderObsidianEmbed(body, markdownFile, true)}`);
      continue;
    }

    result.push(
      line.replace(/!\[\[([^\]\n]+)\]\]/g, (_fullMatch, body: string) =>
        renderObsidianEmbed(body, markdownFile, false))
    );
  }

  return result.join('\n');
}

function transformObsidianMarkdown(source: string, markdownFile: string) {
  const withCallouts = transformObsidianCallouts(source);
  return transformObsidianEmbeds(withCallouts, markdownFile);
}

export function obsidianCompatPlugin(): Plugin {
  return {
    name: 'obsidian-compat',
    enforce: 'pre',
    transform(code, id) {
      const [filePath] = id.split('?', 1);
      if (!filePath.endsWith('.md')) {
        return null;
      }

      return transformObsidianMarkdown(code, filePath);
    },
  };
}
