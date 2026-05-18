// .vitepress/config.mts
import { defineConfig, getThemeConfig } from "file:///D:/blog/node_modules/@sugarat/theme/node.mjs";
import mathjax3 from "file:///D:/blog/node_modules/markdown-it-mathjax3/index.js";

// .vitepress/plugins/audio-library.ts
import fs from "node:fs";
import path from "node:path";
import { normalizePath } from "file:///D:/blog/node_modules/vite/dist/node/index.js";
var virtualModuleId = "virtual:site-audio-library";
var resolvedVirtualModuleId = `\0${virtualModuleId}`;
var supportedAudioExtensions = /* @__PURE__ */ new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".webm"
]);
function toPosixPath(value) {
  return value.split(path.sep).join("/");
}
function toTrackLabel(fileName) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}
function walkAudioFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const files = [];
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
      if (!supportedAudioExtensions.has(path.extname(entry.name).toLowerCase())) {
        continue;
      }
      files.push(nextPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, "zh-CN"));
}
function buildAudioLibrary(publicAudioDir) {
  return walkAudioFiles(publicAudioDir).map((absoluteFilePath) => {
    const relativePath = toPosixPath(
      path.relative(publicAudioDir, absoluteFilePath)
    );
    const fileName = path.basename(absoluteFilePath);
    return {
      filename: fileName,
      label: toTrackLabel(fileName),
      src: `/audio/${relativePath}`
    };
  });
}
function invalidateVirtualModule(server, publicAudioDir, changedFilePath) {
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
    type: "full-reload"
  });
}
function siteAudioLibraryPlugin() {
  const publicAudioDir = path.resolve(process.cwd(), "public/audio");
  return {
    name: "site-audio-library",
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
        "export default audioLibrary;"
      ].join("\n");
    },
    configureServer(server) {
      if (fs.existsSync(publicAudioDir)) {
        server.watcher.add(publicAudioDir);
      }
    },
    handleHotUpdate(context) {
      invalidateVirtualModule(context.server, publicAudioDir, context.file);
    }
  };
}

// .vitepress/plugins/obsidian-compat.ts
import fs2 from "node:fs";
import path2 from "node:path";
var calloutAliasMap = {
  abstract: "abstract",
  attention: "warning",
  bug: "bug",
  caution: "warning",
  check: "success",
  cite: "quote",
  danger: "danger",
  done: "success",
  error: "danger",
  example: "example",
  fail: "failure",
  failure: "failure",
  faq: "question",
  help: "question",
  hint: "tip",
  important: "tip",
  info: "info",
  missing: "failure",
  note: "note",
  question: "question",
  quote: "quote",
  success: "success",
  summary: "abstract",
  tip: "tip",
  tldr: "abstract",
  todo: "todo",
  warning: "warning"
};
var calloutContainerMap = {
  abstract: "info",
  bug: "danger",
  danger: "danger",
  example: "info",
  failure: "danger",
  info: "info",
  note: "info",
  question: "warning",
  quote: "info",
  success: "tip",
  tip: "tip",
  todo: "info",
  warning: "warning"
};
var calloutLabelMap = {
  abstract: "\u6458\u8981",
  bug: "\u7F3A\u9677",
  danger: "\u5371\u9669",
  example: "\u793A\u4F8B",
  failure: "\u5931\u8D25",
  info: "\u4FE1\u606F",
  note: "\u7B14\u8BB0",
  question: "\u95EE\u9898",
  quote: "\u5F15\u7528",
  success: "\u5B8C\u6210",
  tip: "\u63D0\u793A",
  todo: "\u5F85\u529E",
  warning: "\u8B66\u544A"
};
function toPosixPath2(value) {
  return value.split(path2.sep).join("/");
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function resolveAttachment(markdownFile, target) {
  const markdownDir = path2.dirname(markdownFile);
  const candidates = [
    path2.resolve(markdownDir, target),
    path2.resolve(markdownDir, "img", target)
  ];
  for (const candidate of candidates) {
    if (fs2.existsSync(candidate) && fs2.statSync(candidate).isFile()) {
      const relativePath = toPosixPath2(path2.relative(markdownDir, candidate));
      return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
    }
  }
  return null;
}
function escapeContainerTitle(value) {
  return value.replace(/[{}]/g, "\\$&");
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function titleCase(value) {
  return value.replaceAll(/[-_]+/g, " ").replaceAll(/\b[a-z]/g, (char) => char.toUpperCase());
}
var supportedFenceLanguages = /* @__PURE__ */ new Set([
  "asm",
  "bash",
  "c",
  "cpp",
  "css",
  "diff",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "makefile",
  "md",
  "perl",
  "py",
  "python",
  "rust",
  "sh",
  "shell",
  "sql",
  "text",
  "toml",
  "ts",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml"
]);
var fenceLanguageAliasMap = {
  bash: "sh",
  c99: "c",
  cxx: "cpp",
  "c++": "cpp",
  h: "c",
  header: "c",
  "objective-c": "c",
  pl: "perl",
  py: "python",
  rs: "rust",
  s: "asm",
  shell: "sh",
  text: "txt",
  zsh: "sh"
};
var fenceExtensionLanguageMap = {
  ".bash": "sh",
  ".c": "c",
  ".cc": "cpp",
  ".conf": "ini",
  ".cpp": "cpp",
  ".css": "css",
  ".h": "c",
  ".hpp": "cpp",
  ".html": "html",
  ".ini": "ini",
  ".java": "java",
  ".js": "js",
  ".json": "json",
  ".m": "c",
  ".make": "makefile",
  ".md": "md",
  ".pl": "perl",
  ".py": "python",
  ".rs": "rust",
  ".s": "asm",
  ".sh": "sh",
  ".sql": "sql",
  ".toml": "toml",
  ".ts": "ts",
  ".txt": "txt",
  ".vue": "vue",
  ".xml": "xml",
  ".yaml": "yaml",
  ".yml": "yaml"
};
function sanitizeFenceTitle(value) {
  return value.replaceAll(/[\[\]]/g, "");
}
function inferFenceLanguage(bodyLines) {
  const body = bodyLines.join("\n").trim();
  if (!body) {
    return null;
  }
  if (/^(#\s.*\n)?(?:\$ |make\b|qemu\b|gdb\b|addr2line\b|grep\b|cat\b|cd\b|ls\b)/m.test(
    body
  )) {
    return "sh";
  }
  if (/(?:^|\n)\s*(#include\b|#define\b|typedef\b|struct\b|enum\b|static\b|uint64\b|int\b|void\b)/.test(
    body
  ) && /[{};]/.test(body)) {
    return "c";
  }
  if (/(?:^|\n)\s*[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*\{/.test(body) || /return\b/.test(body) && /[{};]/.test(body)) {
    return "c";
  }
  return null;
}
function normalizeFenceLanguageToken(token, bodyLines) {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    const inferred2 = inferFenceLanguage(bodyLines);
    return inferred2 ? { info: inferred2 } : null;
  }
  const lowerToken = normalizedToken.toLowerCase();
  const aliasedLanguage = fenceLanguageAliasMap[lowerToken] || lowerToken;
  if (supportedFenceLanguages.has(aliasedLanguage)) {
    return { info: aliasedLanguage };
  }
  const extension = path2.extname(normalizedToken).toLowerCase();
  const fromExtension = fenceExtensionLanguageMap[extension];
  if (fromExtension) {
    return {
      info: fromExtension,
      title: sanitizeFenceTitle(normalizedToken)
    };
  }
  if (["kalloc", "thread_swtich", "thread_switch"].includes(lowerToken)) {
    return {
      info: "c",
      title: sanitizeFenceTitle(normalizedToken)
    };
  }
  const inferred = inferFenceLanguage(bodyLines);
  if (!inferred) {
    return null;
  }
  return {
    info: inferred,
    title: sanitizeFenceTitle(normalizedToken)
  };
}
function normalizeCodeFenceInfo(rawInfo, bodyLines) {
  const trimmed = rawInfo.trim();
  if (!trimmed) {
    return inferFenceLanguage(bodyLines) || "";
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
  return parts.join(" ");
}
function transformCodeFenceLanguages(source) {
  const lines = source.split(/\r?\n/);
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!match) {
      result.push(line);
      continue;
    }
    const [, indent, marker, rawInfo] = match;
    const bodyLines = [];
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
      `${indent}${marker}${normalizedInfo ? ` ${normalizedInfo}` : ""}`
    );
    result.push(...bodyLines);
    if (bodyEnd < lines.length) {
      result.push(lines[bodyEnd]);
      index = bodyEnd;
      continue;
    }
    index = bodyEnd - 1;
  }
  return result.join("\n");
}
function normalizeCalloutType(rawType) {
  const normalizedType = rawType.trim().toLowerCase().replaceAll(/\s+/g, "-");
  const canonicalType = calloutAliasMap[normalizedType] || normalizedType;
  return {
    canonicalType,
    containerType: calloutContainerMap[canonicalType] || "info",
    defaultTitle: calloutLabelMap[canonicalType] || titleCase(canonicalType)
  };
}
function renderCalloutFence(calloutMeta, title, collapseFlag) {
  const { canonicalType, containerType, defaultTitle } = calloutMeta;
  const resolvedTitle = title || defaultTitle;
  const attrs = [`data-callout="${canonicalType}"`];
  if (!collapseFlag) {
    return `::: ${containerType} ${escapeContainerTitle(resolvedTitle)} {${attrs.join(" ")}}`;
  }
  attrs.push(`data-callout-fold="${collapseFlag === "+" ? "open" : "closed"}"`);
  if (collapseFlag === "+") {
    attrs.unshift("open");
  }
  return `::: details ${escapeContainerTitle(resolvedTitle)} {${attrs.join(" ")}}`;
}
function isBlockquoteContinuation(line, indent) {
  return new RegExp(`^${escapeRegex(indent)}>\\s?`).test(line);
}
function isCalloutStartLine(line, indent) {
  return new RegExp(
    `^${escapeRegex(indent)}>\\s*\\[![^\\]\\n]+\\]([+-])?\\s*.*$`,
    "i"
  ).test(line);
}
function findNextSignificantLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!/^\s*$/.test(lines[index])) {
      return lines[index];
    }
  }
  return null;
}
function stripBlockquotePrefix(line, indent) {
  return line.replace(new RegExp(`^${escapeRegex(indent)}>\\s?`), indent);
}
function transformObsidianCallouts(source) {
  const lines = source.split(/\r?\n/);
  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(\s*)>\s*\[!([^\]\n]+)\]([+-])?\s*(.*)$/i);
    if (!match) {
      result.push(line);
      continue;
    }
    const [, indent, rawType, rawCollapseFlag, rawTitle] = match;
    const collapseFlag = rawCollapseFlag;
    const bodyLines = [];
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
        if (nextSignificantLine && isBlockquoteContinuation(nextSignificantLine, indent) && !isCalloutStartLine(nextSignificantLine, indent)) {
          bodyLines.push("");
          bodyEnd += 1;
          continue;
        }
      }
      break;
    }
    const calloutMeta = normalizeCalloutType(rawType);
    const title = rawTitle.trim();
    const transformedBody = transformObsidianCallouts(bodyLines.join("\n"));
    result.push(
      `${indent}${renderCalloutFence(calloutMeta, title, collapseFlag)}`
    );
    if (transformedBody) {
      result.push(transformedBody);
    }
    result.push(`${indent}:::`);
    index = bodyEnd - 1;
  }
  return result.join("\n");
}
function renderObsidianEmbed(body, markdownFile, block = true) {
  const [rawTarget, rawMeta] = body.split("|", 2);
  const target = rawTarget.trim();
  const meta = rawMeta?.trim();
  const resolved = resolveAttachment(markdownFile, target);
  if (!resolved) {
    return block ? `<div class="obsidian-missing-asset">\u7F3A\u5931\u9644\u4EF6\uFF1A<code>${escapeHtml(target)}</code></div>` : `<span class="obsidian-missing-asset-inline">\u7F3A\u5931\u9644\u4EF6\uFF1A<code>${escapeHtml(target)}</code></span>`;
  }
  const alt = escapeHtml(path2.basename(target, path2.extname(target)));
  const attrs = [
    `src="${encodeURI(resolved)}"`,
    `alt="${alt}"`,
    'class="obsidian-embed-image"',
    'loading="lazy"',
    'decoding="async"'
  ];
  let caption = "";
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
    return `<img ${attrs.join(" ")} />`;
  }
  return `<figure class="obsidian-figure"><img ${attrs.join(" ")} />${caption}</figure>`;
}
function transformObsidianEmbeds(source, markdownFile) {
  const lines = source.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    const standaloneMatch = line.match(/^(\s*)!\[\[([^\]\n]+)\]\]\s*$/);
    if (standaloneMatch) {
      const [, indent, body] = standaloneMatch;
      result.push("");
      result.push(`${indent}${renderObsidianEmbed(body, markdownFile, true)}`);
      result.push("");
      continue;
    }
    const listItemMatch = line.match(/^(\s*[-*+]\s+)!\[\[([^\]\n]+)\]\]\s*$/);
    if (listItemMatch) {
      const [, prefix, body] = listItemMatch;
      result.push(`${prefix}${renderObsidianEmbed(body, markdownFile, true)}`);
      continue;
    }
    result.push(
      line.replace(
        /!\[\[([^\]\n]+)\]\]/g,
        (_fullMatch, body) => renderObsidianEmbed(body, markdownFile, false)
      )
    );
  }
  return result.join("\n");
}
function transformObsidianMarkdown(source, markdownFile) {
  const withNormalizedFences = transformCodeFenceLanguages(source);
  const withCallouts = transformObsidianCallouts(withNormalizedFences);
  return transformObsidianEmbeds(withCallouts, markdownFile);
}
function obsidianCompatPlugin() {
  return {
    name: "obsidian-compat",
    enforce: "pre",
    transform(code, id) {
      const [filePath] = id.split("?", 1);
      if (!filePath.endsWith(".md")) {
        return null;
      }
      return transformObsidianMarkdown(code, filePath);
    }
  };
}

// .vitepress/config.mts
var theme = getThemeConfig({
  footer: {
    version: true,
    copyright: "Blankke",
    bottomMessage: '<a class="site-readme-link" href="/README">README</a>'
  },
  themeColor: "el-blue",
  author: "Blankke"
});
var config_default = defineConfig({
  extends: theme,
  lang: "zh-cn",
  title: "Blankke's Blog",
  description: "\u8BB0\u5F55\u5B66\u4E60\u3001\u5B9E\u8DF5\u4E0E\u4E00\u70B9\u70B9\u5F00\u6E90\u6298\u817E\u3002",
  lastUpdated: true,
  // 详见：https://vitepress.dev/zh/reference/site-config#head
  head: [["link", { rel: "icon", href: "/favicon.svg" }]],
  cleanUrls: true,
  themeConfig: {
    outline: {
      level: "deep",
      label: "\u76EE\u5F55"
    },
    returnToTopLabel: "\u56DE\u5230\u9876\u90E8",
    sidebarMenuLabel: "\u76F8\u5173\u6587\u7AE0",
    lastUpdatedText: "\u4E0A\u6B21\u66F4\u65B0\u4E8E",
    logo: "/avatar.png",
    nav: [
      { text: "\u9996\u9875", link: "/" },
      {
        text: "\u6587\u7AE0",
        items: [
          { text: "\u6587\u7AE0\u5F52\u6863", link: "/posts/" },
          {
            text: "2025\u6625\u64CD\u4F5C\u7CFB\u7EDF\u8BFE\u7A0B\u7B14\u8BB0",
            link: "/posts/2025\u6625\u64CD\u4F5C\u7CFB\u7EDF\u8BFE\u7A0B\u7B14\u8BB0/"
          },
          { text: "Matmul Fusion \u4E13\u9898", link: "/posts/Matmul Fusion/" },
          { text: "MIT S081 \u4E13\u9898", link: "/posts/S081 xv6-labs-2021/" }
        ]
      },
      { text: "\u753B\u5ECA", link: "/?view=gallery" },
      { text: "\u5173\u4E8E", link: "/about" }
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/Blankke"
      }
    ]
  },
  markdown: {
    container: {
      infoLabel: "\u4FE1\u606F",
      noteLabel: "\u6CE8\u610F",
      tipLabel: "\u63D0\u793A",
      warningLabel: "\u8B66\u544A",
      dangerLabel: "\u5371\u9669",
      detailsLabel: "\u8BE6\u7EC6\u4FE1\u606F",
      importantLabel: "\u91CD\u8981",
      cautionLabel: "\u5C0F\u5FC3"
    },
    config(md) {
      md.use(mathjax3);
    }
  },
  vite: {
    plugins: [obsidianCompatPlugin(), siteAudioLibraryPlugin()]
  }
});
export {
  config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLnZpdGVwcmVzcy9jb25maWcubXRzIiwgIi52aXRlcHJlc3MvcGx1Z2lucy9hdWRpby1saWJyYXJ5LnRzIiwgIi52aXRlcHJlc3MvcGx1Z2lucy9vYnNpZGlhbi1jb21wYXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxibG9nXFxcXC52aXRlcHJlc3NcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXGJsb2dcXFxcLnZpdGVwcmVzc1xcXFxjb25maWcubXRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9ibG9nLy52aXRlcHJlc3MvY29uZmlnLm10c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZywgZ2V0VGhlbWVDb25maWcgfSBmcm9tICdAc3VnYXJhdC90aGVtZS9ub2RlJztcbmltcG9ydCBtYXRoamF4MyBmcm9tICdtYXJrZG93bi1pdC1tYXRoamF4Myc7XG5pbXBvcnQgeyBzaXRlQXVkaW9MaWJyYXJ5UGx1Z2luIH0gZnJvbSAnLi9wbHVnaW5zL2F1ZGlvLWxpYnJhcnknO1xuaW1wb3J0IHsgb2JzaWRpYW5Db21wYXRQbHVnaW4gfSBmcm9tICcuL3BsdWdpbnMvb2JzaWRpYW4tY29tcGF0JztcblxuY29uc3QgdGhlbWUgPSBnZXRUaGVtZUNvbmZpZyh7XG4gIGZvb3Rlcjoge1xuICAgIHZlcnNpb246IHRydWUsXG4gICAgY29weXJpZ2h0OiAnQmxhbmtrZScsXG4gICAgYm90dG9tTWVzc2FnZTogJzxhIGNsYXNzPVwic2l0ZS1yZWFkbWUtbGlua1wiIGhyZWY9XCIvUkVBRE1FXCI+UkVBRE1FPC9hPicsXG4gIH0sXG4gIHRoZW1lQ29sb3I6ICdlbC1ibHVlJyxcbiAgYXV0aG9yOiAnQmxhbmtrZScsXG59KTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgZXh0ZW5kczogdGhlbWUsXG4gIGxhbmc6ICd6aC1jbicsXG4gIHRpdGxlOiBcIkJsYW5ra2UncyBCbG9nXCIsXG4gIGRlc2NyaXB0aW9uOiAnXHU4QkIwXHU1RjU1XHU1QjY2XHU0RTYwXHUzMDAxXHU1QjlFXHU4REY1XHU0RTBFXHU0RTAwXHU3MEI5XHU3MEI5XHU1RjAwXHU2RTkwXHU2Mjk4XHU4MTdFXHUzMDAyJyxcbiAgbGFzdFVwZGF0ZWQ6IHRydWUsXG4gIC8vIFx1OEJFNlx1ODlDMVx1RkYxQWh0dHBzOi8vdml0ZXByZXNzLmRldi96aC9yZWZlcmVuY2Uvc2l0ZS1jb25maWcjaGVhZFxuICBoZWFkOiBbWydsaW5rJywgeyByZWw6ICdpY29uJywgaHJlZjogJy9mYXZpY29uLnN2ZycgfV1dLFxuICBjbGVhblVybHM6IHRydWUsXG4gIHRoZW1lQ29uZmlnOiB7XG4gICAgb3V0bGluZToge1xuICAgICAgbGV2ZWw6ICdkZWVwJyxcbiAgICAgIGxhYmVsOiAnXHU3NkVFXHU1RjU1JyxcbiAgICB9LFxuICAgIHJldHVyblRvVG9wTGFiZWw6ICdcdTU2REVcdTUyMzBcdTk4NzZcdTkwRTgnLFxuICAgIHNpZGViYXJNZW51TGFiZWw6ICdcdTc2RjhcdTUxNzNcdTY1ODdcdTdBRTAnLFxuICAgIGxhc3RVcGRhdGVkVGV4dDogJ1x1NEUwQVx1NkIyMVx1NjZGNFx1NjVCMFx1NEU4RScsXG5cbiAgICBsb2dvOiAnL2F2YXRhci5wbmcnLFxuICAgIG5hdjogW1xuICAgICAgeyB0ZXh0OiAnXHU5OTk2XHU5ODc1JywgbGluazogJy8nIH0sXG4gICAgICB7XG4gICAgICAgIHRleHQ6ICdcdTY1ODdcdTdBRTAnLFxuICAgICAgICBpdGVtczogW1xuICAgICAgICAgIHsgdGV4dDogJ1x1NjU4N1x1N0FFMFx1NUY1Mlx1Njg2MycsIGxpbms6ICcvcG9zdHMvJyB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHRleHQ6ICcyMDI1XHU2NjI1XHU2NENEXHU0RjVDXHU3Q0ZCXHU3RURGXHU4QkZFXHU3QTBCXHU3QjE0XHU4QkIwJyxcbiAgICAgICAgICAgIGxpbms6ICcvcG9zdHMvMjAyNVx1NjYyNVx1NjRDRFx1NEY1Q1x1N0NGQlx1N0VERlx1OEJGRVx1N0EwQlx1N0IxNFx1OEJCMC8nLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgeyB0ZXh0OiAnTWF0bXVsIEZ1c2lvbiBcdTRFMTNcdTk4OTgnLCBsaW5rOiAnL3Bvc3RzL01hdG11bCBGdXNpb24vJyB9LFxuICAgICAgICAgIHsgdGV4dDogJ01JVCBTMDgxIFx1NEUxM1x1OTg5OCcsIGxpbms6ICcvcG9zdHMvUzA4MSB4djYtbGFicy0yMDIxLycgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB7IHRleHQ6ICdcdTc1M0JcdTVFQ0EnLCBsaW5rOiAnLz92aWV3PWdhbGxlcnknIH0sXG4gICAgICB7IHRleHQ6ICdcdTUxNzNcdTRFOEUnLCBsaW5rOiAnL2Fib3V0JyB9LFxuICAgIF0sXG4gICAgc29jaWFsTGlua3M6IFtcbiAgICAgIHtcbiAgICAgICAgaWNvbjogJ2dpdGh1YicsXG4gICAgICAgIGxpbms6ICdodHRwczovL2dpdGh1Yi5jb20vQmxhbmtrZScsXG4gICAgICB9LFxuICAgIF0sXG4gIH0sXG4gIG1hcmtkb3duOiB7XG4gICAgY29udGFpbmVyOiB7XG4gICAgICBpbmZvTGFiZWw6ICdcdTRGRTFcdTYwNkYnLFxuICAgICAgbm90ZUxhYmVsOiAnXHU2Q0U4XHU2MTBGJyxcbiAgICAgIHRpcExhYmVsOiAnXHU2M0QwXHU3OTNBJyxcbiAgICAgIHdhcm5pbmdMYWJlbDogJ1x1OEI2Nlx1NTQ0QScsXG4gICAgICBkYW5nZXJMYWJlbDogJ1x1NTM3MVx1OTY2OScsXG4gICAgICBkZXRhaWxzTGFiZWw6ICdcdThCRTZcdTdFQzZcdTRGRTFcdTYwNkYnLFxuICAgICAgaW1wb3J0YW50TGFiZWw6ICdcdTkxQ0RcdTg5ODEnLFxuICAgICAgY2F1dGlvbkxhYmVsOiAnXHU1QzBGXHU1RkMzJyxcbiAgICB9LFxuICAgIGNvbmZpZyhtZCkge1xuICAgICAgbWQudXNlKG1hdGhqYXgzKTtcbiAgICB9LFxuICB9LFxuICB2aXRlOiB7XG4gICAgcGx1Z2luczogW29ic2lkaWFuQ29tcGF0UGx1Z2luKCksIHNpdGVBdWRpb0xpYnJhcnlQbHVnaW4oKV0sXG4gIH0sXG59KTtcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcYmxvZ1xcXFwudml0ZXByZXNzXFxcXHBsdWdpbnNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXGJsb2dcXFxcLnZpdGVwcmVzc1xcXFxwbHVnaW5zXFxcXGF1ZGlvLWxpYnJhcnkudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L2Jsb2cvLnZpdGVwcmVzcy9wbHVnaW5zL2F1ZGlvLWxpYnJhcnkudHNcIjsvKipcbiAqIFx1NzUyOFx1NkNENVx1NzkzQVx1NEY4Qlx1RkYxQVxuICogdml0ZToge1xuICogICBwbHVnaW5zOiBbc2l0ZUF1ZGlvTGlicmFyeVBsdWdpbigpXSxcbiAqIH1cbiAqXG4gKiBcdThCRjRcdTY2MEVcdUZGMUFcbiAqIFx1NTcyOFx1Njc4NFx1NUVGQVx1NjcxRlx1NTQ4Q1x1NUYwMFx1NTNEMVx1NjcxRlx1NjI2Qlx1NjNDRiBgcHVibGljL2F1ZGlvYCBcdTRFMEJcdTc2ODRcdTk3RjNcdTk4OTFcdTY1ODdcdTRFRjZcdUZGMENcbiAqIFx1NUU3Nlx1OTAxQVx1OEZDNyBgdmlydHVhbDpzaXRlLWF1ZGlvLWxpYnJhcnlgIFx1NjZCNFx1OTczMlx1N0VEOVx1NTI0RFx1N0FFRlx1NjRBRFx1NjUzRVx1NTY2OFx1NEY3Rlx1NzUyOFx1MzAwMlxuICovXG5pbXBvcnQgZnMgZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgcGF0aCBmcm9tICdub2RlOnBhdGgnO1xuaW1wb3J0IHR5cGUgeyBQbHVnaW4sIFZpdGVEZXZTZXJ2ZXIgfSBmcm9tICd2aXRlJztcbmltcG9ydCB7IG5vcm1hbGl6ZVBhdGggfSBmcm9tICd2aXRlJztcblxuY29uc3QgdmlydHVhbE1vZHVsZUlkID0gJ3ZpcnR1YWw6c2l0ZS1hdWRpby1saWJyYXJ5JztcbmNvbnN0IHJlc29sdmVkVmlydHVhbE1vZHVsZUlkID0gYFxcMCR7dmlydHVhbE1vZHVsZUlkfWA7XG5jb25zdCBzdXBwb3J0ZWRBdWRpb0V4dGVuc2lvbnMgPSBuZXcgU2V0KFtcbiAgJy5hYWMnLFxuICAnLmZsYWMnLFxuICAnLm00YScsXG4gICcubXAzJyxcbiAgJy5vZ2cnLFxuICAnLm9wdXMnLFxuICAnLndhdicsXG4gICcud2VibScsXG5dKTtcblxuaW50ZXJmYWNlIFNpdGVBdWRpb0xpYnJhcnlJdGVtIHtcbiAgZmlsZW5hbWU6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgc3JjOiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIHRvUG9zaXhQYXRoKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHZhbHVlLnNwbGl0KHBhdGguc2VwKS5qb2luKCcvJyk7XG59XG5cbmZ1bmN0aW9uIHRvVHJhY2tMYWJlbChmaWxlTmFtZTogc3RyaW5nKSB7XG4gIHJldHVybiBmaWxlTmFtZVxuICAgIC5yZXBsYWNlKC9cXC5bXi5dKyQvLCAnJylcbiAgICAucmVwbGFjZSgvW19dKy9nLCAnICcpXG4gICAgLnJlcGxhY2UoL1xccysvZywgJyAnKVxuICAgIC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIHdhbGtBdWRpb0ZpbGVzKHJvb3REaXI6IHN0cmluZykge1xuICBpZiAoIWZzLmV4aXN0c1N5bmMocm9vdERpcikpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCBmaWxlczogc3RyaW5nW10gPSBbXTtcbiAgY29uc3QgcGVuZGluZ0RpcnMgPSBbcm9vdERpcl07XG5cbiAgd2hpbGUgKHBlbmRpbmdEaXJzLmxlbmd0aCkge1xuICAgIGNvbnN0IGN1cnJlbnREaXIgPSBwZW5kaW5nRGlycy5wb3AoKTtcbiAgICBpZiAoIWN1cnJlbnREaXIpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZW50cnkgb2YgZnMucmVhZGRpclN5bmMoY3VycmVudERpciwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pKSB7XG4gICAgICBjb25zdCBuZXh0UGF0aCA9IHBhdGguam9pbihjdXJyZW50RGlyLCBlbnRyeS5uYW1lKTtcbiAgICAgIGlmIChlbnRyeS5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgIHBlbmRpbmdEaXJzLnB1c2gobmV4dFBhdGgpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFlbnRyeS5pc0ZpbGUoKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhc3VwcG9ydGVkQXVkaW9FeHRlbnNpb25zLmhhcyhwYXRoLmV4dG5hbWUoZW50cnkubmFtZSkudG9Mb3dlckNhc2UoKSlcbiAgICAgICkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgZmlsZXMucHVzaChuZXh0UGF0aCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZpbGVzLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiBsZWZ0LmxvY2FsZUNvbXBhcmUocmlnaHQsICd6aC1DTicpKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRBdWRpb0xpYnJhcnkocHVibGljQXVkaW9EaXI6IHN0cmluZyk6IFNpdGVBdWRpb0xpYnJhcnlJdGVtW10ge1xuICByZXR1cm4gd2Fsa0F1ZGlvRmlsZXMocHVibGljQXVkaW9EaXIpLm1hcCgoYWJzb2x1dGVGaWxlUGF0aCkgPT4ge1xuICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHRvUG9zaXhQYXRoKFxuICAgICAgcGF0aC5yZWxhdGl2ZShwdWJsaWNBdWRpb0RpciwgYWJzb2x1dGVGaWxlUGF0aCksXG4gICAgKTtcbiAgICBjb25zdCBmaWxlTmFtZSA9IHBhdGguYmFzZW5hbWUoYWJzb2x1dGVGaWxlUGF0aCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgZmlsZW5hbWU6IGZpbGVOYW1lLFxuICAgICAgbGFiZWw6IHRvVHJhY2tMYWJlbChmaWxlTmFtZSksXG4gICAgICBzcmM6IGAvYXVkaW8vJHtyZWxhdGl2ZVBhdGh9YCxcbiAgICB9O1xuICB9KTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZGF0ZVZpcnR1YWxNb2R1bGUoXG4gIHNlcnZlcjogVml0ZURldlNlcnZlcixcbiAgcHVibGljQXVkaW9EaXI6IHN0cmluZyxcbiAgY2hhbmdlZEZpbGVQYXRoOiBzdHJpbmcsXG4pIHtcbiAgY29uc3Qgbm9ybWFsaXplZEF1ZGlvRGlyID0gbm9ybWFsaXplUGF0aChwdWJsaWNBdWRpb0Rpcik7XG4gIGNvbnN0IG5vcm1hbGl6ZWRDaGFuZ2VkUGF0aCA9IG5vcm1hbGl6ZVBhdGgoY2hhbmdlZEZpbGVQYXRoKTtcblxuICBpZiAoIW5vcm1hbGl6ZWRDaGFuZ2VkUGF0aC5zdGFydHNXaXRoKG5vcm1hbGl6ZWRBdWRpb0RpcikpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBtb2R1bGUgPSBzZXJ2ZXIubW9kdWxlR3JhcGguZ2V0TW9kdWxlQnlJZChyZXNvbHZlZFZpcnR1YWxNb2R1bGVJZCk7XG4gIGlmIChtb2R1bGUpIHtcbiAgICBzZXJ2ZXIubW9kdWxlR3JhcGguaW52YWxpZGF0ZU1vZHVsZShtb2R1bGUpO1xuICB9XG5cbiAgc2VydmVyLndzLnNlbmQoe1xuICAgIHR5cGU6ICdmdWxsLXJlbG9hZCcsXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2l0ZUF1ZGlvTGlicmFyeVBsdWdpbigpIHtcbiAgY29uc3QgcHVibGljQXVkaW9EaXIgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgJ3B1YmxpYy9hdWRpbycpO1xuXG4gIHJldHVybiB7XG4gICAgbmFtZTogJ3NpdGUtYXVkaW8tbGlicmFyeScsXG4gICAgcmVzb2x2ZUlkKHNvdXJjZSkge1xuICAgICAgaWYgKHNvdXJjZSA9PT0gdmlydHVhbE1vZHVsZUlkKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlZFZpcnR1YWxNb2R1bGVJZDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSxcbiAgICBsb2FkKGlkKSB7XG4gICAgICBpZiAoaWQgIT09IHJlc29sdmVkVmlydHVhbE1vZHVsZUlkKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBsaWJyYXJ5ID0gYnVpbGRBdWRpb0xpYnJhcnkocHVibGljQXVkaW9EaXIpO1xuICAgICAgcmV0dXJuIFtcbiAgICAgICAgYGV4cG9ydCBjb25zdCBhdWRpb0xpYnJhcnkgPSAke0pTT04uc3RyaW5naWZ5KGxpYnJhcnksIG51bGwsIDIpfTtgLFxuICAgICAgICAnZXhwb3J0IGRlZmF1bHQgYXVkaW9MaWJyYXJ5OycsXG4gICAgICBdLmpvaW4oJ1xcbicpO1xuICAgIH0sXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMocHVibGljQXVkaW9EaXIpKSB7XG4gICAgICAgIHNlcnZlci53YXRjaGVyLmFkZChwdWJsaWNBdWRpb0Rpcik7XG4gICAgICB9XG4gICAgfSxcbiAgICBoYW5kbGVIb3RVcGRhdGUoY29udGV4dCkge1xuICAgICAgaW52YWxpZGF0ZVZpcnR1YWxNb2R1bGUoY29udGV4dC5zZXJ2ZXIsIHB1YmxpY0F1ZGlvRGlyLCBjb250ZXh0LmZpbGUpO1xuICAgIH0sXG4gIH0gc2F0aXNmaWVzIFBsdWdpbjtcbn1cbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiRDpcXFxcYmxvZ1xcXFwudml0ZXByZXNzXFxcXHBsdWdpbnNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXGJsb2dcXFxcLnZpdGVwcmVzc1xcXFxwbHVnaW5zXFxcXG9ic2lkaWFuLWNvbXBhdC50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovYmxvZy8udml0ZXByZXNzL3BsdWdpbnMvb2JzaWRpYW4tY29tcGF0LnRzXCI7aW1wb3J0IGZzIGZyb20gJ25vZGU6ZnMnO1xuaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJztcbmltcG9ydCB0eXBlIHsgUGx1Z2luIH0gZnJvbSAndml0ZSc7XG5cbnR5cGUgVml0ZVByZXNzQ2FsbG91dENvbnRhaW5lciA9ICdkYW5nZXInIHwgJ2luZm8nIHwgJ3RpcCcgfCAnd2FybmluZyc7XG5cbnR5cGUgQ2FsbG91dE1ldGEgPSB7XG4gIGNhbm9uaWNhbFR5cGU6IHN0cmluZztcbiAgY29udGFpbmVyVHlwZTogVml0ZVByZXNzQ2FsbG91dENvbnRhaW5lcjtcbiAgZGVmYXVsdFRpdGxlOiBzdHJpbmc7XG59O1xuXG5jb25zdCBjYWxsb3V0QWxpYXNNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGFic3RyYWN0OiAnYWJzdHJhY3QnLFxuICBhdHRlbnRpb246ICd3YXJuaW5nJyxcbiAgYnVnOiAnYnVnJyxcbiAgY2F1dGlvbjogJ3dhcm5pbmcnLFxuICBjaGVjazogJ3N1Y2Nlc3MnLFxuICBjaXRlOiAncXVvdGUnLFxuICBkYW5nZXI6ICdkYW5nZXInLFxuICBkb25lOiAnc3VjY2VzcycsXG4gIGVycm9yOiAnZGFuZ2VyJyxcbiAgZXhhbXBsZTogJ2V4YW1wbGUnLFxuICBmYWlsOiAnZmFpbHVyZScsXG4gIGZhaWx1cmU6ICdmYWlsdXJlJyxcbiAgZmFxOiAncXVlc3Rpb24nLFxuICBoZWxwOiAncXVlc3Rpb24nLFxuICBoaW50OiAndGlwJyxcbiAgaW1wb3J0YW50OiAndGlwJyxcbiAgaW5mbzogJ2luZm8nLFxuICBtaXNzaW5nOiAnZmFpbHVyZScsXG4gIG5vdGU6ICdub3RlJyxcbiAgcXVlc3Rpb246ICdxdWVzdGlvbicsXG4gIHF1b3RlOiAncXVvdGUnLFxuICBzdWNjZXNzOiAnc3VjY2VzcycsXG4gIHN1bW1hcnk6ICdhYnN0cmFjdCcsXG4gIHRpcDogJ3RpcCcsXG4gIHRsZHI6ICdhYnN0cmFjdCcsXG4gIHRvZG86ICd0b2RvJyxcbiAgd2FybmluZzogJ3dhcm5pbmcnLFxufTtcblxuY29uc3QgY2FsbG91dENvbnRhaW5lck1hcDogUmVjb3JkPHN0cmluZywgVml0ZVByZXNzQ2FsbG91dENvbnRhaW5lcj4gPSB7XG4gIGFic3RyYWN0OiAnaW5mbycsXG4gIGJ1ZzogJ2RhbmdlcicsXG4gIGRhbmdlcjogJ2RhbmdlcicsXG4gIGV4YW1wbGU6ICdpbmZvJyxcbiAgZmFpbHVyZTogJ2RhbmdlcicsXG4gIGluZm86ICdpbmZvJyxcbiAgbm90ZTogJ2luZm8nLFxuICBxdWVzdGlvbjogJ3dhcm5pbmcnLFxuICBxdW90ZTogJ2luZm8nLFxuICBzdWNjZXNzOiAndGlwJyxcbiAgdGlwOiAndGlwJyxcbiAgdG9kbzogJ2luZm8nLFxuICB3YXJuaW5nOiAnd2FybmluZycsXG59O1xuXG5jb25zdCBjYWxsb3V0TGFiZWxNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGFic3RyYWN0OiAnXHU2NDU4XHU4OTgxJyxcbiAgYnVnOiAnXHU3RjNBXHU5Njc3JyxcbiAgZGFuZ2VyOiAnXHU1MzcxXHU5NjY5JyxcbiAgZXhhbXBsZTogJ1x1NzkzQVx1NEY4QicsXG4gIGZhaWx1cmU6ICdcdTU5MzFcdThEMjUnLFxuICBpbmZvOiAnXHU0RkUxXHU2MDZGJyxcbiAgbm90ZTogJ1x1N0IxNFx1OEJCMCcsXG4gIHF1ZXN0aW9uOiAnXHU5NUVFXHU5ODk4JyxcbiAgcXVvdGU6ICdcdTVGMTVcdTc1MjgnLFxuICBzdWNjZXNzOiAnXHU1QjhDXHU2MjEwJyxcbiAgdGlwOiAnXHU2M0QwXHU3OTNBJyxcbiAgdG9kbzogJ1x1NUY4NVx1NTI5RScsXG4gIHdhcm5pbmc6ICdcdThCNjZcdTU0NEEnLFxufTtcblxuZnVuY3Rpb24gdG9Qb3NpeFBhdGgodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gdmFsdWUuc3BsaXQocGF0aC5zZXApLmpvaW4oJy8nKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlSHRtbCh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiB2YWx1ZVxuICAgIC5yZXBsYWNlQWxsKCcmJywgJyZhbXA7JylcbiAgICAucmVwbGFjZUFsbCgnPCcsICcmbHQ7JylcbiAgICAucmVwbGFjZUFsbCgnPicsICcmZ3Q7JylcbiAgICAucmVwbGFjZUFsbCgnXCInLCAnJnF1b3Q7JylcbiAgICAucmVwbGFjZUFsbChcIidcIiwgJyYjMzk7Jyk7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVBdHRhY2htZW50KG1hcmtkb3duRmlsZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZykge1xuICBjb25zdCBtYXJrZG93bkRpciA9IHBhdGguZGlybmFtZShtYXJrZG93bkZpbGUpO1xuICBjb25zdCBjYW5kaWRhdGVzID0gW1xuICAgIHBhdGgucmVzb2x2ZShtYXJrZG93bkRpciwgdGFyZ2V0KSxcbiAgICBwYXRoLnJlc29sdmUobWFya2Rvd25EaXIsICdpbWcnLCB0YXJnZXQpLFxuICBdO1xuXG4gIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhjYW5kaWRhdGUpICYmIGZzLnN0YXRTeW5jKGNhbmRpZGF0ZSkuaXNGaWxlKCkpIHtcbiAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHRvUG9zaXhQYXRoKHBhdGgucmVsYXRpdmUobWFya2Rvd25EaXIsIGNhbmRpZGF0ZSkpO1xuICAgICAgcmV0dXJuIHJlbGF0aXZlUGF0aC5zdGFydHNXaXRoKCcuJykgPyByZWxhdGl2ZVBhdGggOiBgLi8ke3JlbGF0aXZlUGF0aH1gO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVDb250YWluZXJUaXRsZSh2YWx1ZTogc3RyaW5nKSB7XG4gIHJldHVybiB2YWx1ZS5yZXBsYWNlKC9be31dL2csICdcXFxcJCYnKTtcbn1cblxuZnVuY3Rpb24gZXNjYXBlUmVnZXgodmFsdWU6IHN0cmluZykge1xuICByZXR1cm4gdmFsdWUucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbn1cblxuZnVuY3Rpb24gdGl0bGVDYXNlKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHZhbHVlXG4gICAgLnJlcGxhY2VBbGwoL1stX10rL2csICcgJylcbiAgICAucmVwbGFjZUFsbCgvXFxiW2Etel0vZywgKGNoYXIpID0+IGNoYXIudG9VcHBlckNhc2UoKSk7XG59XG5cbmNvbnN0IHN1cHBvcnRlZEZlbmNlTGFuZ3VhZ2VzID0gbmV3IFNldChbXG4gICdhc20nLFxuICAnYmFzaCcsXG4gICdjJyxcbiAgJ2NwcCcsXG4gICdjc3MnLFxuICAnZGlmZicsXG4gICdodG1sJyxcbiAgJ2luaScsXG4gICdqYXZhJyxcbiAgJ2pzJyxcbiAgJ2pzb24nLFxuICAnbWFrZWZpbGUnLFxuICAnbWQnLFxuICAncGVybCcsXG4gICdweScsXG4gICdweXRob24nLFxuICAncnVzdCcsXG4gICdzaCcsXG4gICdzaGVsbCcsXG4gICdzcWwnLFxuICAndGV4dCcsXG4gICd0b21sJyxcbiAgJ3RzJyxcbiAgJ3R4dCcsXG4gICd2dWUnLFxuICAneG1sJyxcbiAgJ3lhbWwnLFxuICAneW1sJyxcbl0pO1xuXG5jb25zdCBmZW5jZUxhbmd1YWdlQWxpYXNNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIGJhc2g6ICdzaCcsXG4gIGM5OTogJ2MnLFxuICBjeHg6ICdjcHAnLFxuICAnYysrJzogJ2NwcCcsXG4gIGg6ICdjJyxcbiAgaGVhZGVyOiAnYycsXG4gICdvYmplY3RpdmUtYyc6ICdjJyxcbiAgcGw6ICdwZXJsJyxcbiAgcHk6ICdweXRob24nLFxuICByczogJ3J1c3QnLFxuICBzOiAnYXNtJyxcbiAgc2hlbGw6ICdzaCcsXG4gIHRleHQ6ICd0eHQnLFxuICB6c2g6ICdzaCcsXG59O1xuXG5jb25zdCBmZW5jZUV4dGVuc2lvbkxhbmd1YWdlTWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAnLmJhc2gnOiAnc2gnLFxuICAnLmMnOiAnYycsXG4gICcuY2MnOiAnY3BwJyxcbiAgJy5jb25mJzogJ2luaScsXG4gICcuY3BwJzogJ2NwcCcsXG4gICcuY3NzJzogJ2NzcycsXG4gICcuaCc6ICdjJyxcbiAgJy5ocHAnOiAnY3BwJyxcbiAgJy5odG1sJzogJ2h0bWwnLFxuICAnLmluaSc6ICdpbmknLFxuICAnLmphdmEnOiAnamF2YScsXG4gICcuanMnOiAnanMnLFxuICAnLmpzb24nOiAnanNvbicsXG4gICcubSc6ICdjJyxcbiAgJy5tYWtlJzogJ21ha2VmaWxlJyxcbiAgJy5tZCc6ICdtZCcsXG4gICcucGwnOiAncGVybCcsXG4gICcucHknOiAncHl0aG9uJyxcbiAgJy5ycyc6ICdydXN0JyxcbiAgJy5zJzogJ2FzbScsXG4gICcuc2gnOiAnc2gnLFxuICAnLnNxbCc6ICdzcWwnLFxuICAnLnRvbWwnOiAndG9tbCcsXG4gICcudHMnOiAndHMnLFxuICAnLnR4dCc6ICd0eHQnLFxuICAnLnZ1ZSc6ICd2dWUnLFxuICAnLnhtbCc6ICd4bWwnLFxuICAnLnlhbWwnOiAneWFtbCcsXG4gICcueW1sJzogJ3lhbWwnLFxufTtcblxudHlwZSBOb3JtYWxpemVkRmVuY2VJbmZvID0ge1xuICBpbmZvOiBzdHJpbmc7XG4gIHRpdGxlPzogc3RyaW5nO1xufTtcblxuZnVuY3Rpb24gc2FuaXRpemVGZW5jZVRpdGxlKHZhbHVlOiBzdHJpbmcpIHtcbiAgcmV0dXJuIHZhbHVlLnJlcGxhY2VBbGwoL1tcXFtcXF1dL2csICcnKTtcbn1cblxuZnVuY3Rpb24gaW5mZXJGZW5jZUxhbmd1YWdlKGJvZHlMaW5lczogc3RyaW5nW10pIHtcbiAgY29uc3QgYm9keSA9IGJvZHlMaW5lcy5qb2luKCdcXG4nKS50cmltKCk7XG4gIGlmICghYm9keSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKFxuICAgIC9eKCNcXHMuKlxcbik/KD86XFwkIHxtYWtlXFxifHFlbXVcXGJ8Z2RiXFxifGFkZHIybGluZVxcYnxncmVwXFxifGNhdFxcYnxjZFxcYnxsc1xcYikvbS50ZXN0KFxuICAgICAgYm9keSxcbiAgICApXG4gICkge1xuICAgIHJldHVybiAnc2gnO1xuICB9XG5cbiAgaWYgKFxuICAgIC8oPzpefFxcbilcXHMqKCNpbmNsdWRlXFxifCNkZWZpbmVcXGJ8dHlwZWRlZlxcYnxzdHJ1Y3RcXGJ8ZW51bVxcYnxzdGF0aWNcXGJ8dWludDY0XFxifGludFxcYnx2b2lkXFxiKS8udGVzdChcbiAgICAgIGJvZHksXG4gICAgKSAmJlxuICAgIC9be307XS8udGVzdChib2R5KVxuICApIHtcbiAgICByZXR1cm4gJ2MnO1xuICB9XG5cbiAgaWYgKFxuICAgIC8oPzpefFxcbilcXHMqW0EtWmEtel9dW0EtWmEtejAtOV9dKlxccypcXChbXildKlxcKVxccypcXHsvLnRlc3QoYm9keSkgfHxcbiAgICAoL3JldHVyblxcYi8udGVzdChib2R5KSAmJiAvW3t9O10vLnRlc3QoYm9keSkpXG4gICkge1xuICAgIHJldHVybiAnYyc7XG4gIH1cblxuICByZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplRmVuY2VMYW5ndWFnZVRva2VuKFxuICB0b2tlbjogc3RyaW5nLFxuICBib2R5TGluZXM6IHN0cmluZ1tdLFxuKTogTm9ybWFsaXplZEZlbmNlSW5mbyB8IG51bGwge1xuICBjb25zdCBub3JtYWxpemVkVG9rZW4gPSB0b2tlbi50cmltKCk7XG4gIGlmICghbm9ybWFsaXplZFRva2VuKSB7XG4gICAgY29uc3QgaW5mZXJyZWQgPSBpbmZlckZlbmNlTGFuZ3VhZ2UoYm9keUxpbmVzKTtcbiAgICByZXR1cm4gaW5mZXJyZWQgPyB7IGluZm86IGluZmVycmVkIH0gOiBudWxsO1xuICB9XG5cbiAgY29uc3QgbG93ZXJUb2tlbiA9IG5vcm1hbGl6ZWRUb2tlbi50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBhbGlhc2VkTGFuZ3VhZ2UgPSBmZW5jZUxhbmd1YWdlQWxpYXNNYXBbbG93ZXJUb2tlbl0gfHwgbG93ZXJUb2tlbjtcbiAgaWYgKHN1cHBvcnRlZEZlbmNlTGFuZ3VhZ2VzLmhhcyhhbGlhc2VkTGFuZ3VhZ2UpKSB7XG4gICAgcmV0dXJuIHsgaW5mbzogYWxpYXNlZExhbmd1YWdlIH07XG4gIH1cblxuICBjb25zdCBleHRlbnNpb24gPSBwYXRoLmV4dG5hbWUobm9ybWFsaXplZFRva2VuKS50b0xvd2VyQ2FzZSgpO1xuICBjb25zdCBmcm9tRXh0ZW5zaW9uID0gZmVuY2VFeHRlbnNpb25MYW5ndWFnZU1hcFtleHRlbnNpb25dO1xuICBpZiAoZnJvbUV4dGVuc2lvbikge1xuICAgIHJldHVybiB7XG4gICAgICBpbmZvOiBmcm9tRXh0ZW5zaW9uLFxuICAgICAgdGl0bGU6IHNhbml0aXplRmVuY2VUaXRsZShub3JtYWxpemVkVG9rZW4pLFxuICAgIH07XG4gIH1cblxuICBpZiAoWydrYWxsb2MnLCAndGhyZWFkX3N3dGljaCcsICd0aHJlYWRfc3dpdGNoJ10uaW5jbHVkZXMobG93ZXJUb2tlbikpIHtcbiAgICByZXR1cm4ge1xuICAgICAgaW5mbzogJ2MnLFxuICAgICAgdGl0bGU6IHNhbml0aXplRmVuY2VUaXRsZShub3JtYWxpemVkVG9rZW4pLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBpbmZlcnJlZCA9IGluZmVyRmVuY2VMYW5ndWFnZShib2R5TGluZXMpO1xuICBpZiAoIWluZmVycmVkKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGluZm86IGluZmVycmVkLFxuICAgIHRpdGxlOiBzYW5pdGl6ZUZlbmNlVGl0bGUobm9ybWFsaXplZFRva2VuKSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQ29kZUZlbmNlSW5mbyhyYXdJbmZvOiBzdHJpbmcsIGJvZHlMaW5lczogc3RyaW5nW10pIHtcbiAgY29uc3QgdHJpbW1lZCA9IHJhd0luZm8udHJpbSgpO1xuICBpZiAoIXRyaW1tZWQpIHtcbiAgICByZXR1cm4gaW5mZXJGZW5jZUxhbmd1YWdlKGJvZHlMaW5lcykgfHwgJyc7XG4gIH1cblxuICBjb25zdCB0b2tlbk1hdGNoID0gdHJpbW1lZC5tYXRjaCgvXlxcUysvKTtcbiAgaWYgKCF0b2tlbk1hdGNoKSB7XG4gICAgcmV0dXJuIHRyaW1tZWQ7XG4gIH1cblxuICBjb25zdCByYXdUb2tlbiA9IHRva2VuTWF0Y2hbMF07XG4gIGNvbnN0IHN1ZmZpeCA9IHRyaW1tZWQuc2xpY2UocmF3VG9rZW4ubGVuZ3RoKS50cmltKCk7XG4gIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVGZW5jZUxhbmd1YWdlVG9rZW4ocmF3VG9rZW4sIGJvZHlMaW5lcyk7XG4gIGlmICghbm9ybWFsaXplZCkge1xuICAgIHJldHVybiB0cmltbWVkO1xuICB9XG5cbiAgY29uc3QgcGFydHMgPSBbbm9ybWFsaXplZC5pbmZvXTtcbiAgaWYgKG5vcm1hbGl6ZWQudGl0bGUgJiYgIS9cXFtbXlxcXV0rXFxdLy50ZXN0KHN1ZmZpeCkpIHtcbiAgICBwYXJ0cy5wdXNoKGBbJHtub3JtYWxpemVkLnRpdGxlfV1gKTtcbiAgfVxuICBpZiAoc3VmZml4KSB7XG4gICAgcGFydHMucHVzaChzdWZmaXgpO1xuICB9XG5cbiAgcmV0dXJuIHBhcnRzLmpvaW4oJyAnKTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtQ29kZUZlbmNlTGFuZ3VhZ2VzKHNvdXJjZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBzb3VyY2Uuc3BsaXQoL1xccj9cXG4vKTtcbiAgY29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsaW5lcy5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdO1xuICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqKShgezMsfXx+ezMsfSkoLiopJC8pO1xuXG4gICAgaWYgKCFtYXRjaCkge1xuICAgICAgcmVzdWx0LnB1c2gobGluZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBbLCBpbmRlbnQsIG1hcmtlciwgcmF3SW5mb10gPSBtYXRjaDtcbiAgICBjb25zdCBib2R5TGluZXM6IHN0cmluZ1tdID0gW107XG4gICAgbGV0IGJvZHlFbmQgPSBpbmRleCArIDE7XG5cbiAgICB3aGlsZSAoYm9keUVuZCA8IGxpbmVzLmxlbmd0aCkge1xuICAgICAgaWYgKG5ldyBSZWdFeHAoYF5cXFxccyoke2VzY2FwZVJlZ2V4KG1hcmtlcil9XFxcXHMqJGApLnRlc3QobGluZXNbYm9keUVuZF0pKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgYm9keUxpbmVzLnB1c2gobGluZXNbYm9keUVuZF0pO1xuICAgICAgYm9keUVuZCArPSAxO1xuICAgIH1cblxuICAgIGNvbnN0IG5vcm1hbGl6ZWRJbmZvID0gbm9ybWFsaXplQ29kZUZlbmNlSW5mbyhyYXdJbmZvLCBib2R5TGluZXMpO1xuICAgIHJlc3VsdC5wdXNoKFxuICAgICAgYCR7aW5kZW50fSR7bWFya2VyfSR7bm9ybWFsaXplZEluZm8gPyBgICR7bm9ybWFsaXplZEluZm99YCA6ICcnfWAsXG4gICAgKTtcbiAgICByZXN1bHQucHVzaCguLi5ib2R5TGluZXMpO1xuXG4gICAgaWYgKGJvZHlFbmQgPCBsaW5lcy5sZW5ndGgpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGxpbmVzW2JvZHlFbmRdKTtcbiAgICAgIGluZGV4ID0gYm9keUVuZDtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGluZGV4ID0gYm9keUVuZCAtIDE7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVDYWxsb3V0VHlwZShyYXdUeXBlOiBzdHJpbmcpOiBDYWxsb3V0TWV0YSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWRUeXBlID0gcmF3VHlwZS50cmltKCkudG9Mb3dlckNhc2UoKS5yZXBsYWNlQWxsKC9cXHMrL2csICctJyk7XG4gIGNvbnN0IGNhbm9uaWNhbFR5cGUgPSBjYWxsb3V0QWxpYXNNYXBbbm9ybWFsaXplZFR5cGVdIHx8IG5vcm1hbGl6ZWRUeXBlO1xuXG4gIHJldHVybiB7XG4gICAgY2Fub25pY2FsVHlwZSxcbiAgICBjb250YWluZXJUeXBlOiBjYWxsb3V0Q29udGFpbmVyTWFwW2Nhbm9uaWNhbFR5cGVdIHx8ICdpbmZvJyxcbiAgICBkZWZhdWx0VGl0bGU6IGNhbGxvdXRMYWJlbE1hcFtjYW5vbmljYWxUeXBlXSB8fCB0aXRsZUNhc2UoY2Fub25pY2FsVHlwZSksXG4gIH07XG59XG5cbmZ1bmN0aW9uIHJlbmRlckNhbGxvdXRGZW5jZShcbiAgY2FsbG91dE1ldGE6IENhbGxvdXRNZXRhLFxuICB0aXRsZTogc3RyaW5nLFxuICBjb2xsYXBzZUZsYWc/OiAnKycgfCAnLScsXG4pIHtcbiAgY29uc3QgeyBjYW5vbmljYWxUeXBlLCBjb250YWluZXJUeXBlLCBkZWZhdWx0VGl0bGUgfSA9IGNhbGxvdXRNZXRhO1xuICBjb25zdCByZXNvbHZlZFRpdGxlID0gdGl0bGUgfHwgZGVmYXVsdFRpdGxlO1xuICBjb25zdCBhdHRycyA9IFtgZGF0YS1jYWxsb3V0PVwiJHtjYW5vbmljYWxUeXBlfVwiYF07XG5cbiAgaWYgKCFjb2xsYXBzZUZsYWcpIHtcbiAgICByZXR1cm4gYDo6OiAke2NvbnRhaW5lclR5cGV9ICR7ZXNjYXBlQ29udGFpbmVyVGl0bGUocmVzb2x2ZWRUaXRsZSl9IHske2F0dHJzLmpvaW4oJyAnKX19YDtcbiAgfVxuXG4gIGF0dHJzLnB1c2goYGRhdGEtY2FsbG91dC1mb2xkPVwiJHtjb2xsYXBzZUZsYWcgPT09ICcrJyA/ICdvcGVuJyA6ICdjbG9zZWQnfVwiYCk7XG4gIGlmIChjb2xsYXBzZUZsYWcgPT09ICcrJykge1xuICAgIGF0dHJzLnVuc2hpZnQoJ29wZW4nKTtcbiAgfVxuXG4gIHJldHVybiBgOjo6IGRldGFpbHMgJHtlc2NhcGVDb250YWluZXJUaXRsZShyZXNvbHZlZFRpdGxlKX0geyR7YXR0cnMuam9pbignICcpfX1gO1xufVxuXG5mdW5jdGlvbiBpc0Jsb2NrcXVvdGVDb250aW51YXRpb24obGluZTogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZykge1xuICByZXR1cm4gbmV3IFJlZ0V4cChgXiR7ZXNjYXBlUmVnZXgoaW5kZW50KX0+XFxcXHM/YCkudGVzdChsaW5lKTtcbn1cblxuZnVuY3Rpb24gaXNDYWxsb3V0U3RhcnRMaW5lKGxpbmU6IHN0cmluZywgaW5kZW50OiBzdHJpbmcpIHtcbiAgcmV0dXJuIG5ldyBSZWdFeHAoXG4gICAgYF4ke2VzY2FwZVJlZ2V4KGluZGVudCl9PlxcXFxzKlxcXFxbIVteXFxcXF1cXFxcbl0rXFxcXF0oWystXSk/XFxcXHMqLiokYCxcbiAgICAnaScsXG4gICkudGVzdChsaW5lKTtcbn1cblxuZnVuY3Rpb24gZmluZE5leHRTaWduaWZpY2FudExpbmUobGluZXM6IHN0cmluZ1tdLCBzdGFydEluZGV4OiBudW1iZXIpIHtcbiAgZm9yIChsZXQgaW5kZXggPSBzdGFydEluZGV4OyBpbmRleCA8IGxpbmVzLmxlbmd0aDsgaW5kZXggKz0gMSkge1xuICAgIGlmICghL15cXHMqJC8udGVzdChsaW5lc1tpbmRleF0pKSB7XG4gICAgICByZXR1cm4gbGluZXNbaW5kZXhdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBzdHJpcEJsb2NrcXVvdGVQcmVmaXgobGluZTogc3RyaW5nLCBpbmRlbnQ6IHN0cmluZykge1xuICByZXR1cm4gbGluZS5yZXBsYWNlKG5ldyBSZWdFeHAoYF4ke2VzY2FwZVJlZ2V4KGluZGVudCl9PlxcXFxzP2ApLCBpbmRlbnQpO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1PYnNpZGlhbkNhbGxvdXRzKHNvdXJjZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbGluZXMgPSBzb3VyY2Uuc3BsaXQoL1xccj9cXG4vKTtcbiAgY29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG4gIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBsaW5lcy5sZW5ndGg7IGluZGV4ICs9IDEpIHtcbiAgICBjb25zdCBsaW5lID0gbGluZXNbaW5kZXhdO1xuICAgIGNvbnN0IG1hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqKT5cXHMqXFxbIShbXlxcXVxcbl0rKVxcXShbKy1dKT9cXHMqKC4qKSQvaSk7XG5cbiAgICBpZiAoIW1hdGNoKSB7XG4gICAgICByZXN1bHQucHVzaChsaW5lKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IFssIGluZGVudCwgcmF3VHlwZSwgcmF3Q29sbGFwc2VGbGFnLCByYXdUaXRsZV0gPSBtYXRjaDtcbiAgICBjb25zdCBjb2xsYXBzZUZsYWcgPSByYXdDb2xsYXBzZUZsYWcgYXMgJysnIHwgJy0nIHwgdW5kZWZpbmVkO1xuICAgIGNvbnN0IGJvZHlMaW5lczogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBib2R5U3RhcnQgPSBpbmRleCArIDE7XG4gICAgbGV0IGJvZHlFbmQgPSBib2R5U3RhcnQ7XG5cbiAgICB3aGlsZSAoYm9keUVuZCA8IGxpbmVzLmxlbmd0aCkge1xuICAgICAgY29uc3QgYm9keUxpbmUgPSBsaW5lc1tib2R5RW5kXTtcbiAgICAgIGlmIChpc0Jsb2NrcXVvdGVDb250aW51YXRpb24oYm9keUxpbmUsIGluZGVudCkpIHtcbiAgICAgICAgYm9keUxpbmVzLnB1c2goc3RyaXBCbG9ja3F1b3RlUHJlZml4KGJvZHlMaW5lLCBpbmRlbnQpKTtcbiAgICAgICAgYm9keUVuZCArPSAxO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKC9eXFxzKiQvLnRlc3QoYm9keUxpbmUpKSB7XG4gICAgICAgIGNvbnN0IG5leHRTaWduaWZpY2FudExpbmUgPSBmaW5kTmV4dFNpZ25pZmljYW50TGluZShsaW5lcywgYm9keUVuZCArIDEpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgbmV4dFNpZ25pZmljYW50TGluZSAmJlxuICAgICAgICAgIGlzQmxvY2txdW90ZUNvbnRpbnVhdGlvbihuZXh0U2lnbmlmaWNhbnRMaW5lLCBpbmRlbnQpICYmXG4gICAgICAgICAgIWlzQ2FsbG91dFN0YXJ0TGluZShuZXh0U2lnbmlmaWNhbnRMaW5lLCBpbmRlbnQpXG4gICAgICAgICkge1xuICAgICAgICAgIGJvZHlMaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgICBib2R5RW5kICs9IDE7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgY2FsbG91dE1ldGEgPSBub3JtYWxpemVDYWxsb3V0VHlwZShyYXdUeXBlKTtcbiAgICBjb25zdCB0aXRsZSA9IHJhd1RpdGxlLnRyaW0oKTtcbiAgICBjb25zdCB0cmFuc2Zvcm1lZEJvZHkgPSB0cmFuc2Zvcm1PYnNpZGlhbkNhbGxvdXRzKGJvZHlMaW5lcy5qb2luKCdcXG4nKSk7XG5cbiAgICByZXN1bHQucHVzaChcbiAgICAgIGAke2luZGVudH0ke3JlbmRlckNhbGxvdXRGZW5jZShjYWxsb3V0TWV0YSwgdGl0bGUsIGNvbGxhcHNlRmxhZyl9YCxcbiAgICApO1xuICAgIGlmICh0cmFuc2Zvcm1lZEJvZHkpIHtcbiAgICAgIHJlc3VsdC5wdXNoKHRyYW5zZm9ybWVkQm9keSk7XG4gICAgfVxuICAgIHJlc3VsdC5wdXNoKGAke2luZGVudH06OjpgKTtcblxuICAgIGluZGV4ID0gYm9keUVuZCAtIDE7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJPYnNpZGlhbkVtYmVkKGJvZHk6IHN0cmluZywgbWFya2Rvd25GaWxlOiBzdHJpbmcsIGJsb2NrID0gdHJ1ZSkge1xuICBjb25zdCBbcmF3VGFyZ2V0LCByYXdNZXRhXSA9IGJvZHkuc3BsaXQoJ3wnLCAyKTtcbiAgY29uc3QgdGFyZ2V0ID0gcmF3VGFyZ2V0LnRyaW0oKTtcbiAgY29uc3QgbWV0YSA9IHJhd01ldGE/LnRyaW0oKTtcbiAgY29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlQXR0YWNobWVudChtYXJrZG93bkZpbGUsIHRhcmdldCk7XG5cbiAgaWYgKCFyZXNvbHZlZCkge1xuICAgIHJldHVybiBibG9ja1xuICAgICAgPyBgPGRpdiBjbGFzcz1cIm9ic2lkaWFuLW1pc3NpbmctYXNzZXRcIj5cdTdGM0FcdTU5MzFcdTk2NDRcdTRFRjZcdUZGMUE8Y29kZT4ke2VzY2FwZUh0bWwodGFyZ2V0KX08L2NvZGU+PC9kaXY+YFxuICAgICAgOiBgPHNwYW4gY2xhc3M9XCJvYnNpZGlhbi1taXNzaW5nLWFzc2V0LWlubGluZVwiPlx1N0YzQVx1NTkzMVx1OTY0NFx1NEVGNlx1RkYxQTxjb2RlPiR7ZXNjYXBlSHRtbCh0YXJnZXQpfTwvY29kZT48L3NwYW4+YDtcbiAgfVxuXG4gIGNvbnN0IGFsdCA9IGVzY2FwZUh0bWwocGF0aC5iYXNlbmFtZSh0YXJnZXQsIHBhdGguZXh0bmFtZSh0YXJnZXQpKSk7XG4gIGNvbnN0IGF0dHJzID0gW1xuICAgIGBzcmM9XCIke2VuY29kZVVSSShyZXNvbHZlZCl9XCJgLFxuICAgIGBhbHQ9XCIke2FsdH1cImAsXG4gICAgJ2NsYXNzPVwib2JzaWRpYW4tZW1iZWQtaW1hZ2VcIicsXG4gICAgJ2xvYWRpbmc9XCJsYXp5XCInLFxuICAgICdkZWNvZGluZz1cImFzeW5jXCInLFxuICBdO1xuXG4gIGxldCBjYXB0aW9uID0gJyc7XG4gIGlmIChtZXRhKSB7XG4gICAgaWYgKC9eXFxkKyQvLnRlc3QobWV0YSkpIHtcbiAgICAgIGF0dHJzLnB1c2goYHdpZHRoPVwiJHttZXRhfVwiYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHNhZmVNZXRhID0gZXNjYXBlSHRtbChtZXRhKTtcbiAgICAgIGF0dHJzLnB1c2goYHRpdGxlPVwiJHtzYWZlTWV0YX1cImApO1xuICAgICAgY2FwdGlvbiA9IGA8ZmlnY2FwdGlvbj4ke3NhZmVNZXRhfTwvZmlnY2FwdGlvbj5gO1xuICAgIH1cbiAgfVxuXG4gIGlmICghYmxvY2spIHtcbiAgICByZXR1cm4gYDxpbWcgJHthdHRycy5qb2luKCcgJyl9IC8+YDtcbiAgfVxuXG4gIHJldHVybiBgPGZpZ3VyZSBjbGFzcz1cIm9ic2lkaWFuLWZpZ3VyZVwiPjxpbWcgJHthdHRycy5qb2luKCcgJyl9IC8+JHtjYXB0aW9ufTwvZmlndXJlPmA7XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU9ic2lkaWFuRW1iZWRzKHNvdXJjZTogc3RyaW5nLCBtYXJrZG93bkZpbGU6IHN0cmluZykge1xuICBjb25zdCBsaW5lcyA9IHNvdXJjZS5zcGxpdCgvXFxyP1xcbi8pO1xuICBjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgY29uc3Qgc3RhbmRhbG9uZU1hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqKSFcXFtcXFsoW15cXF1cXG5dKylcXF1cXF1cXHMqJC8pO1xuICAgIGlmIChzdGFuZGFsb25lTWF0Y2gpIHtcbiAgICAgIGNvbnN0IFssIGluZGVudCwgYm9keV0gPSBzdGFuZGFsb25lTWF0Y2g7XG4gICAgICByZXN1bHQucHVzaCgnJyk7XG4gICAgICByZXN1bHQucHVzaChgJHtpbmRlbnR9JHtyZW5kZXJPYnNpZGlhbkVtYmVkKGJvZHksIG1hcmtkb3duRmlsZSwgdHJ1ZSl9YCk7XG4gICAgICByZXN1bHQucHVzaCgnJyk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBsaXN0SXRlbU1hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqWy0qK11cXHMrKSFcXFtcXFsoW15cXF1cXG5dKylcXF1cXF1cXHMqJC8pO1xuICAgIGlmIChsaXN0SXRlbU1hdGNoKSB7XG4gICAgICBjb25zdCBbLCBwcmVmaXgsIGJvZHldID0gbGlzdEl0ZW1NYXRjaDtcbiAgICAgIHJlc3VsdC5wdXNoKGAke3ByZWZpeH0ke3JlbmRlck9ic2lkaWFuRW1iZWQoYm9keSwgbWFya2Rvd25GaWxlLCB0cnVlKX1gKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc3VsdC5wdXNoKFxuICAgICAgbGluZS5yZXBsYWNlKC8hXFxbXFxbKFteXFxdXFxuXSspXFxdXFxdL2csIChfZnVsbE1hdGNoLCBib2R5OiBzdHJpbmcpID0+XG4gICAgICAgIHJlbmRlck9ic2lkaWFuRW1iZWQoYm9keSwgbWFya2Rvd25GaWxlLCBmYWxzZSksXG4gICAgICApLFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1PYnNpZGlhbk1hcmtkb3duKHNvdXJjZTogc3RyaW5nLCBtYXJrZG93bkZpbGU6IHN0cmluZykge1xuICBjb25zdCB3aXRoTm9ybWFsaXplZEZlbmNlcyA9IHRyYW5zZm9ybUNvZGVGZW5jZUxhbmd1YWdlcyhzb3VyY2UpO1xuICBjb25zdCB3aXRoQ2FsbG91dHMgPSB0cmFuc2Zvcm1PYnNpZGlhbkNhbGxvdXRzKHdpdGhOb3JtYWxpemVkRmVuY2VzKTtcbiAgcmV0dXJuIHRyYW5zZm9ybU9ic2lkaWFuRW1iZWRzKHdpdGhDYWxsb3V0cywgbWFya2Rvd25GaWxlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9ic2lkaWFuQ29tcGF0UGx1Z2luKCk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogJ29ic2lkaWFuLWNvbXBhdCcsXG4gICAgZW5mb3JjZTogJ3ByZScsXG4gICAgdHJhbnNmb3JtKGNvZGUsIGlkKSB7XG4gICAgICBjb25zdCBbZmlsZVBhdGhdID0gaWQuc3BsaXQoJz8nLCAxKTtcbiAgICAgIGlmICghZmlsZVBhdGguZW5kc1dpdGgoJy5tZCcpKSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdHJhbnNmb3JtT2JzaWRpYW5NYXJrZG93bihjb2RlLCBmaWxlUGF0aCk7XG4gICAgfSxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFB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QUFNLE1BQU0sSUFBSTtBQUFBLE1BQ3hCO0FBQUEsUUFDRSxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsVUFDTCxFQUFFLE1BQU0sNEJBQVEsTUFBTSxVQUFVO0FBQUEsVUFDaEM7QUFBQSxZQUNFLE1BQU07QUFBQSxZQUNOLE1BQU07QUFBQSxVQUNSO0FBQUEsVUFDQSxFQUFFLE1BQU0sOEJBQW9CLE1BQU0sd0JBQXdCO0FBQUEsVUFDMUQsRUFBRSxNQUFNLHlCQUFlLE1BQU0sNkJBQTZCO0FBQUEsUUFDNUQ7QUFBQSxNQUNGO0FBQUEsTUFDQSxFQUFFLE1BQU0sZ0JBQU0sTUFBTSxpQkFBaUI7QUFBQSxNQUNyQyxFQUFFLE1BQU0sZ0JBQU0sTUFBTSxTQUFTO0FBQUEsSUFDL0I7QUFBQSxJQUNBLGFBQWE7QUFBQSxNQUNYO0FBQUEsUUFDRSxNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsTUFDUjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxVQUFVO0FBQUEsSUFDUixXQUFXO0FBQUEsTUFDVCxXQUFXO0FBQUEsTUFDWCxXQUFXO0FBQUEsTUFDWCxVQUFVO0FBQUEsTUFDVixjQUFjO0FBQUEsTUFDZCxhQUFhO0FBQUEsTUFDYixjQUFjO0FBQUEsTUFDZCxnQkFBZ0I7QUFBQSxNQUNoQixjQUFjO0FBQUEsSUFDaEI7QUFBQSxJQUNBLE9BQU8sSUFBSTtBQUNULFNBQUcsSUFBSSxRQUFRO0FBQUEsSUFDakI7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixTQUFTLENBQUMscUJBQXFCLEdBQUcsdUJBQXVCLENBQUM7QUFBQSxFQUM1RDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImZzIiwgInBhdGgiLCAidG9Qb3NpeFBhdGgiLCAicGF0aCIsICJmcyIsICJpbmZlcnJlZCJdCn0K
