/**
 * 用法示例：
 * curl -X POST http://localhost:3000/api/page-views ^
 *   -H "Content-Type: application/json" ^
 *   -d "{\"path\":\"/posts/hello-world/\",\"mode\":\"hit\"}"
 *
 * 说明：
 * 统一代理文章阅读量统计请求。
 * 目前默认转发到 CountAPI，后续如果要切到自建统计后端，只需要替换这个文件即可。
 */
const COUNT_API_BASE = 'https://api.countapi.xyz';

function sanitizeCounterSegment(value, fallback) {
  const cleaned = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return cleaned.length >= 3 ? cleaned : fallback;
}

function normalizeTrackedArticlePath(path) {
  const normalizedPath = String(path || '/')
    .split(/[?#]/, 1)[0]
    .replace(/\/index$/, '/');

  try {
    return decodeURIComponent(normalizedPath);
  } catch {
    return normalizedPath;
  }
}

function hashText(value) {
  let hash = 2166136261;

  for (const char of String(value)) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildCounterNamespace(hostname) {
  return sanitizeCounterSegment(
    `blankke-blog-${String(hostname || 'site')
      .split(',')[0]
      .trim()}`,
    'blankke-blog-site',
  );
}

function buildCounterKey(path) {
  return `page-${hashText(path)}`;
}

function parseRequestBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return {};
    }
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      error: 'method_not_allowed',
      message: '请使用 POST 调用阅读量接口。',
    });
    return;
  }

  const { mode = 'hit', path = '' } = parseRequestBody(req.body);
  const normalizedPath = normalizeTrackedArticlePath(path);

  if (!normalizedPath.startsWith('/posts/') || normalizedPath === '/posts/') {
    res.status(400).json({
      error: 'invalid_path',
      message: '当前只统计 /posts/ 下的文章页面。',
    });
    return;
  }

  if (mode !== 'get' && mode !== 'hit') {
    res.status(400).json({
      error: 'invalid_mode',
      message: 'mode 只支持 get 或 hit。',
    });
    return;
  }

  const hostname =
    req.headers['x-forwarded-host'] || req.headers.host || 'blankke-blog-site';
  const namespace = buildCounterNamespace(hostname);
  const key = buildCounterKey(normalizedPath);

  try {
    const upstream = await fetch(
      `${COUNT_API_BASE}/${mode}/${namespace}/${key}`,
      {
        headers: {
          accept: 'application/json',
        },
      },
    );
    const payload = await upstream.json().catch(() => null);
    const value = Number(payload?.value);

    if (upstream.status === 404 && mode === 'get') {
      res.status(404).json({
        key,
        namespace,
        path: normalizedPath,
        value: 0,
      });
      return;
    }

    if (!upstream.ok || !Number.isFinite(value)) {
      res.status(502).json({
        error: 'upstream_error',
        message: '上游阅读量服务暂时不可用。',
      });
      return;
    }

    res.status(200).json({
      key,
      namespace,
      path: normalizedPath,
      value,
    });
  } catch {
    res.status(502).json({
      error: 'network_error',
      message: '阅读量代理请求失败，请稍后重试。',
    });
  }
};
