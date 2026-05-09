<script setup lang="ts" name="BlogApp">
import Theme from 'vitepress/theme';
import { useData } from 'vitepress';
import { computed } from 'vue';
import { useDarkTransition } from '../../../node_modules/@sugarat/theme/src/hooks/useDarkTransition';
import { useBlogInfoCollapsible, useBlogThemeMode, useDarkTransitionConfig } from '../../../node_modules/@sugarat/theme/src/composables/config/blog';
import BlogHomeInfo from '../../../node_modules/@sugarat/theme/src/components/BlogHomeInfo.vue';
import BlogList from '../../../node_modules/@sugarat/theme/src/components/BlogList.vue';
import BlogSidebar from '../../../node_modules/@sugarat/theme/src/components/BlogSidebar.vue';
import BlogArticleAnalyze from '../../../node_modules/@sugarat/theme/src/components/BlogArticleAnalyze.vue';
import BlogAlert from '../../../node_modules/@sugarat/theme/src/components/BlogAlert.vue';
import BlogFooter from '../../../node_modules/@sugarat/theme/src/components/BlogFooter.vue';
import BlogHomeHeaderAvatar from '../../../node_modules/@sugarat/theme/src/components/BlogHomeHeaderAvatar.vue';
import BlogOml2d from '../../../node_modules/@sugarat/theme/src/components/BlogOml2d.vue';
import BlogButtonAfterArticle from '../../../node_modules/@sugarat/theme/src/components/BlogButtonAfterArticle.vue';
import BlogHomeTitle from './BlogHomeTitle.vue';
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
  padding: 20px;
  max-width: 1126px;
}

@media screen and (min-width: 960px) {
  .home {
    padding-top: calc(var(--vp-nav-height) - 16px);
  }
}

.header-banner {
  width: 100%;
  padding: 16px 0 12px;
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
  margin-left: 16px;
  position: sticky;
  top: 100px;
}

@media screen and (max-width: 959px) {
  .blog-info-wrapper {
    margin-left: 16px;
    position: sticky;
    top: 40px;
  }
}

@media screen and (max-width: 767px) {
  .header-banner {
    padding: 12px 0 10px;
  }

  .content-wrapper {
    flex-wrap: wrap;
  }

  .blog-info-wrapper {
    margin: 20px 0;
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
