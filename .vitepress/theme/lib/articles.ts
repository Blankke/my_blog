import { withBase } from 'vitepress';

export const GALLERY_SECTION = 'gallery';
export const POSTS_SECTION = 'posts';

export interface ThemeArticleMeta {
  _pdf_url?: string;
  author?: string;
  cover?: string | false;
  date?: string;
  description?: string;
  hidden?: boolean;
  tag?: string[];
  title?: string;
  top?: number;
}

export interface ThemeArticle {
  meta: ThemeArticleMeta;
  route: string;
}

export interface SectionFolderParts {
  isFolderIndex: boolean;
  isStandalone: boolean;
  normalizedRoute: string;
  rest: string;
  section: string;
  segment: string;
}

export function parseArticleDate(rawValue: unknown) {
  if (!rawValue) {
    return 0;
  }

  const date = +new Date(String(rawValue));
  return Number.isNaN(date) ? 0 : date;
}

export function formatArticleDate(rawValue: unknown) {
  const timestamp = parseArticleDate(rawValue);
  if (!timestamp) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp);
}

export function isGalleryArticle(article: ThemeArticle) {
  return isArticleInSection(article, GALLERY_SECTION);
}

export function isVisibleArticle(article: ThemeArticle) {
  return article.meta.hidden !== true;
}

export function isRecentArticle(article: ThemeArticle, days = 30) {
  const timestamp = parseArticleDate(article.meta.date);
  if (!timestamp) {
    return false;
  }

  return timestamp >= Date.now() - days * 24 * 60 * 60 * 1000;
}

export function normalizeArticleRoute(route: string) {
  try {
    return decodeURIComponent(route).replace(/\/index$/, '/');
  } catch {
    return route.replace(/\/index$/, '/');
  }
}

export function getArticleHref(route: string) {
  return withBase(normalizeArticleRoute(route));
}

export function getSectionRoot(section: string) {
  return `/${section}/`;
}

export function isArticleInSection(article: ThemeArticle, section: string) {
  const normalizedRoute = normalizeArticleRoute(article.route);
  const root = getSectionRoot(section);
  return normalizedRoute.startsWith(root) && normalizedRoute !== root;
}

export function getSectionFolderParts(
  route: string,
  section: string,
): SectionFolderParts | null {
  const normalizedRoute = normalizeArticleRoute(route);
  const root = getSectionRoot(section);

  if (!normalizedRoute.startsWith(root) || normalizedRoute === root) {
    return null;
  }

  const remainder = normalizedRoute.slice(root.length);
  const slashIndex = remainder.indexOf('/');

  if (slashIndex === -1) {
    return {
      isFolderIndex: false,
      isStandalone: true,
      normalizedRoute,
      rest: '',
      section,
      segment: remainder,
    };
  }

  const segment = remainder.slice(0, slashIndex);
  const rest = remainder.slice(slashIndex + 1);

  return {
    isFolderIndex: rest === '',
    isStandalone: false,
    normalizedRoute,
    rest,
    section,
    segment,
  };
}
