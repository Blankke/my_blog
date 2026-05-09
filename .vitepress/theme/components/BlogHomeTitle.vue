<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useData, withBase } from 'vitepress';
import { useHomeConfig } from '../../../node_modules/@sugarat/theme/src/composables/config/blog';

const { site, frontmatter } = useData();
const home = useHomeConfig();

const name = computed(
  () => (frontmatter.value.blog?.name ?? site.value.title) || home?.value?.name || '',
);
const motto = computed(() => frontmatter.value.blog?.motto || home?.value?.motto || '');

const lightTitleImage = withBase('/brand/blog-title-light.png');
const darkTitleImage = withBase('/brand/blog-title-dark.png');
const lightImageReady = ref(true);
const darkImageReady = ref(true);

const inspiring = ref('');
const inspiringList = computed<string[]>(() => [
  ...new Set(
    [frontmatter.value.blog?.inspiring, home?.value?.inspiring]
      .flat()
      .filter(v => !!v),
  ),
]);
const inspiringIndex = ref<number>(-1);
const inspiringTimeout = computed<number>(
  () => frontmatter.value.blog?.inspiringTimeout || home?.value?.inspiringTimeout || 0,
);

const timer = ref<ReturnType<typeof setTimeout> | undefined>();

function startTimer() {
  if (timer.value) {
    clearTimeout(timer.value);
  }
  if (inspiringTimeout.value > 0) {
    timer.value = setTimeout(() => {
      changeSlogan();
    }, inspiringTimeout.value);
  }
}

async function changeSlogan() {
  startTimer();

  if (inspiringList.value.length < 1) {
    return;
  }

  inspiringIndex.value = (inspiringIndex.value + 1) % inspiringList.value.length;
  const newValue = inspiringList.value[inspiringIndex.value];
  if (newValue === inspiring.value) {
    return;
  }

  inspiring.value = '';
  setTimeout(() => {
    inspiring.value = newValue;
  }, 100);
}

watch(inspiringTimeout, () => {
  startTimer();
});

onMounted(() => {
  changeSlogan();
});

onUnmounted(() => {
  if (timer.value) {
    clearTimeout(timer.value);
  }
});
</script>

<template>
  <div class="home-title-shell">
    <h1 class="home-title">
      <img
        v-if="lightImageReady"
        class="home-title-img home-title-img-light"
        :src="lightTitleImage"
        :alt="name"
        @error="lightImageReady = false"
      >
      <img
        v-if="darkImageReady"
        class="home-title-img home-title-img-dark"
        :src="darkTitleImage"
        :alt="name"
        @error="darkImageReady = false"
      >
      <span v-if="!lightImageReady" class="home-title-fallback home-title-fallback-light">
        {{ name }}
      </span>
      <span v-if="!darkImageReady" class="home-title-fallback home-title-fallback-dark">
        {{ name }}
      </span>
    </h1>
    <p v-show="motto" class="home-title-motto">{{ motto }}</p>
    <div class="inspiring-wrapper">
      <h2 v-show="!!inspiring" @click="changeSlogan">
        {{ inspiring }}
      </h2>
    </div>
  </div>
</template>

<style scoped>
.home-title-shell {
  text-align: center;
}

.home-title {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  min-height: 108px;
  line-height: 1;
}

.home-title-img {
  display: none;
  width: auto;
  max-width: min(800px, 88vw);
  max-height: 232px;
  object-fit: contain;
}

.home-title-fallback {
  display: none;
  font-size: 36px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.home-title-motto {
  margin: 6px 0 0;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}

.inspiring-wrapper {
  margin: 16px 0 0;
  height: 32px;
  width: auto;
}

.inspiring-wrapper h2 {
  animation: fade-in 0.5s ease-in-out;
  cursor: pointer;
  text-align: center;
  font-size: 20px;
  line-height: 1.6;
}

:global(html:not(.dark) .home-title-img-light),
:global(html.dark .home-title-img-dark),
:global(html:not(.dark) .home-title-fallback-light),
:global(html.dark .home-title-fallback-dark) {
  display: block;
}

@media screen and (max-width: 640px) {
  .home-title {
    min-height: 78px;
  }

  .home-title-img {
    max-width: min(560px, 92vw);
    max-height: 166px;
  }

  .home-title-fallback {
    font-size: 32px;
  }

  .home-title-motto {
    margin-top: 6px;
    font-size: 14px;
  }
}

@keyframes fade-in {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}
</style>
