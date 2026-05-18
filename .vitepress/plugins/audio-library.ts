/**
 * 用法示例：
 * vite: {
 *   plugins: [siteAudioLibraryPlugin()],
 * }
 *
 * 说明：
 * 在构建期和开发期扫描 `public/audio` 下的音频文件，
 * 并通过 `virtual:site-audio-library` 暴露给前端播放器使用。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { normalizePath } from 'vite';

const virtualModuleId = 'virtual:site-audio-library';
const resolvedVirtualModuleId = `\0${virtualModuleId}`;
const supportedAudioExtensions = new Set([
  '.aac',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.opus',
  '.wav',
  '.webm',
]);

interface SiteAudioLibraryItem {
  filename: string;
  label: string;
  src: string;
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

function toTrackLabel(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function walkAudioFiles(rootDir: string) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files: string[] = [];
  const pendingDirs = [rootDir];

  while (pendingDirs.length) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) {
      continue;
    }

    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(nextPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (
        !supportedAudioExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        continue;
      }

      files.push(nextPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function buildAudioLibrary(publicAudioDir: string): SiteAudioLibraryItem[] {
  return walkAudioFiles(publicAudioDir).map((absoluteFilePath) => {
    const relativePath = toPosixPath(
      path.relative(publicAudioDir, absoluteFilePath),
    );
    const fileName = path.basename(absoluteFilePath);

    return {
      filename: fileName,
      label: toTrackLabel(fileName),
      src: `/audio/${relativePath}`,
    };
  });
}

function invalidateVirtualModule(
  server: ViteDevServer,
  publicAudioDir: string,
  changedFilePath: string,
) {
  const normalizedAudioDir = normalizePath(publicAudioDir);
  const normalizedChangedPath = normalizePath(changedFilePath);

  if (!normalizedChangedPath.startsWith(normalizedAudioDir)) {
    return;
  }

  const module = server.moduleGraph.getModuleById(resolvedVirtualModuleId);
  if (module) {
    server.moduleGraph.invalidateModule(module);
  }

  server.ws.send({
    type: 'full-reload',
  });
}

export function siteAudioLibraryPlugin() {
  const publicAudioDir = path.resolve(process.cwd(), 'public/audio');

  return {
    name: 'site-audio-library',
    resolveId(source) {
      if (source === virtualModuleId) {
        return resolvedVirtualModuleId;
      }

      return null;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) {
        return null;
      }

      const library = buildAudioLibrary(publicAudioDir);
      return [
        `export const audioLibrary = ${JSON.stringify(library, null, 2)};`,
        'export default audioLibrary;',
      ].join('\n');
    },
    configureServer(server) {
      if (fs.existsSync(publicAudioDir)) {
        server.watcher.add(publicAudioDir);
      }
    },
    handleHotUpdate(context) {
      invalidateVirtualModule(context.server, publicAudioDir, context.file);
    },
  } satisfies Plugin;
}
