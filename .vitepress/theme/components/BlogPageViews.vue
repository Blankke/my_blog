<script setup lang="ts">
/**
 * 用法示例：
 * <ClientOnly>
 *   <BlogPageViews />
 * </ClientOnly>
 *
 * 说明：
 * 把文章阅读量 Teleport 到现有的文章元信息行中，
 * 尽量少改主题结构，同时保证阅读量和作者、时间等信息处于同一层级。
 */
import { useData, useRoute } from 'vitepress';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  requestPageViewCount,
  shouldTrackArticlePage,
} from '../lib/page-views';

const route = useRoute();
const { frontmatter } = useData();

const pageViews = ref<number | null>(null);
const loading = ref(false);
const unavailable = ref(false);
const teleportTarget = ref('');

let requestToken = 0;
let observer: MutationObserver | undefined;

const visible = computed(() => {
  return (
    frontmatter.value.publish !== false && shouldTrackArticlePage(route.path)
  );
});

const countText = computed(() => {
  if (pageViews.value === null) {
    return '';
  }

  return `阅读 ${pageViews.value.toLocaleString('zh-CN')}`;
});

const titleText = computed(() => {
  if (pageViews.value !== null) {
    return `文章阅读量：${pageViews.value.toLocaleString('zh-CN')}`;
  }

  return unavailable.value ? '文章阅读量暂不可用' : '正在加载文章阅读量';
});

function resolveTeleportTarget() {
  teleportTarget.value = document.querySelector('#hack-article-des')
    ? '#hack-article-des'
    : '';
}

async function refreshPageViews() {
  const currentToken = ++requestToken;

  pageViews.value = null;
  unavailable.value = false;

  if (!visible.value) {
    loading.value = false;
    return;
  }

  loading.value = true;
  const value = await requestPageViewCount(route.path);

  if (currentToken !== requestToken) {
    return;
  }

  loading.value = false;

  if (value === null) {
    unavailable.value = true;
    return;
  }

  pageViews.value = value;
}

onMounted(() => {
  resolveTeleportTarget();
  void refreshPageViews();

  observer = new MutationObserver(() => {
    resolveTeleportTarget();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
});

onBeforeUnmount(() => {
  requestToken += 1;
  observer?.disconnect();
});

watch(
  () => route.path,
  () => {
    resolveTeleportTarget();
    void refreshPageViews();
  },
);
</script>

<template>
  <Teleport v-if="visible && teleportTarget" :to="teleportTarget">
    <span class="blog-page-views" :title="titleText">
      <i class="icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M1.5 12s3.75-7 10.5-7 10.5 7 10.5 7-3.75 7-10.5 7S1.5 12 1.5 12Z"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.7"
          />
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="1.7" />
        </svg>
      </i>
      <span v-if="loading">阅读统计中</span>
      <span v-else-if="pageViews !== null">{{ countText }}</span>
      <span v-else-if="unavailable">阅读统计暂不可用</span>
    </span>
  </Teleport>
</template>

<style scoped>
.blog-page-views {
  display: inline-flex;
  align-items: center;
  color: var(--vp-c-text-2);
}

.blog-page-views .icon {
  margin-right: 4px;
  align-items: center;
  display: inline-flex;
  height: 1em;
  justify-content: center;
  width: 1em;
  color: inherit;
}

.blog-page-views .icon svg {
  width: 1em;
  height: 1em;
}
</style>
