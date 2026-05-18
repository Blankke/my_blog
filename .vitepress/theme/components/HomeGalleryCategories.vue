<script setup lang="ts">
import { Camera } from 'lucide-vue-next';
import { withBase } from 'vitepress';
import { computed } from 'vue';
import {
  GALLERY_SECTION,
  type ThemeArticle,
  getSectionFolderParts,
  parseArticleDate,
} from '../lib/articles';
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
  } catch {
    return value;
  }
}

const folders = computed<FolderItem[]>(() => {
  const grouped = new Map<string, FolderItem>();

  for (const article of articles.value) {
    const folderParts = getSectionFolderParts(article.route, GALLERY_SECTION);
    if (!folderParts || folderParts.isStandalone) {
      continue;
    }

    const title = safeDecode(folderParts.segment);
    const item = grouped.get(folderParts.segment) || {
      count: 0,
      latest: 0,
      link: `/gallery/${folderParts.segment}/`,
      segment: folderParts.segment,
      title,
    };

    if (folderParts.isFolderIndex) {
      item.title = article.meta.title || title;
      item.link = folderParts.normalizedRoute;
    } else if (!(article as ThemeArticle).meta.hidden) {
      item.count += 1;
      item.latest = Math.max(item.latest, parseArticleDate(article.meta.date));
    }

    grouped.set(folderParts.segment, item);
  }

  return Array.from(grouped.values())
    .filter((item) => item.count > 0)
    .sort(
      (a, b) => b.latest - a.latest || a.title.localeCompare(b.title, 'zh-CN'),
    );
});
</script>

<template>
  <nav v-if="folders.length" class="home-gallery-categories" aria-label="画廊文件夹">
    <div class="home-gallery-categories-head">
      <span class="home-gallery-categories-title">画廊分组</span>
    </div>
    <div class="home-gallery-categories-list">
      <a
        v-for="folder in folders"
        :key="folder.segment"
        class="home-gallery-category"
        :href="withBase(folder.link)"
      >
        <span class="home-gallery-category-mark" aria-hidden="true">
          <Camera :size="14" />
        </span>
        <span class="home-gallery-category-name">{{ folder.title }}</span>
        <span class="home-gallery-category-count">{{ folder.count }} 篇</span>
      </a>
    </div>
  </nav>
</template>

<style scoped>
.home-gallery-categories {
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

.home-gallery-categories:hover {
  border-color: var(--home-surface-border-hover);
  background: var(--home-surface-bg-hover);
  box-shadow: var(--home-surface-shadow-hover);
}

.home-gallery-categories-head {
  flex: 0 0 auto;
}

.home-gallery-categories-title {
  font-size: var(--category-panel-title-font-size);
  font-weight: 700;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.home-gallery-categories-list {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--category-panel-list-gap);
}

.home-gallery-category {
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

.home-gallery-category:hover {
  border-color: var(--home-surface-border-hover);
  background: var(--home-surface-inner-bg-hover);
  transform: translateY(-1px);
}

.home-gallery-category-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(69, 120, 206, 0.2);
  border-radius: 999px;
  background: rgba(69, 120, 206, 0.08);
  color: var(--vp-c-brand-1);
}

.home-gallery-category-name {
  font-size: var(--category-panel-name-font-size);
  font-weight: 600;
}

.home-gallery-category-count {
  color: var(--vp-c-text-2);
  font-size: var(--category-panel-count-font-size);
  white-space: nowrap;
}

@media screen and (max-width: 767px) {
  .home-gallery-categories {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--category-panel-gap-mobile);
  }

  .home-gallery-categories-list {
    width: 100%;
  }

  .home-gallery-category {
    max-width: 100%;
  }

  .home-gallery-category-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
