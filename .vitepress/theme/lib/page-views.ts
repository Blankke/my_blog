/**
 * 用法示例：
 * const count = await requestPageViewCount('/posts/hello-world/');
 * console.log(count);
 *
 * 说明：
 * 统一封装文章阅读量请求。
 * 优先走同源 `/api/page-views`，部署在 Vercel 时由服务端代理请求第三方计数服务；
 * 本地 `vitepress dev` 没有 API 路由时，会自动回退到浏览器直连模式。
 */
import { normalizeArticleRoute } from './articles';

const API_ROUTE = '/api/page-views';
const COUNT_API_BASE = 'https://api.countapi.xyz';
const SESSION_KEY_PREFIX = 'blog-page-view-session:';

type PageViewMode = 'get' | 'hit';

interface PageViewPayload {
  value: number;
}

function sanitizeCounterSegment(value: string, fallback: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
  const compacted = cleaned.replace(/^-+|-+$/g, '').slice(0, 48);
  return compacted.length >= 3 ? compacted : fallback;
}

function hashText(value: string) {
  let hash = 2166136261;

  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildCounterNamespace(hostname: string) {
  return sanitizeCounterSegment(
    `blankke-blog-${hostname}`,
    'blankke-blog-site',
  );
}

function buildCounterKey(path: string) {
  return `page-${hashText(path)}`;
}

function getSessionStorageKey(path: string) {
  return `${SESSION_KEY_PREFIX}${path}`;
}

function hasTrackedInSession(path: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(getSessionStorageKey(path)) === '1';
}

function markTrackedInSession(path: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(getSessionStorageKey(path), '1');
}

export function normalizeTrackedArticlePath(path: string) {
  const [cleanPath] = path.split(/[?#]/, 1);
  return normalizeArticleRoute(cleanPath || '/');
}

export function shouldTrackArticlePage(path: string) {
  const normalizedPath = normalizeTrackedArticlePath(path);
  return normalizedPath.startsWith('/posts/') && normalizedPath !== '/posts/';
}

async function parsePageViewPayload(response: Response) {
  const data = (await response
    .json()
    .catch(() => null)) as PageViewPayload | null;
  const value = Number(data?.value);
  return Number.isFinite(value) ? value : null;
}

async function requestViaServer(path: string, mode: PageViewMode) {
  try {
    const response = await fetch(API_ROUTE, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({ mode, path }),
    });

    if (response.status === 404 && mode === 'get') {
      return 0;
    }

    if (!response.ok) {
      return null;
    }

    return await parsePageViewPayload(response);
  } catch {
    return null;
  }
}

async function requestDirect(path: string, mode: PageViewMode) {
  if (typeof window === 'undefined') {
    return null;
  }

  const namespace = buildCounterNamespace(window.location.hostname);
  const key = buildCounterKey(path);

  try {
    const response = await fetch(
      `${COUNT_API_BASE}/${mode}/${namespace}/${key}`,
      {
        headers: {
          accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (response.status === 404 && mode === 'get') {
      return 0;
    }

    if (!response.ok) {
      return null;
    }

    return await parsePageViewPayload(response);
  } catch {
    return null;
  }
}

async function requestCount(path: string, mode: PageViewMode) {
  const serverValue = await requestViaServer(path, mode);
  if (serverValue !== null) {
    return serverValue;
  }

  return await requestDirect(path, mode);
}

export async function requestPageViewCount(routePath: string) {
  const normalizedPath = normalizeTrackedArticlePath(routePath);

  if (!shouldTrackArticlePage(normalizedPath)) {
    return null;
  }

  const cachedInSession = hasTrackedInSession(normalizedPath);
  const preferredMode: PageViewMode = cachedInSession ? 'get' : 'hit';

  let value = await requestCount(normalizedPath, preferredMode);

  // `get` 在计数尚未创建时可能返回 0，这里补一次 `hit`，避免切页后显示异常。
  if (value === 0 && preferredMode === 'get') {
    value = await requestCount(normalizedPath, 'hit');
  }

  if (value === null) {
    return null;
  }

  markTrackedInSession(normalizedPath);
  return value;
}
