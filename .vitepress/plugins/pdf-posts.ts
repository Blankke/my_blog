import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const PDF_STUB_MARKER = '_pdf_stub: true';
const PDF_STUB_LINK_PATTERN =
  /^\[点击在新标签页中打开 PDF\]\([^)]+\)\{target="_blank" rel="noopener"\}$/;

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

function walkPdfFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];

  const files: string[] = [];
  const pendingDirs = [rootDir];

  while (pendingDirs.length) {
    const currentDir = pendingDirs.pop()!;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(nextPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        files.push(nextPath);
      }
    }
  }

  return files;
}

function getDateFromFile(filePath: string): string {
  try {
    return fs.statSync(filePath).mtime.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function generatePdfNotePage(pdfPath: string, postsDir: string): string {
  const relPath = toPosixPath(path.relative(postsDir, pdfPath));
  const title = path.basename(pdfPath, '.pdf');
  const date = getDateFromFile(pdfPath);
  // 分段编码 URL，兼容目录名里的空格和中文字符。
  const pdfUrl = `/posts/${relPath.split('/').map(encodeURIComponent).join('/')}`;
  const safeTitle = title.replace(/"/g, '\\"');

  return `---
title: "${safeTitle}"
date: ${date}
_pdf_url: "${pdfUrl}"
---

# ${safeTitle}

[点击在新标签页中打开 PDF](${pdfUrl}){target="_blank" rel="noopener"}
`;
}

function getMarkdownBody(source: string) {
  if (!source.startsWith('---')) {
    return source;
  }

  const frontmatterEnd = source.indexOf('\n---', 3);
  if (frontmatterEnd === -1) {
    return source;
  }

  return source.slice(frontmatterEnd + '\n---'.length);
}

function isGeneratedPdfStub(source: string) {
  if (!source.includes(PDF_STUB_MARKER)) {
    return false;
  }

  // 只有“纯 PDF 打开链接”的 Markdown 才视为插件生成的占位页。
  // 一旦用户在正文里补充笔记内容，即使保留了 _pdf_stub 标记，也不再自动覆盖。
  return PDF_STUB_LINK_PATTERN.test(getMarkdownBody(source).trim());
}

function removeLegacyPdfStubMarker(source: string) {
  return source.replace(/^\s*_pdf_stub:\s*true\s*\n/m, '');
}

function syncPdfStubs(postsDir: string) {
  const pdfFiles = walkPdfFiles(postsDir);

  for (const pdfPath of pdfFiles) {
    const mdPath = pdfPath.replace(/\.pdf$/i, '.md');

    if (fs.existsSync(mdPath)) {
      const existing = fs.readFileSync(mdPath, 'utf-8');
      if (isGeneratedPdfStub(existing)) {
        fs.writeFileSync(mdPath, removeLegacyPdfStubMarker(existing), 'utf-8');
      }
      continue;
    }

    fs.writeFileSync(mdPath, generatePdfNotePage(pdfPath, postsDir), 'utf-8');
  }
}

export function pdfPostsPlugin(): Plugin {
  let postsDir = '';
  let srcRoot = '';

  return {
    name: 'pdf-posts',

    configResolved(config) {
      srcRoot = config.root;
      postsDir = path.resolve(srcRoot, 'posts');
      syncPdfStubs(postsDir);
    },

    configureServer(server) {
      server.watcher.add(postsDir);
      server.watcher.on('add', (filePath) => {
        if (filePath.toLowerCase().endsWith('.pdf')) {
          syncPdfStubs(postsDir);
          server.restart();
        }
      });
    },

    // 把 posts 里的 PDF 一起发到构建产物，保证 Markdown 里的 PDF 链接可访问。
    generateBundle() {
      const pdfFiles = walkPdfFiles(postsDir);
      for (const pdfPath of pdfFiles) {
        const relPath = toPosixPath(path.relative(srcRoot, pdfPath));
        this.emitFile({
          type: 'asset',
          fileName: relPath,
          source: fs.readFileSync(pdfPath),
        });
      }
    },
  };
}
