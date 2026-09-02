<script setup lang="ts">
import { useBrowserLocation } from '@vueuse/core';
import { useRoute, useRouter } from 'vitepress';
import { computed, ref, watch } from 'vue';
import { tagsSvgStr } from '../../../node_modules/@sugarat/theme/src/constants/svg';
import {
  type ThemeArticle,
  isPostArticle,
  isVisibleArticle,
} from '../lib/articles';
import {
  Tag,
  useActiveTag,
  useArticles,
  useCurrentPageNum,
} from '../lib/sugarat';

const articles = useArticles();
const route = useRoute();
const router = useRouter();
const activeTag = useActiveTag();
const currentPage = useCurrentPageNum();
const location = useBrowserLocation();

// 只统计文章（posts 目录），画廊标签由画廊视图的标签面板负责
const tagsWithCount = computed(() => {
  const tagCountMap = new Map<string, number>();

  for (const article of articles.value) {
    if (
      !isPostArticle(article as ThemeArticle) ||
      !isVisibleArticle(article as ThemeArticle)
    ) {
      continue;
    }

    const articleTags = (article as ThemeArticle).meta.tag || [];
    const flatTags = Array.isArray(articleTags)
      ? articleTags.flat(3)
      : [articleTags];
    for (const tag of flatTags) {
      tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
    }
  }

  return [...tagCountMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .map(([tag, count]) => ({ tag, count }));
});

const activeTagLabel = computed(() => activeTag.value.label);

const tagType = ['', 'info', 'success', 'warning', 'danger'];

function handleTagClick(tag: string, type: string) {
  if (tag === activeTag.value.label) {
    handleCloseTag();
    return;
  }

  activeTag.value.type = type;
  activeTag.value.label = tag;
  currentPage.value = 1;
  router.go(
    `${location.value.origin}${router.route.path}?tag=${tag}&type=${type}`,
  );
}

function handleCloseTag() {
  activeTag.value.label = '';
  activeTag.value.type = '';
  currentPage.value = 1;
  router.go(`${window.location.origin}${router.route.path}`);
}

// 从 URL 恢复激活的标签（?tag=xxx&type=xxx）
watch(
  location,
  () => {
    if (location.value.href) {
      const url = new URL(location.value.href);
      activeTag.value.type = url.searchParams.get('type') || '';
      activeTag.value.label = url.searchParams.get('tag') || '';
    }
  },
  { immediate: true },
);

// 路由变化且 URL 无 tag 参数时清空激活标签
watch(
  route,
  () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!new URLSearchParams(window.location.search).get('tag')) {
      activeTag.value.type = '';
      activeTag.value.label = '';
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="tagsWithCount.length" class="home-tags-card" data-pagefind-ignore="all">
    <div class="home-tags-card-header">
      <span class="home-tags-card-title svg-icon" v-html="tagsSvgStr" />
      <Tag
        v-if="activeTagLabel"
        :type="activeTag.type || 'primary'"
        closable
        @close="handleCloseTag"
      >
        {{ activeTagLabel }}
      </Tag>
    </div>
    <ul class="home-tags-list">
      <li v-for="(item, idx) in tagsWithCount" :key="item.tag">
        <Tag
          :type="tagType[idx % tagType.length] || 'primary'"
          @click="handleTagClick(item.tag, tagType[idx % tagType.length])"
        >
          {{ item.tag }}
        </Tag>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.home-tags-card {
  display: flex;
  flex-direction: column;
  position: relative;
  margin: 0 auto 10px;
  padding: 10px;
  width: 280px;
  max-width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 0.25rem;
  box-shadow: var(--box-shadow);
  transition: all 0.3s;
  background-color: rgba(var(--bg-gradient));
}

.home-tags-card:hover {
  box-shadow: var(--box-shadow-hover);
}

.home-tags-card-header {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
}

.home-tags-card-title {
  font-size: 13px;
  display: flex;
  align-items: center;
}

.home-tags-card-title :deep(svg) {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}

.home-tags-list {
  display: flex;
  flex-wrap: wrap;
  margin: 10px 0 0;
  padding: 0;
}

.home-tags-list li {
  margin-right: 10px;
  margin-bottom: 10px;
  cursor: pointer;
  list-style: none;
}

@media screen and (max-width: 767px) {
  .home-tags-card {
    width: 100%;
  }
}
</style>
