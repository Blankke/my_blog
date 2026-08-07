<script setup lang="ts">
import MarkdownIt from 'markdown-it';
import { ImageIcon, LoaderCircle, X } from 'lucide-vue-next';
import { withBase } from 'vitepress';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
let articleRequestController: AbortController | null = null;

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

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function handleCardClick(event: MouseEvent, item: GalleryItem) {
  if (event.defaultPrevented || isModifiedClick(event) || event.button !== 0) {
    return;
  }

  event.preventDefault();
  void openReader(item);
}

async function openReader(item: GalleryItem) {
  activeItem.value = item;
  activeHtml.value = '';
  loadError.value = '';
  loading.value = true;

  articleRequestController?.abort();
  articleRequestController = new AbortController();

  try {
    let html = '';
    if (isDev) {
      // dev 模式下页面是 SPA 壳，没有预渲染内容；
      // 直接请求原始 markdown 并本地渲染。
      const response = await fetch(`${item.href}.md?raw`, {
        signal: articleRequestController.signal,
      });
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }
      html = markdownRenderer.render(stripFrontmatter(await response.text()));
    } else {
      // 生产环境是预渲染静态页面，提取正文区域。
      const response = await fetch(item.href, {
        signal: articleRequestController.signal,
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

    activeHtml.value = html;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return;
    }

    loadError.value =
      error instanceof Error
        ? error.message
        : '文章加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function closeReader() {
  activeItem.value = null;
  activeHtml.value = '';
  loadError.value = '';
  loading.value = false;
  articleRequestController?.abort();
  articleRequestController = null;
}

function handleReaderKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && activeItem.value) {
    closeReader();
  }
}

watch(activeItem, (item) => {
  if (typeof document === 'undefined') {
    return;
  }

  if (item) {
    document.body.classList.add('gallery-reader-open');
    return;
  }

  document.body.classList.remove('gallery-reader-open');
});

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', handleReaderKeydown);
}

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('gallery-reader-open');
    document.removeEventListener('keydown', handleReaderKeydown);
  }
  articleRequestController?.abort();
});
</script>

<template>
  <section class="gallery-feed" :class="{ 'gallery-feed--embedded': embedded }">
    <div class="gallery-feed-head">
      <div>
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
      <Transition name="gallery-reader-transition">
        <div v-if="activeItem" class="gallery-reader" role="dialog" aria-modal="true" @click.self="closeReader">
          <div class="gallery-reader-backdrop" aria-hidden="true" @click="closeReader" />
          <section class="gallery-reader-panel">
            <header class="gallery-reader-header">
              <div>
                <p class="gallery-reader-kicker">Gallery Reader</p>
                <h2 class="gallery-reader-title">{{ activeItem.title }}</h2>
                <time v-if="activeItem.dateLabel" class="gallery-reader-date">{{ activeItem.dateLabel }}</time>
              </div>
              <button class="gallery-reader-close" type="button" aria-label="关闭阅读器" @click="closeReader">
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
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
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
  margin: 12px 0 0;
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
  z-index: 120;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: clamp(16px, 2.8vw, 34px);
}

.gallery-reader-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 12% 10%, rgba(121, 181, 236, 0.2), transparent 40%),
    radial-gradient(circle at 88% 78%, rgba(125, 203, 173, 0.2), transparent 42%),
    rgba(7, 16, 27, 0.54);
  backdrop-filter: blur(12px);
}

.gallery-reader-panel {
  position: relative;
  width: min(1220px, 100%);
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.66);
  border-radius: 28px;
  background: #fbfdff;
  box-shadow: 0 28px 72px rgba(10, 20, 33, 0.28);
  overflow: hidden;
}

.gallery-reader-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 18px;
  border-bottom: 1px solid rgba(72, 112, 157, 0.14);
  background:
    linear-gradient(130deg, rgba(147, 195, 239, 0.18), rgba(232, 244, 255, 0.3)),
    #f8fbff;
}

.gallery-reader-kicker {
  margin: 0 0 8px;
  color: #416183;
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.gallery-reader-title {
  margin: 0;
  color: #1f2f43;
  font-size: clamp(26px, 3.5vw, 37px);
  line-height: 1.2;
}

.gallery-reader-date {
  display: inline-block;
  margin-top: 10px;
  color: #587896;
  font-family: var(--font-family-code);
  font-size: 13px;
}

.gallery-reader-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(68, 102, 138, 0.2);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #2d4964;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.gallery-reader-close:hover {
  border-color: rgba(68, 102, 138, 0.36);
  background: #ffffff;
  transform: translateY(-1px);
}

.gallery-reader-body {
  height: calc(100% - 112px);
  overflow: auto;
  padding: clamp(16px, 3vw, 28px);
}

.gallery-reader-content-shell {
  border: 1px solid rgba(72, 112, 157, 0.16);
  border-radius: 20px;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
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
  border: 1px solid rgba(72, 112, 157, 0.14);
  background: #eef3f8;
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
  color: #486683;
}

.gallery-reader-error {
  color: #a43d46;
}

.gallery-reader-loading-icon {
  animation: gallery-reader-spin 1s linear infinite;
}

.gallery-reader-transition-enter-active,
.gallery-reader-transition-leave-active {
  transition: opacity 0.3s ease;
}

.gallery-reader-transition-enter-active .gallery-reader-panel,
.gallery-reader-transition-leave-active .gallery-reader-panel {
  transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
}

.gallery-reader-transition-enter-from,
.gallery-reader-transition-leave-to {
  opacity: 0;
}

.gallery-reader-transition-enter-from .gallery-reader-panel,
.gallery-reader-transition-leave-to .gallery-reader-panel {
  transform: scale(0.98) translateY(8px);
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
    border-radius: 22px;
  }

  .gallery-reader-header {
    padding: 18px 18px 14px;
  }

  .gallery-reader-body {
    height: calc(100% - 98px);
    padding: 14px;
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
    border-radius: 18px;
  }

  .gallery-reader-title {
    font-size: 24px;
  }

  .gallery-reader-close {
    width: 34px;
    height: 34px;
  }
}
</style>
