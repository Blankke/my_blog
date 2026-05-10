<script setup lang="ts">
import { computed } from 'vue';
import { withBase } from 'vitepress';
import { useArticles } from '../lib/sugarat';

interface FolderItem {
  count: number;
  latest: number;
  link: string;
  segment: string;
  title: string;
}

const articles = useArticles();

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  }
  catch {
    return value;
  }
}

function normalizeIndexRoute(route: string) {
  return route.replace(/\/index$/, '/');
}

const folders = computed<FolderItem[]>(() => {
  const grouped = new Map<string, FolderItem>();

  for (const article of articles.value) {
    const route = normalizeIndexRoute(article.route);
    const match = route.match(/^\/posts\/([^/]+)\/(.*)$/);
    if (!match) {
      continue;
    }

    const [, segment, rest] = match;
    const title = safeDecode(segment);
    const item = grouped.get(segment) || {
      count: 0,
      latest: 0,
      link: `/posts/${segment}/`,
      segment,
      title,
    };

    if (rest === '') {
      item.title = article.meta.title || title;
      item.link = route;
    }
    else if (!article.meta.hidden) {
      item.count += 1;
      item.latest = Math.max(item.latest, +new Date(article.meta.date || 0));
    }

    grouped.set(segment, item);
  }

  return Array.from(grouped.values())
    .filter(item => item.count > 0)
    .sort((a, b) => b.latest - a.latest || a.title.localeCompare(b.title));
});
</script>

<template>
  <nav v-if="folders.length" class="home-post-categories" aria-label="文章文件夹">
    <div class="home-post-categories-head">
      <span class="home-post-categories-title">文章分类</span>
    </div>
    <div class="home-post-categories-list">
      <a
        v-for="folder in folders"
        :key="folder.segment"
        class="home-post-category"
        :href="withBase(folder.link)"
      >
        <span class="home-post-category-mark" aria-hidden="true" />
        <span class="home-post-category-name">{{ folder.title }}</span>
        <span class="home-post-category-count">{{ folder.count }} 篇</span>
      </a>
    </div>
  </nav>
</template>

<style scoped>
.home-post-categories {
  display: flex;
  align-items: center;
  gap: var(--category-panel-gap);
  margin: 0 0 var(--category-panel-margin-bottom);
  padding: var(--category-panel-padding);
  border: 1px solid var(--home-surface-border);
  border-radius: var(--category-panel-radius);
  background: var(--home-surface-bg);
  box-shadow: var(--home-surface-shadow);
  box-sizing: border-box;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.home-post-categories:hover {
  border-color: var(--home-surface-border-hover);
  background: var(--home-surface-bg-hover);
  box-shadow: var(--home-surface-shadow-hover);
}

.home-post-categories-head {
  flex: 0 0 auto;
}

.home-post-categories-title {
  font-size: var(--category-panel-title-font-size);
  font-weight: 700;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.home-post-categories-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--category-panel-list-gap);
}

.home-post-category {
  display: inline-flex;
  align-items: center;
  gap: var(--category-panel-item-gap);
  min-height: var(--category-panel-item-min-height);
  padding: var(--category-panel-item-padding);
  border: 1px solid var(--home-surface-inner-border);
  border-radius: var(--category-panel-item-radius);
  background: var(--home-surface-inner-bg);
  color: var(--vp-c-text-1);
  line-height: 1.2;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.home-post-category:hover {
  border-color: var(--home-surface-border-hover);
  background: var(--home-surface-inner-bg-hover);
  transform: translateY(-1px);
}

.home-post-category-mark {
  position: relative;
  width: var(--category-panel-mark-width);
  height: var(--category-panel-mark-height);
  border: var(--category-panel-mark-border-width) solid var(--vp-c-brand-1);
  border-radius: var(--category-panel-mark-radius);
}

.home-post-category-mark::before {
  content: "";
  position: absolute;
  top: var(--category-panel-mark-tab-top);
  left: var(--category-panel-mark-tab-left);
  width: var(--category-panel-mark-tab-width);
  height: var(--category-panel-mark-tab-height);
  border: var(--category-panel-mark-border-width) solid var(--vp-c-brand-1);
  border-bottom: 0;
  border-radius: var(--category-panel-mark-radius) var(--category-panel-mark-radius) 0 0;
  background: inherit;
}

.home-post-category-name {
  font-size: var(--category-panel-name-font-size);
  font-weight: 600;
}

.home-post-category-count {
  color: var(--vp-c-text-2);
  font-size: var(--category-panel-count-font-size);
  white-space: nowrap;
}

@media screen and (max-width: 767px) {
  .home-post-categories {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--category-panel-gap-mobile);
  }

  .home-post-categories-list {
    width: 100%;
  }

  .home-post-category {
    max-width: 100%;
  }

  .home-post-category-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
