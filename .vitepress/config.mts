import { defineConfig, getThemeConfig } from '@sugarat/theme/node';
import mathjax3 from 'markdown-it-mathjax3';
import { siteAudioLibraryPlugin } from './plugins/audio-library';
import { motionPreferenceCssPlugin } from './plugins/motion-preference-css';
import { obsidianCompatPlugin } from './plugins/obsidian-compat';
import { pdfPostsPlugin } from './plugins/pdf-posts';

// 在样式加载前恢复用户选择，避免刷新页面时短暂播放已关闭的动画。
const motionPreferenceBootstrap = `
(() => {
  const storageKey = 'blog-motion-preference';
  let savedPreference = null;

  try {
    savedPreference = window.localStorage.getItem(storageKey);
  } catch {}

  const enabled = savedPreference === 'enabled'
    || (savedPreference !== 'disabled'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  document.documentElement.dataset.motion = enabled ? 'enabled' : 'disabled';
  document.documentElement.dataset.motionSource = savedPreference === 'enabled'
    || savedPreference === 'disabled' ? 'user' : 'system';
})();`;

const theme = getThemeConfig({
  footer: {
    version: true,
    copyright: 'Blankke',
    bottomMessage: '<a class="site-readme-link" href="/README">README</a>',
  },
  themeColor: 'el-blue',
  author: 'Blankke',
  // 默认标签面板会合并所有内容，改由两个栏目各自的标签组件负责。
  homeTags: false,
});

export default defineConfig({
  extends: theme,
  lang: 'zh-cn',
  title: "Blankke's Blog",
  description: '记录学习、实践与一点点开源折腾。',
  lastUpdated: true,
  // 详见：https://vitepress.dev/zh/reference/site-config#head
  head: [
    [
      'link',
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '288x288',
        href: '/favicon.png',
      },
    ],
    ['script', {}, motionPreferenceBootstrap],
  ],
  cleanUrls: true,
  themeConfig: {
    outline: {
      level: 'deep',
      label: '目录',
    },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '相关文章',
    lastUpdatedText: '上次更新于',

    logo: '/avatar.png',
    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Articles',
        items: [
          { text: 'Archive', link: '/posts/' },
          {
            text: 'Spring 2025 OS Course Notes',
            link: '/posts/2025春操作系统课程笔记/',
          },
          { text: 'Matmul Fusion Series', link: '/posts/Matmul Fusion/' },
          { text: 'MIT S081 Series', link: '/posts/S081 xv6-labs-2021/' },
        ],
      },
      { text: 'Gallery', link: '/gallery/' },
      { text: 'About', link: '/about' },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/Blankke',
      },
    ],
  },
  markdown: {
    container: {
      infoLabel: '信息',
      noteLabel: '注意',
      tipLabel: '提示',
      warningLabel: '警告',
      dangerLabel: '危险',
      detailsLabel: '详细信息',
      importantLabel: '重要',
      cautionLabel: '小心',
    },
    config(md) {
      md.use(mathjax3);
    },
  },
  vite: {
    css: {
      postcss: {
        plugins: [motionPreferenceCssPlugin()],
      },
    },
    plugins: [
      pdfPostsPlugin(),
      obsidianCompatPlugin(),
      siteAudioLibraryPlugin(),
    ],
  },
});
