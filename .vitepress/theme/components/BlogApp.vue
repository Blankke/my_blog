<script setup lang="ts" name="BlogApp">
import { useData, useRoute } from 'vitepress';
import Theme from 'vitepress/theme';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useAppearanceTransition } from '../lib/appearance-transition';
import { useHomeView } from '../lib/home-view';
import {
  BlogAlert,
  BlogArticleAnalyze,
  BlogButtonAfterArticle,
  BlogFooter,
  BlogHomeHeaderAvatar,
  BlogHomeInfo,
  BlogOml2d,
  BlogSidebar,
  useBlogInfoCollapsible,
  useBlogThemeMode,
  useDarkTransitionConfig,
} from '../lib/sugarat';
import BlogHomeTitle from './BlogHomeTitle.vue';
import BlogPageViews from './BlogPageViews.vue';
import CalloutEnhancer from './CalloutEnhancer.vue';
import CardSpotlight from './CardSpotlight.vue';
import DocSidebarResizer from './DocSidebarResizer.vue';
import FolderPostList from './FolderPostList.vue';
import GalleryFeed from './GalleryFeed.vue';
import HomeAudioPlayer from './HomeAudioPlayer.vue';
import HomeFeed from './HomeFeed.vue';
import HomeGalleryCategories from './HomeGalleryCategories.vue';
import HomeGalleryInfo from './HomeGalleryInfo.vue';
import HomeGalleryTags from './HomeGalleryTags.vue';
import HomePostCategories from './HomePostCategories.vue';
import HomePostTags from './HomePostTags.vue';
import NavbarLetterSwap from './NavbarLetterSwap.vue';
import NavbarLimelight from './NavbarLimelight.vue';
import TiltCards from './TiltCards.vue';

const { frontmatter } = useData();
const route = useRoute();
const layout = computed(() => frontmatter.value.layout);
const isBlogTheme = useBlogThemeMode();
const { Layout } = Theme;

const blogInfoCollapsible = useBlogInfoCollapsible();
const { isGalleryView, isHomeRoute, setView, view } = useHomeView();

const openTransition = useDarkTransitionConfig();
const { canAnimateAppearance } = useAppearanceTransition(openTransition);
const enableTransitionStyles = computed(
  () => openTransition && canAnimateAppearance.value,
);

const activeNavTarget = computed<
  'home' | 'articles' | 'gallery' | 'about' | null
>(() => {
  if (isHomeRoute.value) {
    return isGalleryView.value ? 'gallery' : 'home';
  }

  if (route.path === '/gallery/' || route.path.startsWith('/gallery/')) {
    return 'gallery';
  }

  if (route.path === '/posts/' || route.path.startsWith('/posts/')) {
    return 'articles';
  }

  if (route.path === '/about' || route.path === '/about.html') {
    return 'about';
  }

  return null;
});

function handleHomeViewNavClick(event: MouseEvent) {
  if (!isHomeRoute.value) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const link = target.closest<HTMLAnchorElement>(
    'a.VPNavBarMenuLink[href="/"], a.VPNavBarMenuLink[href="/?view=gallery"], a.VPNavScreenMenuLink[href="/"], a.VPNavScreenMenuLink[href="/?view=gallery"]',
  );

  if (!link) {
    return;
  }

  if (link.getAttribute('href') === '/?view=gallery') {
    event.preventDefault();
    setView('gallery');
    return;
  }

  if (link.getAttribute('href') === '/' && isGalleryView.value) {
    event.preventDefault();
    setView('articles');
  }
}

onMounted(() => {
  document.addEventListener('click', handleHomeViewNavClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleHomeViewNavClick);
});

watch(
  view,
  (nextView) => {
    if (typeof document === 'undefined') {
      return;
    }

    if (nextView === 'gallery') {
      document.documentElement.dataset.homeView = 'gallery';
      return;
    }

    delete document.documentElement.dataset.homeView;
  },
  { immediate: true },
);

watch(
  () => route.path,
  (nextPath) => {
    if (typeof document === 'undefined') {
      return;
    }

    if (nextPath === '/gallery/' || nextPath.startsWith('/gallery/')) {
      document.documentElement.dataset.routeSection = 'gallery';
      return;
    }

    delete document.documentElement.dataset.routeSection;
  },
  { immediate: true },
);
</script>

<template>
  <Layout :class="{ 'blog-theme-layout': enableTransitionStyles }">
    <template #layout-top>
      <slot name="layout-top" />
      <ClientOnly>
        <DocSidebarResizer />
        <CalloutEnhancer />
        <CardSpotlight />
        <TiltCards />
        <BlogOml2d />
        <BlogAlert />
      </ClientOnly>
    </template>

    <template #doc-before>
      <slot name="doc-before" />
      <ClientOnly>
        <BlogArticleAnalyze />
        <BlogPageViews />
      </ClientOnly>
    </template>

    <template #nav-bar-content-before>
      <slot name="nav-bar-content-before" />
      <ClientOnly>
        <NavbarLetterSwap />
        <NavbarLimelight :active-target="activeNavTarget" />
      </ClientOnly>
    </template>

    <template v-if="isBlogTheme" #home-hero-before>
      <slot name="home-hero-before" />
      <div class="home">
        <BlogHomeHeaderAvatar />
        <div class="header-banner">
          <BlogHomeTitle :gallery="isGalleryView" />
        </div>
        <HomeAudioPlayer />
        <div class="content-wrapper">
          <div class="blog-list-wrapper">
            <div v-show="!isGalleryView">
              <HomePostCategories />
              <HomeFeed />
            </div>
            <div v-show="isGalleryView">
              <HomeGalleryCategories />
              <GalleryFeed embedded />
            </div>
          </div>
          <div
            :class="{
              'normal-mode': blogInfoCollapsible,
            }"
            class="blog-info-wrapper"
          >
            <template v-if="!isGalleryView">
              <BlogHomeInfo />
              <HomePostTags />
            </template>
            <template v-else>
              <HomeGalleryInfo />
              <HomeGalleryTags />
            </template>
          </div>
        </div>
      </div>
    </template>

    <template v-if="isBlogTheme" #sidebar-nav-after>
      <slot name="sidebar-nav-after" />
      <BlogSidebar />
    </template>

    <template #doc-after>
      <slot name="doc-after" />
      <ClientOnly>
        <BlogButtonAfterArticle />
      </ClientOnly>
    </template>

    <template #layout-bottom>
      <div v-if="layout === 'home'" class="blog-footer-stage">
        <BlogFooter />
        <img
          class="blog-footer-stamp"
          src="/brand/stamp.png"
          alt=""
          width="1254"
          height="1254"
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      </div>
      <slot name="layout-bottom" />
    </template>

    <template #nav-bar-title-before>
      <slot name="nav-bar-title-before" />
    </template>
    <template #nav-bar-title-after>
      <slot name="nav-bar-title-after" />
    </template>
    <template #nav-bar-content-after>
      <slot name="nav-bar-content-after" />
    </template>
    <template #nav-screen-content-before>
      <slot name="nav-screen-content-before" />
    </template>
    <template #nav-screen-content-after>
      <div v-if="blogInfoCollapsible" class="minify-mode blog-info-wrapper">
        <BlogHomeInfo />
      </div>
      <slot name="nav-screen-content-after" />
    </template>

    <template #sidebar-nav-before>
      <slot name="sidebar-nav-before" />
    </template>

    <template #page-top>
      <slot name="page-top" />
    </template>
    <template #page-bottom>
      <slot name="page-bottom" />
    </template>

    <template #not-found>
      <slot name="not-found" />
    </template>
    <template #home-hero-info>
      <slot name="home-hero-info" />
    </template>
    <template #home-hero-image>
      <slot name="home-hero-image" />
    </template>
    <template #home-hero-after>
      <slot name="home-hero-after" />
    </template>
    <template #home-features-before>
      <slot name="home-features-before" />
    </template>
    <template #home-features-after>
      <slot name="home-features-after" />
    </template>

    <template #doc-footer-before>
      <slot name="doc-footer-before" />
    </template>

    <template #doc-top>
      <slot name="doc-top" />
    </template>
    <template #doc-bottom>
      <slot name="doc-bottom" />
      <FolderPostList />
    </template>

    <template #aside-top>
      <slot name="aside-top" />
    </template>
    <template #aside-bottom>
      <slot name="aside-bottom" />
    </template>
    <template #aside-outline-before>
      <slot name="aside-outline-before" />
    </template>
    <template #aside-outline-after>
      <slot name="aside-outline-after" />
    </template>
    <template #aside-ads-before>
      <slot name="aside-ads-before" />
    </template>
    <template #aside-ads-after>
      <slot name="aside-ads-after" />
    </template>
  </Layout>
</template>

<style scoped>
.home {
  margin: 0 auto;
  padding: var(--layout-home-padding);
  max-width: var(--layout-home-max-width);
}

@media screen and (min-width: 960px) {
  .home {
    padding-top: calc(var(--vp-nav-height) - var(--layout-home-nav-offset));
  }
}

.header-banner {
  width: 100%;
  padding: var(--layout-home-banner-padding);
}

.content-wrapper {
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.blog-list-wrapper {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}

.blog-info-wrapper {
  flex: 0 0 var(--layout-home-sidebar-width);
  margin-left: var(--layout-home-sidebar-gap);
  position: sticky;
  top: var(--layout-home-sidebar-top);
  width: var(--layout-home-sidebar-width);
}

.blog-info-wrapper :deep(.blog-info),
.blog-info-wrapper :deep(.gallery-info),
.blog-info-wrapper :deep(.home-tags-card) {
  width: 100%;
}

.blog-footer-stage {
  position: relative;
  isolation: isolate;
}

.blog-footer-stamp {
  position: absolute;
  z-index: 1;
  right: max(
    24px,
    calc(clamp(24px, 17vw, 330px) - clamp(54px, 3.6vw, 69px))
  );
  bottom: -5px;
  display: block;
  width: clamp(216px, 14.4vw, 276px);
  height: auto;
  opacity: 0.9;
  filter: saturate(1.04) contrast(1.04)
    drop-shadow(0 4px 5px rgba(78, 0, 16, 0.2));
  pointer-events: none;
  user-select: none;
  transform: rotate(-11deg);
  transform-origin: 50% 50%;
}

@media screen and (max-width: 959px) {
  .blog-info-wrapper {
    margin-left: var(--layout-home-sidebar-gap);
    position: sticky;
    top: var(--layout-home-sidebar-top-mobile);
  }
}

@media screen and (max-width: 767px) {
  .blog-footer-stamp {
    right: 0;
    bottom: -5px;
    width: clamp(152px, 36vw, 204px);
    opacity: 0.82;
    transform: rotate(-9deg);
  }

  .header-banner {
    padding: var(--layout-home-banner-padding-mobile);
  }

  .content-wrapper {
    flex-wrap: wrap;
  }

  .blog-info-wrapper {
    flex: 1 1 100%;
    margin: var(--layout-home-sidebar-mobile-margin);
    width: 100%;
  }

  .normal-mode {
    display: none;
  }

  .minify-mode {
    display: block;
  }
}

@media screen and (min-width: 768px) {
  .minify-mode {
    display: none;
  }

  .normal-mode {
    display: block;
  }
}
</style>

<style>
@import url(../../../node_modules/@sugarat/theme/src/styles/dark-transition.css);
</style>
