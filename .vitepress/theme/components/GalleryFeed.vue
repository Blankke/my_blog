<script setup lang="ts">
import { ImageIcon, LoaderCircle, X } from 'lucide-vue-next';
import MarkdownIt from 'markdown-it';
import { useData, withBase } from 'vitepress';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  type ThemeArticle,
  formatArticleDate,
  getArticleHref,
  isGalleryArticle,
  isVisibleArticle,
  parseArticleDate,
} from '../lib/articles';
import { activeGalleryTag } from '../lib/gallery-tag';
import { useArticles } from '../lib/sugarat';

const props = withDefaults(
  defineProps<{
    embedded?: boolean;
  }>(),
  {
    embedded: false,
  },
);
const embedded = computed(() => props.embedded);
const { isDark } = useData();

interface GalleryItem {
  cover: string;
  dateLabel: string;
  description: string;
  href: string;
  tags: string[];
  title: string;
}

const articles = useArticles();

function normalizeTags(rawTags: unknown) {
  return [...new Set([rawTags || []].flat(3).filter(Boolean))] as string[];
}

const items = computed<GalleryItem[]>(() => {
  const filtered = articles.value
    .filter(
      (article) =>
        isVisibleArticle(article as ThemeArticle) &&
        isGalleryArticle(article as ThemeArticle),
    )
    .sort((a, b) => {
      const dateDiff =
        parseArticleDate(b.meta.date) - parseArticleDate(a.meta.date);
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return String(a.meta.title).localeCompare(String(b.meta.title), 'zh-CN');
    });

  const activeLabel = activeGalleryTag.value;
  const visibleArticles = activeLabel
    ? filtered.filter((article) =>
        normalizeTags(article.meta.tag).includes(activeLabel),
      )
    : filtered;

  return visibleArticles.map((article) => {
    return {
      cover:
        typeof article.meta.cover === 'string'
          ? withBase(article.meta.cover)
          : '',
      dateLabel: formatArticleDate(article.meta.date),
      description: article.meta.description || '',
      href: getArticleHref(article.route),
      tags: normalizeTags(article.meta.tag),
      title: article.meta.title || '未命名画廊',
    };
  });
});

const activeTagLabel = computed(() => activeGalleryTag.value);

const description = computed(() => {
  if (embedded.value) {
    return '主页背景保持不动，这里只把内容切到画廊模式，用方形卡片展示所有视觉型文章。';
  }

  return '这里会收纳那些更适合用图像节奏来阅读的文章。把内容放进 gallery/ 目录后，它就会自动出现在这里。';
});

const activeItem = ref<GalleryItem | null>(null);
const activeHtml = ref('');
const loading = ref(false);
const loadError = ref('');
const readerPanel = ref<HTMLElement | null>(null);
const readerVisual = ref<HTMLElement | null>(null);
const readerMain = ref<HTMLElement | null>(null);
const readerClose = ref<HTMLButtonElement | null>(null);
let articleRequestController: AbortController | null = null;
let activeTrigger: HTMLAnchorElement | null = null;
let activeOrigin: RectSnapshot | null = null;
let readerAnimations: Animation[] = [];
let readerAnimationToken = 0;

interface RectSnapshot {
  height: number;
  left: number;
  top: number;
  width: number;
}

const isDev = import.meta.env.DEV;
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: false,
  // 与 vitepress 默认一致：硬换行渲染为 <br>，保证诗句等逐行内容不合并
  breaks: true,
});

function stripFrontmatter(source: string) {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source);
  return frontmatter ? source.slice(frontmatter[0].length) : source;
}

function normalizeAssetPath(source: string) {
  try {
    return decodeURIComponent(new URL(source, window.location.href).pathname);
  } catch {
    return source;
  }
}

// The expanded visual already carries the cover. Keep every later image, but
// avoid repeating that same cover at the top of the reading column.
function stripRepeatedCover(html: string, cover: string) {
  if (!cover) {
    return html;
  }

  const articleDoc = new DOMParser().parseFromString(html, 'text/html');
  const firstImage = articleDoc.body.querySelector<HTMLImageElement>('img');
  if (
    !firstImage ||
    normalizeAssetPath(firstImage.getAttribute('src') || '') !==
      normalizeAssetPath(cover)
  ) {
    return html;
  }

  const wrapper = firstImage.closest('p, figure');
  firstImage.remove();
  if (
    wrapper &&
    !wrapper.textContent?.trim() &&
    !wrapper.querySelector('img')
  ) {
    wrapper.remove();
  }
  return articleDoc.body.innerHTML;
}

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function snapshotRect(rect: DOMRect): RectSnapshot {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

function handleCardClick(event: MouseEvent, item: GalleryItem) {
  if (event.defaultPrevented || isModifiedClick(event) || event.button !== 0) {
    return;
  }

  event.preventDefault();
  const trigger = event.currentTarget;
  if (trigger instanceof HTMLAnchorElement) {
    activeTrigger = trigger;
    const media = trigger.querySelector<HTMLElement>('.gallery-card-media');
    activeOrigin = snapshotRect((media || trigger).getBoundingClientRect());
  }
  void openReader(item);
}

async function openReader(item: GalleryItem) {
  activeItem.value = item;
  activeHtml.value = '';
  loadError.value = '';
  loading.value = true;

  articleRequestController?.abort();
  const requestController = new AbortController();
  articleRequestController = requestController;

  await nextTick();
  readerClose.value?.focus({ preventScroll: true });

  try {
    let html = '';
    if (isDev) {
      // dev 模式下页面是 SPA 壳，没有预渲染内容；
      // 直接请求原始 markdown 并本地渲染。
      const response = await fetch(`${item.href}.md?raw`, {
        signal: requestController.signal,
      });
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }
      html = markdownRenderer.render(stripFrontmatter(await response.text()));
    } else {
      // 生产环境是预渲染静态页面，提取正文区域。
      const response = await fetch(item.href, {
        signal: requestController.signal,
      });
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const htmlText = await response.text();
      const articleDoc = new DOMParser().parseFromString(htmlText, 'text/html');
      const articleRoot =
        articleDoc.querySelector('.VPDoc .vp-doc') ||
        articleDoc.querySelector('.vp-doc');

      if (!articleRoot) {
        throw new Error('未找到文章内容区域');
      }

      html = articleRoot.innerHTML;
    }

    if (articleRequestController === requestController) {
      activeHtml.value = stripRepeatedCover(html, item.cover);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    loadError.value =
      error instanceof Error ? error.message : '文章加载失败，请稍后重试';
  } finally {
    if (articleRequestController === requestController) {
      loading.value = false;
    }
  }
}

function closeReader() {
  activeItem.value = null;
  loading.value = false;
  articleRequestController?.abort();
  articleRequestController = null;
}

function handleReaderKeydown(event: KeyboardEvent) {
  if (!activeItem.value) {
    return;
  }

  if (event.key === 'Escape') {
    closeReader();
    return;
  }

  if (event.key !== 'Tab' || !readerPanel.value) {
    return;
  }

  const focusable = Array.from(
    readerPanel.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled'));

  if (!focusable.length) {
    event.preventDefault();
    readerPanel.value.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function releaseReaderAnimations() {
  for (const animation of readerAnimations) {
    animation.cancel();
  }
  readerAnimations = [];
}

function cancelReaderAnimations() {
  readerAnimationToken += 1;
  releaseReaderAnimations();
}

function animateElement(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  const animation = element.animate(keyframes, options);
  readerAnimations.push(animation);
  return animation.finished.catch(() => undefined);
}

function interpolate(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

// A lightly under-damped spring sampled into WAAPI frames. It gives the same
// continuous, shared-layout feeling as Motion without adding a React runtime.
function springProgress(time: number) {
  if (time === 1) {
    return 1;
  }

  const dampingRatio = 0.78;
  const angularFrequency = 11;
  const dampedFrequency =
    angularFrequency * Math.sqrt(1 - dampingRatio * dampingRatio);
  const envelope = Math.exp(-dampingRatio * angularFrequency * time);
  return (
    1 -
    envelope *
      (Math.cos(dampedFrequency * time) +
        ((dampingRatio * angularFrequency) / dampedFrequency) *
          Math.sin(dampedFrequency * time))
  );
}

function createRectSpringFrames(
  start: RectSnapshot,
  end: RectSnapshot,
  startRadius: number,
  endRadius: number,
): Keyframe[] {
  return Array.from({ length: 37 }, (_, index) => {
    const offset = index / 36;
    const progress = springProgress(offset);
    return {
      borderRadius: `${interpolate(startRadius, endRadius, progress)}px`,
      height: `${interpolate(start.height, end.height, progress)}px`,
      left: `${interpolate(start.left, end.left, progress)}px`,
      offset,
      top: `${interpolate(start.top, end.top, progress)}px`,
      width: `${interpolate(start.width, end.width, progress)}px`,
    };
  });
}

function getCurrentOrigin() {
  const media = activeTrigger?.querySelector<HTMLElement>(
    '.gallery-card-media',
  );
  if (media?.isConnected) {
    return snapshotRect(media.getBoundingClientRect());
  }
  return activeOrigin;
}

function setFixedRect(element: HTMLElement, rect: RectSnapshot) {
  element.style.position = 'fixed';
  element.style.height = `${rect.height}px`;
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.width}px`;
}

function clearFixedRect(element: HTMLElement) {
  element.style.removeProperty('position');
  element.style.removeProperty('height');
  element.style.removeProperty('left');
  element.style.removeProperty('top');
  element.style.removeProperty('width');
  element.style.removeProperty('border-radius');
}

function clearVisualRect(element: HTMLElement) {
  element.style.removeProperty('position');
  element.style.removeProperty('height');
  element.style.removeProperty('left');
  element.style.removeProperty('top');
  element.style.removeProperty('width');
}

function handleReaderBeforeEnter(element: Element) {
  const root = element as HTMLElement;
  root.style.opacity = '0';
}

async function handleReaderEnter(element: Element, done: () => void) {
  const root = element as HTMLElement;
  const panel = readerPanel.value;
  const visual = readerVisual.value;
  const main = readerMain.value;

  if (!panel || !visual || !main) {
    done();
    return;
  }

  cancelReaderAnimations();
  const animationToken = readerAnimationToken;
  const backdrop = root.querySelector<HTMLElement>('.gallery-reader-backdrop');

  if (prefersReducedMotion()) {
    root.style.opacity = '1';
    await animateElement(root, [{ opacity: 0 }, { opacity: 1 }], {
      duration: 140,
      easing: 'ease-out',
    });
    if (animationToken !== readerAnimationToken) {
      return;
    }
    releaseReaderAnimations();
    root.style.opacity = '1';
    done();
    return;
  }

  const target = snapshotRect(panel.getBoundingClientRect());
  const visualTarget = snapshotRect(visual.getBoundingClientRect());
  const origin = getCurrentOrigin() || {
    height: target.height * 0.82,
    left: target.left + target.width * 0.09,
    top: target.top + target.height * 0.09,
    width: target.width * 0.82,
  };
  const sourceRadius = Math.min(22, origin.width / 5, origin.height / 5);
  const targetRadius =
    Number.parseFloat(getComputedStyle(panel).borderRadius) || 28;

  setFixedRect(panel, origin);
  panel.style.borderRadius = `${sourceRadius}px`;
  setFixedRect(visual, origin);
  root.style.opacity = '1';

  const animations: Promise<unknown>[] = [
    animateElement(
      panel,
      createRectSpringFrames(origin, target, sourceRadius, targetRadius),
      { duration: 720, easing: 'linear', fill: 'both' },
    ),
    animateElement(
      visual,
      [
        {
          height: `${origin.height}px`,
          left: `${origin.left}px`,
          top: `${origin.top}px`,
          width: `${origin.width}px`,
        },
        {
          height: `${visualTarget.height}px`,
          left: `${visualTarget.left}px`,
          top: `${visualTarget.top}px`,
          width: `${visualTarget.width}px`,
        },
      ],
      {
        duration: 650,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      },
    ),
    animateElement(
      main,
      [
        { opacity: 0, transform: 'translate3d(22px, 0, 0)' },
        { opacity: 0, transform: 'translate3d(22px, 0, 0)', offset: 0.38 },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 680, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' },
    ),
  ];

  if (backdrop) {
    animations.push(
      animateElement(backdrop, [{ opacity: 0 }, { opacity: 1 }], {
        duration: 360,
        easing: 'ease-out',
        fill: 'both',
      }),
    );
  }

  await Promise.all(animations);
  if (animationToken !== readerAnimationToken) {
    return;
  }
  releaseReaderAnimations();
  clearFixedRect(panel);
  clearVisualRect(visual);
  done();
}

async function handleReaderLeave(element: Element, done: () => void) {
  const root = element as HTMLElement;
  const panel = readerPanel.value;
  const visual = readerVisual.value;
  const main = readerMain.value;

  if (!panel || !visual || !main) {
    done();
    return;
  }

  cancelReaderAnimations();
  const animationToken = readerAnimationToken;
  const backdrop = root.querySelector<HTMLElement>('.gallery-reader-backdrop');

  if (prefersReducedMotion()) {
    await animateElement(root, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 110,
      easing: 'ease-in',
      fill: 'both',
    });
    if (animationToken !== readerAnimationToken) {
      return;
    }
    releaseReaderAnimations();
    done();
    return;
  }

  const start = snapshotRect(panel.getBoundingClientRect());
  const visualStart = snapshotRect(visual.getBoundingClientRect());
  const origin = getCurrentOrigin() || {
    height: start.height * 0.82,
    left: start.left + start.width * 0.09,
    top: start.top + start.height * 0.09,
    width: start.width * 0.82,
  };
  const startRadius =
    Number.parseFloat(getComputedStyle(panel).borderRadius) || 28;
  const targetRadius = Math.min(22, origin.width / 5, origin.height / 5);

  setFixedRect(panel, start);
  setFixedRect(visual, visualStart);

  const animations: Promise<unknown>[] = [
    animateElement(
      panel,
      createRectSpringFrames(start, origin, startRadius, targetRadius),
      { duration: 580, easing: 'linear', fill: 'both' },
    ),
    animateElement(
      visual,
      [
        {
          height: `${visualStart.height}px`,
          left: `${visualStart.left}px`,
          top: `${visualStart.top}px`,
          width: `${visualStart.width}px`,
        },
        {
          height: `${origin.height}px`,
          left: `${origin.left}px`,
          top: `${origin.top}px`,
          width: `${origin.width}px`,
        },
      ],
      {
        duration: 520,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        fill: 'both',
      },
    ),
    animateElement(
      main,
      [
        { opacity: 1, transform: 'translate3d(0, 0, 0)' },
        { opacity: 0, transform: 'translate3d(16px, 0, 0)' },
      ],
      { duration: 180, easing: 'ease-in', fill: 'both' },
    ),
  ];

  if (backdrop) {
    animations.push(
      animateElement(backdrop, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 300,
        easing: 'ease-in',
        fill: 'both',
      }),
    );
  }

  await Promise.all(animations);
  if (animationToken !== readerAnimationToken) {
    return;
  }
  releaseReaderAnimations();
  done();
}

function handleReaderAfterLeave() {
  activeHtml.value = '';
  loadError.value = '';
  document.body.classList.remove('gallery-reader-open');
  activeTrigger?.focus({ preventScroll: true });
  activeTrigger = null;
  activeOrigin = null;
}

watch(activeItem, (item) => {
  if (typeof document === 'undefined') {
    return;
  }

  if (item) {
    document.body.classList.add('gallery-reader-open');
  }
});

onMounted(() => {
  document.addEventListener('keydown', handleReaderKeydown);
});

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('gallery-reader-open');
    document.removeEventListener('keydown', handleReaderKeydown);
  }
  cancelReaderAnimations();
  articleRequestController?.abort();
});
</script>

<template>
  <section class="gallery-feed" :class="{ 'gallery-feed--embedded': embedded }">
    <div class="gallery-feed-head">
      <div class="gallery-feed-heading">
        <p class="gallery-feed-kicker">Gallery</p>
        <component :is="embedded ? 'h2' : 'h1'" class="gallery-feed-title">画廊</component>
        <p class="gallery-feed-description">
          {{ description }}
        </p>
      </div>
      <span class="gallery-feed-count">{{ items.length }} 篇</span>
    </div>

    <div v-if="activeTagLabel" class="gallery-feed-filter">
      <span class="gallery-feed-filter-label">标签：{{ activeTagLabel }}</span>
      <span class="gallery-feed-filter-count">{{ items.length }} 篇</span>
    </div>

    <ul v-if="items.length" class="gallery-feed-grid">
      <li v-for="item in items" :key="item.href" class="gallery-feed-grid-item">
        <a
          class="gallery-card"
          :href="item.href"
          target="_self"
          aria-haspopup="dialog"
          @click="handleCardClick($event, item)"
        >
          <div class="gallery-card-media">
            <img v-if="item.cover" :src="item.cover" :alt="item.title">
            <div v-else class="gallery-card-placeholder" aria-hidden="true">
              <ImageIcon :size="36" />
            </div>
            <span class="gallery-card-chip">
              <ImageIcon :size="14" aria-hidden="true" />
              Gallery
            </span>
            <div class="gallery-card-overlay">
              <time v-if="item.dateLabel" class="gallery-card-date">{{ item.dateLabel }}</time>
              <h2 class="gallery-card-title">{{ item.title }}</h2>
              <p v-if="item.description" class="gallery-card-description">
                {{ item.description }}
              </p>
            </div>
          </div>
        </a>
      </li>
    </ul>

    <div v-else class="gallery-feed-empty">
      <p>
        现在还没有画廊文章。等你往 <code>gallery/</code> 目录里放一篇内容，这里就会自己亮起来。
      </p>
    </div>

    <Teleport to="body">
      <Transition
        :css="false"
        @before-enter="handleReaderBeforeEnter"
        @enter="handleReaderEnter"
        @leave="handleReaderLeave"
        @after-leave="handleReaderAfterLeave"
      >
        <div
          v-if="activeItem"
          class="gallery-reader"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-reader-title"
          @click.self="closeReader"
        >
          <div class="gallery-reader-backdrop" aria-hidden="true" @click="closeReader" />
          <section
            ref="readerPanel"
            class="gallery-reader-panel"
            :class="{ 'gallery-reader-panel--dark': isDark }"
            tabindex="-1"
          >
            <div ref="readerVisual" class="gallery-reader-visual">
              <img
                v-if="activeItem.cover"
                class="gallery-reader-cover"
                :src="activeItem.cover"
                :alt="activeItem.title"
              >
              <div v-else class="gallery-reader-cover-placeholder" aria-hidden="true">
                <ImageIcon :size="52" />
              </div>
              <div class="gallery-reader-visual-shade" aria-hidden="true" />
              <span class="gallery-reader-visual-chip">
                <ImageIcon :size="14" aria-hidden="true" />
                Gallery
              </span>
              <div class="gallery-reader-visual-copy">
                <time v-if="activeItem.dateLabel" class="gallery-reader-visual-date">
                  {{ activeItem.dateLabel }}
                </time>
                <p class="gallery-reader-visual-title">{{ activeItem.title }}</p>
              </div>
            </div>

            <div ref="readerMain" class="gallery-reader-main">
              <header class="gallery-reader-header">
                <div class="gallery-reader-heading">
                  <p class="gallery-reader-kicker">Gallery Reader</p>
                  <h2 id="gallery-reader-title" class="gallery-reader-title">
                    {{ activeItem.title }}
                  </h2>
                  <p v-if="activeItem.description" class="gallery-reader-description">
                    {{ activeItem.description }}
                  </p>
                  <div class="gallery-reader-meta">
                    <time v-if="activeItem.dateLabel" class="gallery-reader-date">
                      {{ activeItem.dateLabel }}
                    </time>
                    <span
                      v-for="tag in activeItem.tags"
                      :key="`${activeItem.href}-${tag}`"
                      class="gallery-reader-tag"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
                <button
                  ref="readerClose"
                  class="gallery-reader-close"
                  type="button"
                  aria-label="关闭阅读器"
                  @click="closeReader"
                >
                  <X :size="18" />
                </button>
              </header>

              <div class="gallery-reader-body">
                <div class="gallery-reader-content-shell">
                  <div v-if="loading" class="gallery-reader-loading">
                    <LoaderCircle :size="18" class="gallery-reader-loading-icon" />
                    正在加载文章...
                  </div>
                  <p v-else-if="loadError" class="gallery-reader-error">
                    {{ loadError }}
                  </p>
                  <div v-else class="vp-doc gallery-reader-content" v-html="activeHtml" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.gallery-feed {
  width: 100%;
}

.gallery-feed--embedded {
  padding-top: 4px;
}

.gallery-feed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}

.gallery-feed-heading {
  min-width: 0;
}

.gallery-feed-kicker {
  margin: 0 0 8px;
  color: var(--vp-c-brand-1);
  font-family: var(--font-family-code);
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.gallery-feed-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 37px;
  line-height: 1.1;
}

.gallery-feed--embedded .gallery-feed-title {
  font-size: 31px;
}

.gallery-feed-description {
  max-width: 640px;
  margin: 4px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.8;
}

.gallery-feed-count {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 999px;
  background: var(--home-card-inner-bg);
  color: var(--vp-c-text-2);
  font-family: var(--font-family-code);
  font-size: 14px;
  white-space: nowrap;
}

.gallery-feed-filter {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 16px;
  padding: 8px 14px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 999px;
  background: var(--home-card-inner-bg);
}

.gallery-feed-filter-label {
  color: var(--vp-c-brand-1);
  font-size: 14px;
  font-weight: 600;
}

.gallery-feed-filter-count {
  color: var(--vp-c-text-2);
  font-family: var(--font-family-code);
  font-size: 13px;
}

.gallery-feed-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
}

.gallery-feed-grid-item {
  list-style: none;
}

.gallery-card {
  display: block;
}

.gallery-card-media {
  position: relative;
  overflow: hidden;
  aspect-ratio: 1;
  border: 1px solid var(--home-card-border);
  border-radius: 22px;
  background:
    radial-gradient(circle at top, rgba(133, 177, 222, 0.22), transparent 44%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0.16));
  box-shadow: var(--home-card-shadow);
  transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
}

.gallery-card:hover .gallery-card-media {
  border-color: var(--home-card-border-hover);
  box-shadow: var(--home-card-shadow-hover);
  transform: translateY(-2px);
}

.gallery-card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.32s ease;
}

.gallery-card:hover .gallery-card-media img {
  transform: scale(1.04);
}

.gallery-card-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(67, 101, 145, 0.8);
  background:
    radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.55), transparent 40%),
    repeating-linear-gradient(
      135deg,
      rgba(103, 135, 171, 0.08) 0,
      rgba(103, 135, 171, 0.08) 12px,
      transparent 12px,
      transparent 24px
    );
}

.gallery-card-chip {
  position: absolute;
  top: 14px;
  left: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.26);
  border-radius: 999px;
  background: rgba(15, 22, 31, 0.58);
  color: #f4f8ff;
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(8px);
}

.gallery-card-overlay {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 18px 16px;
  background: linear-gradient(180deg, rgba(10, 16, 24, 0), rgba(10, 16, 24, 0.9) 78%);
  color: #f7fbff;
}

.gallery-card-date {
  font-family: var(--font-family-code);
  font-size: 13px;
  letter-spacing: 0.04em;
  opacity: 0.78;
}

.gallery-card-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
}

.gallery-card-description {
  margin: 0;
  color: rgba(247, 251, 255, 0.82);
  font-size: 14px;
  line-height: 1.7;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.gallery-feed-empty {
  padding: 20px 22px;
  border: 1px dashed var(--home-card-border);
  border-radius: 20px;
  background: var(--home-card-bg);
  color: var(--vp-c-text-2);
}

.gallery-feed-empty p {
  margin: 0;
}

.gallery-reader {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: clamp(16px, 2.8vw, 34px);
  isolation: isolate;
}

.gallery-reader-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 12% 10%, rgba(188, 222, 168, 0.2), transparent 40%),
    radial-gradient(circle at 88% 78%, rgba(128, 176, 154, 0.16), transparent 42%),
    rgba(19, 30, 27, 0.58);
  backdrop-filter: blur(16px) saturate(108%);
  -webkit-backdrop-filter: blur(16px) saturate(108%);
}

.gallery-reader-panel {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.82fr);
  width: min(1160px, calc(100vw - clamp(32px, 5.6vw, 68px)));
  height: min(820px, calc(100dvh - clamp(32px, 5.6vw, 68px)));
  border: 1px solid var(--doc-main-border);
  border-radius: 28px;
  outline: none;
  background:
    linear-gradient(135deg, var(--doc-main-sheen) 0, transparent 35%),
    linear-gradient(180deg, var(--doc-main-bg-top), var(--doc-main-bg-bottom)),
    var(--doc-scene-bg);
  box-shadow: var(--glass-highlight), 0 34px 96px rgba(18, 33, 28, 0.35);
  overflow: hidden;
  will-change: top, left, width, height, border-radius;
}

.gallery-reader-visual {
  position: relative;
  z-index: 2;
  align-self: stretch;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  grid-column: 2;
  grid-row: 1;
  background:
    radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.36), transparent 40%),
    var(--doc-scene-bg);
  will-change: width, height;
}

.gallery-reader-cover,
.gallery-reader-cover-placeholder {
  width: 100%;
  height: 100%;
}

.gallery-reader-cover {
  display: block;
  object-fit: cover;
}

.gallery-reader-cover-placeholder {
  display: grid;
  place-items: center;
  color: var(--vp-c-text-2);
  background:
    radial-gradient(circle at 50% 28%, var(--home-bg-glow), transparent 40%),
    repeating-linear-gradient(
      135deg,
      var(--doc-inset-border) 0,
      var(--doc-inset-border) 12px,
      transparent 12px,
      transparent 24px
    );
}

.gallery-reader-visual-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(270deg, transparent 70%, rgba(8, 16, 14, 0.2)),
    linear-gradient(180deg, transparent 54%, rgba(7, 13, 12, 0.83));
  pointer-events: none;
}

.gallery-reader-visual-chip {
  position: absolute;
  top: 20px;
  left: 20px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  background: rgba(15, 22, 20, 0.56);
  color: #f3f8f3;
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(9px);
  -webkit-backdrop-filter: blur(9px);
}

.gallery-reader-visual-copy {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: clamp(22px, 3vw, 36px);
  color: #f6faf6;
}

.gallery-reader-visual-date {
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.06em;
  opacity: 0.75;
}

.gallery-reader-visual-title {
  margin: 8px 0 0;
  font-size: clamp(24px, 3vw, 38px);
  font-weight: 700;
  line-height: 1.22;
}

.gallery-reader-main {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  grid-column: 1;
  grid-row: 1;
  isolation: isolate;
  background:
    linear-gradient(var(--gallery-reader-wool-tint, rgba(111, 139, 96, 0.22)), var(--gallery-reader-wool-tint, rgba(111, 139, 96, 0.22))),
    url("/patterns/light-wool.png") repeat,
    var(--gallery-reader-main-bg, #edf5e0);
  will-change: transform, opacity;
}

.gallery-reader-main::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.4), transparent 42%),
    radial-gradient(circle at 6% 0, rgba(251, 255, 236, 0.52), transparent 46%);
  pointer-events: none;
}

.gallery-reader-main::after {
  content: none;
}

.gallery-reader-panel--dark {
  --gallery-reader-main-bg: #172020;
  --gallery-reader-wool-tint: rgba(8, 15, 15, 0.14);
  border-color: rgba(212, 232, 225, 0.25);
  box-shadow: inset 0 1px 0 rgba(236, 250, 245, 0.1), 0 34px 98px rgba(0, 0, 0, 0.62);
}

.gallery-reader-panel--dark .gallery-reader-main::after {
  content: none;
}

.gallery-reader-panel--dark .gallery-reader-main::before {
  background:
    linear-gradient(135deg, rgba(178, 215, 203, 0.055), transparent 42%),
    radial-gradient(circle at 6% 0, rgba(121, 170, 155, 0.065), transparent 46%);
}

.gallery-reader-panel--dark .gallery-reader-header {
  border-bottom-color: rgba(213, 233, 227, 0.14);
  background: rgba(28, 38, 38, 0.84);
}

.gallery-reader-panel--dark .gallery-reader-title,
.gallery-reader-panel--dark .gallery-reader-content {
  color: #f2f7f5;
}

.gallery-reader-panel--dark .gallery-reader-description,
.gallery-reader-panel--dark .gallery-reader-content :deep(p),
.gallery-reader-panel--dark .gallery-reader-content :deep(blockquote) {
  color: #e1e9e6;
}

.gallery-reader-panel--dark .gallery-reader-content-shell {
  border-color: rgba(219, 238, 232, 0.2);
  background: rgba(7, 12, 12, 0.76);
  box-shadow: inset 0 1px 0 rgba(237, 250, 246, 0.1), 0 16px 38px rgba(0, 0, 0, 0.16);
}

.gallery-reader-panel--dark .gallery-reader-date,
.gallery-reader-panel--dark .gallery-reader-tag {
  border-color: rgba(213, 233, 227, 0.16);
  background: rgba(196, 225, 216, 0.075);
  color: #bcd7ce;
}

.gallery-reader-panel--dark .gallery-reader-close {
  border-color: rgba(218, 237, 231, 0.19);
  background: rgba(211, 234, 227, 0.09);
  color: #f0f7f4;
}

.gallery-reader-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: clamp(22px, 3vw, 34px) clamp(22px, 3.2vw, 38px) 20px;
  border-bottom: 1px solid var(--doc-inset-border);
  background:
    radial-gradient(circle at 8% 0, var(--home-bg-glow), transparent 45%),
    var(--doc-aux-bg);
}

.gallery-reader-heading {
  min-width: 0;
}

.gallery-reader-kicker {
  margin: 0 0 8px;
  color: var(--doc-active-text);
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.gallery-reader-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: clamp(26px, 3.5vw, 37px);
  line-height: 1.2;
}

.gallery-reader-description {
  max-width: 620px;
  margin: 10px 0 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.7;
}

.gallery-reader-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-top: 13px;
}

.gallery-reader-date,
.gallery-reader-tag {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 0 9px;
  border: 1px solid var(--doc-inset-border);
  border-radius: 999px;
  background: var(--doc-inset-bg);
  color: var(--vp-c-text-2);
  font-family: var(--font-family-code);
  font-size: 12px;
}

.gallery-reader-tag {
  color: var(--doc-active-text);
}

.gallery-reader-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border: 1px solid var(--doc-control-border);
  border-radius: 999px;
  background: var(--doc-control-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.gallery-reader-close:hover {
  border-color: var(--home-card-border-hover);
  background: var(--doc-aux-bg-hover);
  transform: translateY(-1px);
}

.gallery-reader-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  padding: clamp(16px, 2.6vw, 28px) clamp(18px, 3.2vw, 38px) clamp(24px, 3vw, 36px);
}

.gallery-reader-content-shell {
  min-height: 100%;
  border: 1px solid var(--doc-inset-border);
  border-radius: 20px;
  background: var(--doc-inset-bg);
  box-shadow: var(--doc-aux-highlight);
  padding: clamp(16px, 2.6vw, 28px);
}

.gallery-reader-content :deep(:first-child) {
  margin-top: 0;
}

/* 正文大图：全宽、保持原始比例、不裁剪 */
.gallery-reader-content :deep(img) {
  display: block;
  width: 100%;
  height: auto;
  margin: 0 0 18px;
  border-radius: 14px;
  border: 1px solid var(--doc-inset-border);
  background: var(--doc-aux-bg);
}

.gallery-reader-content :deep(p:last-child) {
  margin-bottom: 0;
}

.gallery-reader-loading,
.gallery-reader-error {
  margin: 0;
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--vp-c-text-2);
}

.gallery-reader-error {
  color: #a43d46;
}

.gallery-reader-loading-icon {
  animation: gallery-reader-spin 1s linear infinite;
}

:global(body.gallery-reader-open) {
  overflow: hidden;
}

@keyframes gallery-reader-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media screen and (max-width: 959px) {
  .gallery-feed-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gallery-reader {
    padding: 12px;
  }

  .gallery-reader-panel {
    grid-template-columns: minmax(0, 1.28fr) minmax(250px, 0.72fr);
    border-radius: 22px;
  }

  .gallery-reader-header {
    padding: 18px 18px 14px;
  }

  .gallery-reader-visual-copy {
    padding: 22px;
  }

  .gallery-reader-body {
    padding: 14px 18px 20px;
  }
}

@media screen and (max-width: 767px) {
  .gallery-feed-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .gallery-feed-title {
    font-size: 33px;
  }

  .gallery-feed-grid {
    grid-template-columns: 1fr;
  }

  .gallery-reader-panel {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(180px, 38dvh) minmax(0, 1fr);
    width: calc(100vw - 24px);
    height: calc(100dvh - 24px);
    border-radius: 18px;
  }

  .gallery-reader-visual {
    grid-column: 1;
    grid-row: 1;
  }

  .gallery-reader-main {
    grid-column: 1;
    grid-row: 2;
  }

  .gallery-reader-visual-shade {
    background: linear-gradient(180deg, transparent 52%, rgba(7, 13, 12, 0.84));
  }

  .gallery-reader-visual-copy {
    padding: 18px;
  }

  .gallery-reader-visual-title {
    font-size: 26px;
  }

  .gallery-reader-title {
    font-size: 24px;
  }

  .gallery-reader-close {
    width: 34px;
    height: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gallery-card-media,
  .gallery-card-media img,
  .gallery-reader-close {
    transition-duration: 0.01ms !important;
  }

  .gallery-card:hover .gallery-card-media,
  .gallery-card:hover .gallery-card-media img,
  .gallery-reader-close:hover {
    transform: none;
  }

  .gallery-reader-loading-icon {
    animation-duration: 1.8s;
  }
}
</style>
