<script setup lang="ts" name="BlogApp">
import { useData } from 'vitepress';
import Theme from 'vitepress/theme';
import { computed } from 'vue';
import {
  BlogAlert,
  BlogArticleAnalyze,
  BlogButtonAfterArticle,
  BlogFooter,
  BlogHomeHeaderAvatar,
  BlogHomeInfo,
  BlogList,
  BlogOml2d,
  BlogSidebar,
  useBlogInfoCollapsible,
  useBlogThemeMode,
  useDarkTransitionConfig,
  useDarkTransition,
} from '../lib/sugarat';
import BlogHomeTitle from './BlogHomeTitle.vue';
import CalloutEnhancer from './CalloutEnhancer.vue';
import DocSidebarResizer from './DocSidebarResizer.vue';
import HomePostCategories from './HomePostCategories.vue';

const { frontmatter } = useData();
const layout = computed(() => frontmatter.value.layout);
const isBlogTheme = useBlogThemeMode();
const { Layout } = Theme;

const blogInfoCollapsible = useBlogInfoCollapsible();

useDarkTransition();
const openTransition = useDarkTransitionConfig();
</script>

<template>
  <Layout :class="{ 'blog-theme-layout': openTransition }">
    <template #layout-top>
      <slot name="layout-top" />
      <ClientOnly>
        <DocSidebarResizer />
        <CalloutEnhancer />
        <BlogOml2d />
        <BlogAlert />
      </ClientOnly>
    </template>

    <template #doc-before>
      <slot name="doc-before" />
      <ClientOnly>
        <BlogArticleAnalyze />
      </ClientOnly>
    </template>

    <template #nav-bar-content-before>
      <slot name="nav-bar-content-before" />
    </template>

    <template v-if="isBlogTheme" #home-hero-before>
      <slot name="home-hero-before" />
      <div class="home">
        <BlogHomeHeaderAvatar />
        <div class="header-banner">
          <BlogHomeTitle />
        </div>
        <div class="content-wrapper">
          <div class="blog-list-wrapper">
            <HomePostCategories />
            <BlogList />
          </div>
          <div
            :class="{
              'normal-mode': blogInfoCollapsible,
            }"
            class="blog-info-wrapper"
          >
            <BlogHomeInfo />
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
      <BlogFooter v-if="layout === 'home'" />
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
  width: 100%;
}

.blog-info-wrapper {
  margin-left: var(--layout-home-sidebar-gap);
  position: sticky;
  top: var(--layout-home-sidebar-top);
}

@media screen and (max-width: 959px) {
  .blog-info-wrapper {
    margin-left: var(--layout-home-sidebar-gap);
    position: sticky;
    top: var(--layout-home-sidebar-top-mobile);
  }
}

@media screen and (max-width: 767px) {
  .header-banner {
    padding: var(--layout-home-banner-padding-mobile);
  }

  .content-wrapper {
    flex-wrap: wrap;
  }

  .blog-info-wrapper {
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
