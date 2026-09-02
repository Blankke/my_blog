<script setup lang="ts">
import { Camera, Clock3, ImageIcon } from 'lucide-vue-next';
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

const articles = useArticles();

const galleryArticles = computed(() => {
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
    });
});

const recentMonthCount = computed(() => {
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return galleryArticles.value.filter((article) => {
    return parseArticleDate(article.meta.date) >= threshold;
  }).length;
});

const latestUpdateLabel = computed(() => {
  const latestArticle = galleryArticles.value[0];
  if (!latestArticle) {
    return '还没有画廊更新';
  }

  return formatArticleDate(latestArticle.meta.date) || '还没有画廊更新';
});

const latestItems = computed(() => {
  return galleryArticles.value.slice(0, 4).map((article) => {
    return {
      href: getArticleHref(article.route),
      title: article.meta.title || '未命名画廊',
    };
  });
});
</script>

<template>
  <div class="gallery-info" data-pagefind-ignore="all">
    <section class="gallery-info-card gallery-info-card--hero">
      <div class="gallery-info-icon">
        <Camera :size="22" aria-hidden="true" />
      </div>
      <div class="gallery-info-copy">
        <p class="gallery-info-kicker">Gallery</p>
        <h2 class="gallery-info-title">画廊栏目</h2>
        <p class="gallery-info-text">
          独立收录带封面、带视觉节奏的内容，与 Home 的文章推荐和标签分别维护。
        </p>
      </div>
    </section>

    <section class="gallery-info-card gallery-info-card--stats">
      <div class="gallery-info-stat">
        <span class="gallery-info-stat-value">{{ galleryArticles.length }}</span>
        <span class="gallery-info-stat-label">画廊文章</span>
      </div>
      <div class="gallery-info-stat">
        <span class="gallery-info-stat-value">+{{ recentMonthCount }}</span>
        <span class="gallery-info-stat-label">近 30 天更新</span>
      </div>
      <div class="gallery-info-stat">
        <span class="gallery-info-stat-value gallery-info-stat-value--small">
          {{ latestUpdateLabel }}
        </span>
        <span class="gallery-info-stat-label">最近更新</span>
      </div>
    </section>

    <section class="gallery-info-card">
      <div class="gallery-info-section-head">
        <span class="gallery-info-section-title">
          <ImageIcon :size="15" aria-hidden="true" />
          最近入列
        </span>
      </div>
      <ul v-if="latestItems.length" class="gallery-info-list">
        <li v-for="item in latestItems" :key="item.href">
          <a class="gallery-info-link" :href="item.href">{{ item.title }}</a>
        </li>
      </ul>
      <p v-else class="gallery-info-empty">还没有任何画廊文章。</p>
    </section>

    <section class="gallery-info-card gallery-info-card--hint">
      <div class="gallery-info-section-head">
        <span class="gallery-info-section-title">
          <Clock3 :size="15" aria-hidden="true" />
          使用方式
        </span>
      </div>
      <p class="gallery-info-text gallery-info-text--compact">
        以后把画廊内容放进 <code>gallery/</code> 目录就会自动识别。你也可以像
        <code>posts/</code> 一样继续分文件夹，专题页里的文章列表也会自己长出来。
      </p>
    </section>
  </div>
</template>

<style scoped>
.gallery-info {
  display: flex;
  flex-direction: column;
  width: 280px;
  gap: 10px;
}

.gallery-info-card {
  padding: 16px;
  border: 1px solid var(--home-surface-border);
  border-radius: 18px;
  background: var(--home-surface-bg);
  box-shadow: var(--home-surface-shadow);
}

.gallery-info-card--hero {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.gallery-info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: rgba(77, 132, 214, 0.12);
  color: var(--vp-c-brand-1);
}

.gallery-info-kicker {
  margin: 0 0 6px;
  color: var(--vp-c-brand-1);
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.gallery-info-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 22px;
  line-height: 1.2;
}

.gallery-info-text {
  margin: 10px 0 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.8;
}

.gallery-info-text--compact {
  margin-top: 8px;
}

.gallery-info-card--stats {
  display: grid;
  gap: 12px;
}

.gallery-info-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--home-surface-inner-border);
  border-radius: 14px;
  background: var(--home-surface-inner-bg);
}

.gallery-info-stat-value {
  color: var(--vp-c-text-1);
  font-family: var(--font-family-code);
  font-size: 26px;
  line-height: 1.2;
}

.gallery-info-stat-value--small {
  font-size: 17px;
}

.gallery-info-stat-label {
  color: var(--vp-c-text-2);
  font-size: 13px;
}

.gallery-info-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gallery-info-section-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--vp-c-text-1);
  font-size: 14px;
  font-weight: 700;
}

.gallery-info-list {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
}

.gallery-info-list li {
  list-style: none;
}

.gallery-info-link {
  display: block;
  padding: 10px 12px;
  border: 1px solid var(--home-surface-inner-border);
  border-radius: 14px;
  background: var(--home-surface-inner-bg);
  color: var(--vp-c-text-1);
  line-height: 1.6;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.gallery-info-link:hover {
  border-color: var(--home-surface-border-hover);
  background: var(--home-surface-inner-bg-hover);
  transform: translateY(-1px);
}

.gallery-info-empty {
  margin: 12px 0 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

@media screen and (max-width: 767px) {
  .gallery-info {
    width: 100%;
  }
}
</style>
