import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const PDF_STUB_MARKER = '_pdf_stub: true';

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

function generatePdfStub(pdfPath: string, postsDir: string): string {
  const relPath = toPosixPath(path.relative(postsDir, pdfPath));
  const title = path.basename(pdfPath, '.pdf');
  const date = getDateFromFile(pdfPath);
  // URL-encode each path segment to handle spaces and CJK chars
  const pdfUrl = `/posts/${relPath.split('/').map(encodeURIComponent).join('/')}`;
  const safeTitle = title.replace(/"/g, '\\"');

  return `---
title: "${safeTitle}"
date: ${date}
_pdf_stub: true
_pdf_url: "${pdfUrl}"
---

[点击在新标签页中打开 PDF](${pdfUrl}){target="_blank" rel="noopener"}
`;
}

function syncPdfStubs(postsDir: string) {
  const pdfFiles = walkPdfFiles(postsDir);

  for (const pdfPath of pdfFiles) {
    const mdPath = pdfPath.replace(/\.pdf$/i, '.md');

    if (fs.existsSync(mdPath)) {
      const existing = fs.readFileSync(mdPath, 'utf-8');
      // Only overwrite if this is still an auto-generated stub
      if (!existing.includes(PDF_STUB_MARKER)) continue;
    }

    fs.writeFileSync(mdPath, generatePdfStub(pdfPath, postsDir), 'utf-8');
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

    // Emit PDF files as Rollup assets so they are included in the build output
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
