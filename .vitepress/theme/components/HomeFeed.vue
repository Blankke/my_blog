<script setup lang="ts">
import { ImageIcon } from 'lucide-vue-next';
import { useData, useRoute, useRouter, withBase } from 'vitepress';
import { computed, nextTick, watch } from 'vue';
import {
  type ThemeArticle,
  formatArticleDate,
  getArticleHref,
  isGalleryArticle,
  isRecentArticle,
  isVisibleArticle,
  parseArticleDate,
} from '../lib/articles';
import {
  Pagination,
  useActiveTag,
  useArticles,
  useCurrentPageNum,
  useGlobalAuthor,
  useHomeConfig,
} from '../lib/sugarat';

interface FeedItem {
  author: string;
  cover: string;
  dateLabel: string;
  dateValue: string;
  description: string;
  gallery: boolean;
  href: string;
  pinned: boolean;
  tags: string[];
  title: string;
}

const queryPageNumKey = 'pageNum';
const route = useRoute();
const router = useRouter();
const articles = useArticles();
const activeTag = useActiveTag();
const currentPage = useCurrentPageNum();
const globalAuthor = useGlobalAuthor();
const { frontmatter } = useData();
const home = useHomeConfig();

function normalizeTags(rawTags: unknown) {
  return [...new Set([rawTags || []].flat(3).filter(Boolean))] as string[];
}

const activeTagLabel = computed(() => activeTag.value.label);

const pageSize = computed(
  () => frontmatter.value.blog?.pageSize || home?.value?.pageSize || 6,
);
const archiveHref = withBase('/posts/');

const recentArticles = computed(() => {
  const visibleArticles = articles.value.filter(
    (article) =>
      isVisibleArticle(article as ThemeArticle) &&
      isRecentArticle(article as ThemeArticle, 30) &&
      article.meta.title,
  );

  const pinnedArticles = visibleArticles
    .filter((article) => Number(article.meta.top))
    .sort((a, b) => Number(a.meta.top) - Number(b.meta.top));

  const normalArticles = visibleArticles
    .filter((article) => !Number(article.meta.top))
    .sort((a, b) => {
      const dateDiff =
        parseArticleDate(b.meta.date) - parseArticleDate(a.meta.date);
      if (dateDiff !== 0) {
        return dateDiff;
      }

      return String(a.meta.title).localeCompare(String(b.meta.title), 'zh-CN');
    });

  return pinnedArticles.concat(normalArticles);
});

const filteredArticles = computed(() => {
  if (!activeTagLabel.value) {
    return recentArticles.value;
  }

  return recentArticles.value.filter((article) =>
    normalizeTags(article.meta.tag).includes(activeTagLabel.value),
  );
});

const maxPage = computed(() => {
  return Math.max(1, Math.ceil(filteredArticles.value.length / pageSize.value));
});

const currentItems = computed<FeedItem[]>(() => {
  const startIdx = (currentPage.value - 1) * pageSize.value;
  const endIdx = startIdx + pageSize.value;

  return filteredArticles.value.slice(startIdx, endIdx).map((article) => {
    return {
      author: article.meta.author || globalAuthor.value,
      cover:
        typeof article.meta.cover === 'string'
          ? withBase(article.meta.cover)
          : '',
      dateLabel: formatArticleDate(article.meta.date),
      dateValue: String(article.meta.date || ''),
      description: article.meta.description || '',
      gallery: isGalleryArticle(article as ThemeArticle),
      href: getArticleHref(article.route),
      pinned: Number(article.meta.top) > 0,
      tags: normalizeTags(article.meta.tag),
      title: article.meta.title || '未命名文章',
    };
  });
});

const sectionCountLabel = computed(() => {
  return `[${currentItems.value.length}/${filteredArticles.value.length}]`;
});

const emptyMessage = computed(() => {
  if (activeTagLabel.value) {
    return `最近 30 天内还没有带有“${activeTagLabel.value}”标签的更新。`;
  }

  return '最近 30 天内还没有新的更新，先去文章归档里看看吧。';
});

function handleUpdatePageNum(nextPage: number) {
  if (currentPage.value === nextPage) {
    return;
  }

  currentPage.value = nextPage;
  const { searchParams } = new URL(window.location.href);
  searchParams.delete(queryPageNumKey);
  searchParams.append(queryPageNumKey, String(nextPage));
  window.scrollTo({ top: 0, behavior: 'auto' });
  router.go(`${router.route.path}?${searchParams.toString()}`);
}

function refreshCurrentPage() {
  if (typeof window === 'undefined') {
    return;
  }

  const searchParams = new URLSearchParams(window.location.search.slice(1));
  const pageNum = Number(searchParams.get(queryPageNumKey)) || 1;
  currentPage.value = Math.min(pageNum, maxPage.value);
}

watch(
  route,
  () => {
    refreshCurrentPage();
  },
  { immediate: true },
);

watch(maxPage, (nextMaxPage) => {
  if (currentPage.value > nextMaxPage) {
    currentPage.value = nextMaxPage;
  }
});

watch(activeTagLabel, () => {
  if (typeof window === 'undefined') {
    return;
  }

  nextTick(() => {
    refreshCurrentPage();
  });
});

router.onAfterRouteChange = () => {
  refreshCurrentPage();
};
</script>

<template>
  <section class="home-feed" data-pagefind-ignore="all">
    <div class="home-feed-head">
      <span class="home-feed-title">Recent</span>
      <span class="home-feed-line" aria-hidden="true" />
      <span class="home-feed-count">{{ sectionCountLabel }}</span>
    </div>

    <ul v-if="currentItems.length" class="home-feed-list">
      <li v-for="item in currentItems" :key="item.href" class="home-feed-list-item">
        <a
          class="home-feed-card"
          :class="{
            'home-feed-card--gallery': item.gallery,
            'home-feed-card--pinned': item.pinned,
          }"
          :href="item.href"
        >
          <span v-if="item.gallery" class="home-feed-gallery-badge" aria-label="画廊文章">
            <ImageIcon :size="15" aria-hidden="true" />
          </span>

          <div class="home-feed-card-content">
            <div class="home-feed-card-head">
              <h3 class="home-feed-card-title">{{ item.title }}</h3>
              <time v-if="item.dateLabel" class="home-feed-card-date" :datetime="item.dateValue">
                {{ item.dateLabel }}
              </time>
            </div>

            <div class="home-feed-card-body">
              <p v-if="item.description" class="home-feed-card-description">
                {{ item.description }}
              </p>
              <div v-if="item.cover" class="home-feed-card-cover">
                <img :src="item.cover" :alt="item.title">
              </div>
            </div>

            <div class="home-feed-card-meta">
              <span v-if="item.author" class="home-feed-card-meta-item">{{ item.author }}</span>
              <span
                v-for="tag in item.tags.slice(0, 3)"
                :key="`${item.href}-${tag}`"
                class="home-feed-card-meta-item"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </a>
      </li>
    </ul>

    <div v-else class="home-feed-empty">
      <p>{{ emptyMessage }}</p>
      <a class="home-feed-empty-link" :href="archiveHref">去文章归档</a>
    </div>

    <ClientOnly>
      <div v-if="filteredArticles.length > pageSize" class="home-feed-pagination">
        <Pagination
          small
          background
          :current-page="currentPage"
          :page-size="pageSize"
          :total="filteredArticles.length"
          layout="prev, pager, next, jumper"
          @update:current-page="handleUpdatePageNum"
        />
      </div>
    </ClientOnly>
  </section>
</template>

<style scoped>
.home-feed {
  width: 100%;
}

.home-feed-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 18px;
}

.home-feed-title {
  flex: 0 0 auto;
  color: var(--vp-c-text-1);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.home-feed-line {
  flex: 1 1 auto;
  height: 1px;
  background: linear-gradient(
    90deg,
    rgba(109, 129, 98, 0.22) 0%,
    rgba(109, 129, 98, 0.08) 100%
  );
}

.home-feed-count {
  flex: 0 0 auto;
  color: var(--vp-c-brand-1);
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.home-feed-list {
  display: grid;
  gap: 14px;
}

.home-feed-list-item {
  list-style: none;
}

.home-feed-card {
  position: relative;
  display: block;
  padding: 18px 20px;
  border: 1px solid var(--home-card-border);
  border-radius: 18px;
  background: var(--home-card-bg);
  box-shadow: var(--home-card-shadow);
  transition: border-color 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease,
    transform 0.22s ease;
}

.home-feed-card:hover {
  border-color: var(--home-card-border-hover);
  background: var(--home-card-bg-hover);
  box-shadow: var(--home-card-shadow-hover);
  transform: translateY(-2px);
}

.home-feed-card--pinned {
  border-color: rgba(224, 165, 73, 0.3);
}

.home-feed-card--gallery {
  border-color: rgba(80, 131, 214, 0.22);
}

.home-feed-gallery-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(80, 131, 214, 0.22);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  color: var(--vp-c-brand-1);
  backdrop-filter: blur(8px);
}

.home-feed-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.home-feed-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding-right: 34px;
}

.home-feed-card-title {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 18px;
  line-height: 1.5;
}

.home-feed-card-date {
  flex: 0 0 auto;
  color: var(--vp-c-text-3);
  font-family: var(--font-family-code);
  font-size: 12px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.home-feed-card-body {
  display: flex;
  align-items: stretch;
  gap: 16px;
}

.home-feed-card-description {
  flex: 1 1 auto;
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
  line-height: 1.8;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.home-feed-card-cover {
  flex: 0 0 132px;
  width: 132px;
  height: 92px;
  overflow: hidden;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 14px;
  background: var(--home-card-inner-bg);
}

.home-feed-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-feed-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.home-feed-card-meta-item {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--home-card-inner-border);
  border-radius: 999px;
  background: var(--home-card-inner-bg);
  color: var(--vp-c-text-2);
  font-size: 12px;
  line-height: 1;
}

.home-feed-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border: 1px dashed var(--home-card-border);
  border-radius: 18px;
  background: var(--home-card-bg);
  color: var(--vp-c-text-2);
}

.home-feed-empty p {
  margin: 0;
}

.home-feed-empty-link {
  flex: 0 0 auto;
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.home-feed-pagination {
  margin-top: 20px;
}

.home-feed-pagination :deep(.sugar-pagination li.is-active.number) {
  background-color: var(--vp-c-brand-2);
}

.home-feed-pagination :deep(.sugar-pagination button:hover) {
  color: var(--vp-c-brand-2);
}

.home-feed-pagination :deep(.sugar-pager li:not(.is-active):hover) {
  color: var(--vp-c-brand-2);
}

.home-feed-pagination :deep(.sugar-input__wrapper:focus-within) {
  box-shadow: 0 0 0 1px var(--vp-c-brand-2) inset;
}

@media screen and (max-width: 767px) {
  .home-feed-head {
    gap: 10px;
  }

  .home-feed-card {
    padding: 16px 16px 18px;
  }

  .home-feed-card-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding-right: 40px;
  }

  .home-feed-card-body {
    flex-direction: column;
  }

  .home-feed-card-cover {
    width: 100%;
    height: 168px;
    flex-basis: auto;
  }

  .home-feed-empty {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
