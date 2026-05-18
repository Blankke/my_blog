<script setup lang="ts">
import { useData, useRoute, withBase } from 'vitepress';
import { computed } from 'vue';
import {
  GALLERY_SECTION,
  POSTS_SECTION,
  getSectionFolderParts,
  normalizeArticleRoute,
  parseArticleDate,
} from '../lib/articles';
import { useArticles } from '../lib/sugarat';

interface FolderArticleItem {
  date: number;
  description: string;
  href: string;
  title: string;
}

const route = useRoute();
const { frontmatter } = useData();
const articles = useArticles();

function formatDate(rawValue: unknown) {
  if (!rawValue) {
    return '';
  }

  const date = new Date(String(rawValue));
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const currentFolder = computed(() => {
  const normalizedRoute = normalizeArticleRoute(route.path);
  const sectionRoots = [POSTS_SECTION, GALLERY_SECTION];

  for (const section of sectionRoots) {
    const folderParts = getSectionFolderParts(normalizedRoute, section);
    if (folderParts?.isFolderIndex) {
      return {
        section,
        segment: folderParts.segment,
      };
    }
  }

  return null;
});

const isFolderIndexPage = computed(() => {
  return Boolean(currentFolder.value) && frontmatter.value.publish === false;
});

const listTitle = computed(() => {
  if (currentFolder.value?.section === GALLERY_SECTION) {
    return '画廊内容';
  }

  return '文章列表';
});

const items = computed<FolderArticleItem[]>(() => {
  if (!currentFolder.value) {
    return [];
  }

  const prefix = `/${currentFolder.value.section}/${currentFolder.value.segment}/`;
  const currentRoute = normalizeArticleRoute(route.path);

  return articles.value
    .map((article) => {
      const normalizedRoute = normalizeArticleRoute(article.route);
      return {
        date: parseArticleDate(article.meta.date),
        description: article.meta.description || '',
        hidden: article.meta.hidden,
        href: normalizedRoute,
        title: article.meta.title || normalizedRoute.slice(prefix.length),
      };
    })
    .filter((article) => {
      if (article.hidden) {
        return false;
      }

      if (!article.href.startsWith(prefix) || article.href === currentRoute) {
        return false;
      }

      return !article.href.slice(prefix.length).includes('/');
    })
    .sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));
});
</script>

<template>
  <section v-if="isFolderIndexPage && items.length" class="folder-post-list">
    <div class="folder-post-list-head">
      <h2 class="folder-post-list-title">{{ listTitle }}</h2>
      <span class="folder-post-list-count">{{ items.length }} 篇</span>
    </div>
    <div class="folder-post-list-items">
      <a
        v-for="item in items"
        :key="item.href"
        class="folder-post-list-item"
        :href="withBase(item.href)"
      >
        <div class="folder-post-list-item-head">
          <h3 class="folder-post-list-item-title">{{ item.title }}</h3>
          <time v-if="item.date" class="folder-post-list-item-date">
            {{ formatDate(item.date) }}
          </time>
        </div>
        <p v-if="item.description" class="folder-post-list-item-description">
          {{ item.description }}
        </p>
      </a>
    </div>
  </section>
</template>

<style scoped>
.folder-post-list {
  margin-top: 2rem;
}

.folder-post-list-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.folder-post-list-title {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.3;
}

.folder-post-list-count {
  color: var(--vp-c-text-2);
  font-size: 0.92rem;
  white-space: nowrap;
}

.folder-post-list-items {
  display: grid;
  gap: 0.9rem;
}

.folder-post-list-item {
  display: block;
  padding: 1rem 1.1rem;
  border: 1px solid var(--home-card-border);
  border-radius: 14px;
  background: var(--home-card-bg);
  box-shadow: var(--home-card-shadow);
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease,
    transform 0.2s ease;
}

.folder-post-list-item:hover {
  border-color: var(--home-card-border-hover);
  background: var(--home-card-bg-hover);
  box-shadow: var(--home-card-shadow-hover);
  transform: translateY(-1px);
}

.folder-post-list-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.folder-post-list-item-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 1rem;
  line-height: 1.5;
}

.folder-post-list-item-date {
  color: var(--vp-c-text-3);
  font-size: 0.82rem;
  white-space: nowrap;
}

.folder-post-list-item-description {
  margin: 0.55rem 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.92rem;
  line-height: 1.7;
}

@media screen and (max-width: 640px) {
  .folder-post-list-item-head {
    flex-direction: column;
    gap: 0.25rem;
  }
}
</style>
