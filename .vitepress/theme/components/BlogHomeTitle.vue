<script setup lang="ts">
import { useData, withBase } from 'vitepress';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useHomeConfig } from '../lib/sugarat';
import SplitText from './SplitText.vue';

type QuotePhase = 'entering' | 'exiting' | 'idle';

const props = withDefaults(
  defineProps<{
    gallery?: boolean;
  }>(),
  {
    gallery: false,
  },
);

const quoteExitDuration = 660;

const { site, frontmatter } = useData();
const home = useHomeConfig();

const name = computed(
  () =>
    (frontmatter.value.blog?.name ?? site.value.title) ||
    home?.value?.name ||
    '',
);

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  return [];
}

const inspiringList = computed<string[]>(() => [
  ...new Set(
    [
      frontmatter.value.blog?.inspiring,
      // Keep the former single-motto configuration working as a fallback.
      frontmatter.value.blog?.motto,
      home?.value?.inspiring,
      home?.value?.motto,
    ].flatMap(collectStrings),
  ),
]);

const lightTitleImage = withBase('/brand/blog-title-light.png');
const darkTitleImage = withBase('/brand/blog-title-dark.png');
const lightGalleryTitleImage = withBase('/brand/gallery-title-light.png');
const darkGalleryTitleImage = withBase('/brand/gallery-title-dark.png');
const currentLightTitleImage = computed(() =>
  props.gallery ? lightGalleryTitleImage : lightTitleImage,
);
const currentDarkTitleImage = computed(() =>
  props.gallery ? darkGalleryTitleImage : darkTitleImage,
);
const currentTitleAlt = computed(() =>
  props.gallery ? "Blankke's Gallery" : name.value,
);
const lightImageReady = ref(true);
const darkImageReady = ref(true);

const inspiringIndex = ref(0);
const inspiring = ref(inspiringList.value[0] ?? '');
const quotePhase = ref<QuotePhase>('idle');
const transitionKey = ref(0);

let transitionRun = 0;
let mounted = false;

function wait(duration: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function waitForPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function changeSlogan() {
  if (quotePhase.value !== 'idle' || inspiringList.value.length < 2) {
    return;
  }

  const run = transitionRun + 1;
  transitionRun = run;
  const nextIndex = (inspiringIndex.value + 1) % inspiringList.value.length;

  quotePhase.value = 'exiting';
  await wait(quoteExitDuration);
  if (!mounted || transitionRun !== run) {
    return;
  }

  inspiringIndex.value = nextIndex;
  inspiring.value = inspiringList.value[nextIndex] ?? '';
  transitionKey.value += 1;
  quotePhase.value = 'entering';
  await nextTick();
  await waitForPaint();

  if (!mounted || transitionRun !== run) {
    return;
  }

  quotePhase.value = 'idle';
}

watch(inspiringList, (quotes) => {
  const currentIndex = quotes.indexOf(inspiring.value);
  inspiringIndex.value = currentIndex >= 0 ? currentIndex : 0;
  inspiring.value = quotes[inspiringIndex.value] ?? '';
  transitionKey.value += 1;
  quotePhase.value = 'idle';
});

onMounted(() => {
  mounted = true;
});

onUnmounted(() => {
  mounted = false;
  transitionRun += 1;
});
</script>

<template>
  <div class="home-title-shell">
    <h1 class="home-title" :class="{ 'home-title--gallery': gallery }">
      <img
        v-if="lightImageReady"
        class="home-title-img home-title-img-light"
        :src="currentLightTitleImage"
        :alt="currentTitleAlt"
        @error="lightImageReady = false"
      >
      <img
        v-if="darkImageReady"
        class="home-title-img home-title-img-dark"
        :src="currentDarkTitleImage"
        :alt="currentTitleAlt"
        @error="darkImageReady = false"
      >
      <span v-if="!lightImageReady" class="home-title-fallback home-title-fallback-light">
        {{ name }}
      </span>
      <span v-if="!darkImageReady" class="home-title-fallback home-title-fallback-dark">
        {{ name }}
      </span>
    </h1>
    <div
      v-if="inspiring"
      class="home-title-meta inspiring-wrapper"
      aria-live="polite"
      aria-atomic="true"
    >
      <button
        class="home-title-motto"
        type="button"
        :aria-label="`${inspiring}。点击切换下一句格言`"
        @click="changeSlogan"
      >
        <SplitText
          :text="inspiring"
          :phase="quotePhase"
          :transition-key="transitionKey"
          :max-move="150"
          :falloff="0.1"
          :interactive="quotePhase === 'idle'"
        />
      </button>
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
  min-height: var(--home-title-min-height);
  line-height: 1;
}

.home-title-img {
  display: none;
  width: auto;
  max-width: var(--home-title-image-max-width);
  max-height: var(--home-title-image-max-height);
  object-fit: contain;
}

.home-title--gallery {
  min-height: clamp(180px, 24vw, 320px);
}

.home-title--gallery .home-title-img {
  width: min(560px, 74vw);
  max-width: none;
  max-height: min(320px, 37vw);
}

.home-title-fallback {
  display: none;
  font-size: var(--home-title-fallback-font-size);
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.home-title-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: var(--home-title-motto-margin-top) 0 0;
}

.home-title-motto {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  margin: 0;
  appearance: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font: inherit;
  font-size: var(--home-title-motto-font-size);
  font-weight: 400;
  line-height: 1.7;
  text-align: center;
}

.home-title-motto:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 5px;
}

:global(html:not(.dark) .home-title-img-light),
:global(html.dark .home-title-img-dark),
:global(html:not(.dark) .home-title-fallback-light),
:global(html.dark .home-title-fallback-dark) {
  display: block;
}

@media screen and (max-width: 640px) {
  .home-title {
    min-height: var(--home-title-min-height-mobile);
  }

  .home-title-img {
    max-width: var(--home-title-image-max-width-mobile);
    max-height: var(--home-title-image-max-height-mobile);
  }

  .home-title--gallery {
    min-height: clamp(150px, 51vw, 220px);
  }

  .home-title--gallery .home-title-img {
    width: min(430px, 88vw);
    max-height: 250px;
  }

  .home-title-fallback {
    font-size: var(--home-title-fallback-font-size-mobile);
  }

  .home-title-motto {
    font-size: var(--home-title-motto-font-size-mobile);
  }
}
</style>
