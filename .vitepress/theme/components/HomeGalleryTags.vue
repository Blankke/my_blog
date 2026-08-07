<script setup lang="ts">
import { computed } from 'vue';
import { tagsSvgStr } from '../../../node_modules/@sugarat/theme/src/constants/svg';
import { type ThemeArticle, isGalleryArticle, isVisibleArticle } from '../lib/articles';
import { activeGalleryTag } from '../lib/gallery-tag';
import { useArticles } from '../lib/sugarat';

const articles = useArticles();

// 只统计画廊（gallery 目录）文章的标签
const tagsWithCount = computed(() => {
  const tagCountMap = new Map<string, number>();

  for (const article of articles.value) {
    if (
      !isGalleryArticle(article as ThemeArticle) ||
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

const activeLabel = computed(() => activeGalleryTag.value);

function handleTagClick(tag: string) {
  activeGalleryTag.value =
    activeGalleryTag.value === tag ? '' : tag;
}
</script>

<template>
  <div v-if="tagsWithCount.length" class="home-tags-card" data-pagefind-ignore="all">
    <div class="home-tags-card-header">
      <span class="home-tags-card-title svg-icon" v-html="tagsSvgStr" />
    </div>
    <ul class="home-tags-list">
      <li v-for="item in tagsWithCount" :key="item.tag">
        <button
          type="button"
          class="home-gallery-tag"
          :class="{ 'home-gallery-tag--active': activeLabel === item.tag }"
          @click="handleTagClick(item.tag)"
        >
          {{ item.tag }}
        </button>
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
  list-style: none;
}

@media screen and (max-width: 767px) {
  .home-tags-card {
    width: 100%;
  }
}

.home-gallery-tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.35);
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.home-gallery-tag:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.home-gallery-tag--active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #ffffff;
}

.home-gallery-tag--active:hover {
  color: #ffffff;
}
</style>
