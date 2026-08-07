import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

type VitePressCalloutContainer = 'danger' | 'info' | 'tip' | 'warning';

type CalloutMeta = {
  canonicalType: string;
  containerType: VitePressCalloutContainer;
  defaultTitle: string;
};

const calloutAliasMap: Record<string, string> = {
  abstract: 'abstract',
  attention: 'warning',
  bug: 'bug',
  caution: 'warning',
  check: 'success',
  cite: 'quote',
  danger: 'danger',
  done: 'success',
  error: 'danger',
  example: 'example',
  fail: 'failure',
  failure: 'failure',
  faq: 'question',
  help: 'question',
  hint: 'tip',
  important: 'tip',
  info: 'info',
  missing: 'failure',
  note: 'note',
  question: 'question',
  quote: 'quote',
  success: 'success',
  summary: 'abstract',
  tip: 'tip',
  tldr: 'abstract',
  todo: 'todo',
  warning: 'warning',
};

const calloutContainerMap: Record<string, VitePressCalloutContainer> = {
  abstract: 'info',
  bug: 'danger',
  danger: 'danger',
  example: 'info',
  failure: 'danger',
  info: 'info',
  note: 'info',
  question: 'warning',
  quote: 'info',
  success: 'tip',
  tip: 'tip',
  todo: 'info',
  warning: 'warning',
};

const calloutLabelMap: Record<string, string> = {
  abstract: '摘要',
  bug: '缺陷',
  danger: '危险',
  example: '示例',
  failure: '失败',
  info: '信息',
  note: '笔记',
  question: '问题',
  quote: '引用',
  success: '完成',
  tip: '提示',
  todo: '待办',
  warning: '警告',
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

function escapeContainerTitle(value: string) {
  return value.replace(/[{}]/g, '\\$&');
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleCase(value: string) {
  return value
    .replaceAll(/[-_]+/g, ' ')
    .replaceAll(/\b[a-z]/g, (char) => char.toUpperCase());
}

const supportedFenceLanguages = new Set([
  'asm',
  'bash',
  'c',
  'cpp',
  'css',
  'diff',
  'html',
  'ini',
  'java',
  'js',
  'json',
  'makefile',
  'md',
  'perl',
  'py',
  'python',
  'rust',
  'sh',
  'shell',
  'sql',
  'text',
  'toml',
  'ts',
  'txt',
  'vue',
  'xml',
  'yaml',
  'yml',
]);

const fenceLanguageAliasMap: Record<string, string> = {
  bash: 'sh',
  c99: 'c',
  cxx: 'cpp',
  'c++': 'cpp',
  h: 'c',
  header: 'c',
  'objective-c': 'c',
  pl: 'perl',
  py: 'python',
  rs: 'rust',
  s: 'asm',
  shell: 'sh',
  text: 'txt',
  zsh: 'sh',
};

const fenceExtensionLanguageMap: Record<string, string> = {
  '.bash': 'sh',
  '.c': 'c',
  '.cc': 'cpp',
  '.conf': 'ini',
  '.cpp': 'cpp',
  '.css': 'css',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.ini': 'ini',
  '.java': 'java',
  '.js': 'js',
  '.json': 'json',
  '.m': 'c',
  '.make': 'makefile',
  '.md': 'md',
  '.pl': 'perl',
  '.py': 'python',
  '.rs': 'rust',
  '.s': 'asm',
  '.sh': 'sh',
  '.sql': 'sql',
  '.toml': 'toml',
  '.ts': 'ts',
  '.txt': 'txt',
  '.vue': 'vue',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

type NormalizedFenceInfo = {
  info: string;
  title?: string;
};

function sanitizeFenceTitle(value: string) {
  return value.replaceAll(/[\[\]]/g, '');
}

function inferFenceLanguage(bodyLines: string[]) {
  const body = bodyLines.join('\n').trim();
  if (!body) {
    return null;
  }

  if (
    /^(#\s.*\n)?(?:\$ |make\b|qemu\b|gdb\b|addr2line\b|grep\b|cat\b|cd\b|ls\b)/m.test(
      body,
    )
  ) {
    return 'sh';
  }

  if (
    /(?:^|\n)\s*(#include\b|#define\b|typedef\b|struct\b|enum\b|static\b|uint64\b|int\b|void\b)/.test(
      body,
    ) &&
    /[{};]/.test(body)
  ) {
    return 'c';
  }

  if (
    /(?:^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{/.test(body) ||
    (/return\b/.test(body) && /[{};]/.test(body))
  ) {
    return 'c';
  }

  return null;
}

function normalizeFenceLanguageToken(
  token: string,
  bodyLines: string[],
): NormalizedFenceInfo | null {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    const inferred = inferFenceLanguage(bodyLines);
    return inferred ? { info: inferred } : null;
  }

  const lowerToken = normalizedToken.toLowerCase();
  const aliasedLanguage = fenceLanguageAliasMap[lowerToken] || lowerToken;
  if (supportedFenceLanguages.has(aliasedLanguage)) {
    return { info: aliasedLanguage };
  }

  const extension = path.extname(normalizedToken).toLowerCase();
  const fromExtension = fenceExtensionLanguageMap[extension];
  if (fromExtension) {
    return {
      info: fromExtension,
      title: sanitizeFenceTitle(normalizedToken),
    };
  }

  if (['kalloc', 'thread_swtich', 'thread_switch'].includes(lowerToken)) {
    return {
      info: 'c',
      title: sanitizeFenceTitle(normalizedToken),
    };
  }

  const inferred = inferFenceLanguage(bodyLines);
  if (!inferred) {
    return null;
  }

  return {
    info: inferred,
    title: sanitizeFenceTitle(normalizedToken),
  };
}

function normalizeCodeFenceInfo(rawInfo: string, bodyLines: string[]) {
  const trimmed = rawInfo.trim();
  if (!trimmed) {
    return inferFenceLanguage(bodyLines) || '';
  }

  const tokenMatch = trimmed.match(/^\S+/);
  if (!tokenMatch) {
    return trimmed;
  }

  const rawToken = tokenMatch[0];
  const suffix = trimmed.slice(rawToken.length).trim();
  const normalized = normalizeFenceLanguageToken(rawToken, bodyLines);
  if (!normalized) {
    return trimmed;
  }

  const parts = [normalized.info];
  if (normalized.title && !/\[[^\]]+\]/.test(suffix)) {
    parts.push(`[${normalized.title}]`);
  }
  if (suffix) {
    parts.push(suffix);
  }

  return parts.join(' ');
}

function transformCodeFenceLanguages(source: string): string {
  const lines = source.split(/\r?\n/);
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);

    if (!match) {
      result.push(line);
      continue;
    }

    const [, indent, marker, rawInfo] = match;
    const bodyLines: string[] = [];
    let bodyEnd = index + 1;

    while (bodyEnd < lines.length) {
      if (new RegExp(`^\\s*${escapeRegex(marker)}\\s*$`).test(lines[bodyEnd])) {
        break;
      }
      bodyLines.push(lines[bodyEnd]);
      bodyEnd += 1;
    }

    const normalizedInfo = normalizeCodeFenceInfo(rawInfo, bodyLines);
    result.push(
      `${indent}${marker}${normalizedInfo ? ` ${normalizedInfo}` : ''}`,
    );
    result.push(...bodyLines);

    if (bodyEnd < lines.length) {
      result.push(lines[bodyEnd]);
      index = bodyEnd;
      continue;
    }

    index = bodyEnd - 1;
  }

  return result.join('\n');
}

function normalizeCalloutType(rawType: string): CalloutMeta {
  const normalizedType = rawType.trim().toLowerCase().replaceAll(/\s+/g, '-');
  const canonicalType = calloutAliasMap[normalizedType] || normalizedType;

  return {
    canonicalType,
    containerType: calloutContainerMap[canonicalType] || 'info',
    defaultTitle: calloutLabelMap[canonicalType] || titleCase(canonicalType),
  };
}

function renderCalloutFence(
  calloutMeta: CalloutMeta,
  title: string,
  collapseFlag?: '+' | '-',
) {
  const { canonicalType, containerType, defaultTitle } = calloutMeta;
  const resolvedTitle = title || defaultTitle;
  const attrs = [`data-callout="${canonicalType}"`];

  if (!collapseFlag) {
    return `::: ${containerType} ${escapeContainerTitle(resolvedTitle)} {${attrs.join(' ')}}`;
  }

  attrs.push(`data-callout-fold="${collapseFlag === '+' ? 'open' : 'closed'}"`);
  if (collapseFlag === '+') {
    attrs.unshift('open');
  }

  return `::: details ${escapeContainerTitle(resolvedTitle)} {${attrs.join(' ')}}`;
}

function isBlockquoteContinuation(line: string, indent: string) {
  return new RegExp(`^${escapeRegex(indent)}>\\s?`).test(line);
}

function isCalloutStartLine(line: string, indent: string) {
  return new RegExp(
    `^${escapeRegex(indent)}>\\s*\\[![^\\]\\n]+\\]([+-])?\\s*.*$`,
    'i',
  ).test(line);
}

function findNextSignificantLine(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!/^\s*$/.test(lines[index])) {
      return lines[index];
    }
  }

  return null;
}

function stripBlockquotePrefix(line: string, indent: string) {
  return line.replace(new RegExp(`^${escapeRegex(indent)}>\\s?`), indent);
}

function transformObsidianCallouts(source: string): string {
  const lines = source.split(/\r?\n/);
  const result: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)>\s*\[!([^\]\n]+)\]([+-])?\s*(.*)$/i);

    if (!match) {
      result.push(line);
      continue;
    }

    const [, indent, rawType, rawCollapseFlag, rawTitle] = match;
    const collapseFlag = rawCollapseFlag as '+' | '-' | undefined;
    const bodyLines: string[] = [];
    const bodyStart = index + 1;
    let bodyEnd = bodyStart;

    while (bodyEnd < lines.length) {
      const bodyLine = lines[bodyEnd];
      if (isBlockquoteContinuation(bodyLine, indent)) {
        bodyLines.push(stripBlockquotePrefix(bodyLine, indent));
        bodyEnd += 1;
        continue;
      }

      if (/^\s*$/.test(bodyLine)) {
        const nextSignificantLine = findNextSignificantLine(lines, bodyEnd + 1);
        if (
          nextSignificantLine &&
          isBlockquoteContinuation(nextSignificantLine, indent) &&
          !isCalloutStartLine(nextSignificantLine, indent)
        ) {
          bodyLines.push('');
          bodyEnd += 1;
          continue;
        }
      }

      break;
    }

    const calloutMeta = normalizeCalloutType(rawType);
    const title = rawTitle.trim();
    const transformedBody = transformObsidianCallouts(bodyLines.join('\n'));

    result.push(
      `${indent}${renderCalloutFence(calloutMeta, title, collapseFlag)}`,
    );
    if (transformedBody) {
      result.push(transformedBody);
    }
    result.push(`${indent}:::`);

    index = bodyEnd - 1;
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
        renderObsidianEmbed(body, markdownFile, false),
      ),
    );
  }

  return result.join('\n');
}

function transformGalleryBlockquoteHardBreaks(source: string) {
  const lines = source.split(/\r?\n/);

  return lines
    .map((line) => {
      const quoteMatch = line.match(/^(\s*>\s?)(.*)$/);
      if (!quoteMatch) {
        return line;
      }

      const [, , body] = quoteMatch;
      const trimmedBody = body.trim();

      // Keep callout syntax and empty quote lines untouched.
      if (!trimmedBody || /^\[![^\]\n]+\]/i.test(trimmedBody)) {
        return line;
      }

      // Markdown hard break: two trailing spaces.
      if (/\s{2,}$/.test(line)) {
        return line;
      }

      return `${line}  `;
    })
    .join('\n');
}

function transformObsidianMarkdown(
  source: string,
  markdownFile: string,
  preserveBlockquoteLineBreaks = false,
) {
  const normalizedSource = preserveBlockquoteLineBreaks
    ? transformGalleryBlockquoteHardBreaks(source)
    : source;
  const withNormalizedFences = transformCodeFenceLanguages(normalizedSource);
  const withCallouts = transformObsidianCallouts(withNormalizedFences);
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

      const normalizedPath = toPosixPath(filePath);
      const isGalleryMarkdown = /\/gallery\/.+\.md$/.test(normalizedPath);

      return transformObsidianMarkdown(code, filePath, isGalleryMarkdown);
    },
  };
}
