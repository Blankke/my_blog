<script setup lang="ts">
import { ImageIcon } from 'lucide-vue-next';
import { withBase } from 'vitepress';
import { computed } from 'vue';
import {
  type ThemeArticle,
  formatArticleDate,
  getArticleHref,
  isGalleryArticle,
  isVisibleArticle,
  parseArticleDate,
} from '../lib/articles';
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
  title: string;
}

const articles = useArticles();

const items = computed<GalleryItem[]>(() => {
  return articles.value
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
    })
    .map((article) => {
      return {
        cover:
          typeof article.meta.cover === 'string'
            ? withBase(article.meta.cover)
            : '',
        dateLabel: formatArticleDate(article.meta.date),
        description: article.meta.description || '',
        href: getArticleHref(article.route),
        title: article.meta.title || '未命名画廊',
      };
    });
});

const description = computed(() => {
  if (embedded.value) {
    return '主页背景保持不动，这里只把内容切到画廊模式，用方形卡片展示所有视觉型文章。';
  }

  return '这里会收纳那些更适合用图像节奏来阅读的文章。把内容放进 gallery/ 目录后，它就会自动出现在这里。';
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

    <ul v-if="items.length" class="gallery-feed-grid">
      <li v-for="item in items" :key="item.href" class="gallery-feed-grid-item">
        <a class="gallery-card" :href="item.href">
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
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.gallery-feed-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 34px;
  line-height: 1.1;
}

.gallery-feed--embedded .gallery-feed-title {
  font-size: 28px;
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
  font-size: 13px;
  white-space: nowrap;
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
  font-size: 11px;
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
  font-size: 12px;
  letter-spacing: 0.04em;
  opacity: 0.78;
}

.gallery-card-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.35;
}

.gallery-card-description {
  margin: 0;
  color: rgba(247, 251, 255, 0.82);
  font-size: 13px;
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

@media screen and (max-width: 959px) {
  .gallery-feed-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media screen and (max-width: 767px) {
  .gallery-feed-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .gallery-feed-title {
    font-size: 30px;
  }

  .gallery-feed-grid {
    grid-template-columns: 1fr;
  }
}
</style>
