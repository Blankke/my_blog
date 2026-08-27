import { defineConfig, getThemeConfig } from '@sugarat/theme/node';
import mathjax3 from 'markdown-it-mathjax3';
import { siteAudioLibraryPlugin } from './plugins/audio-library';
import { obsidianCompatPlugin } from './plugins/obsidian-compat';
import { pdfPostsPlugin } from './plugins/pdf-posts';

const theme = getThemeConfig({
  footer: {
    version: true,
    copyright: 'Blankke',
    bottomMessage: '<a class="site-readme-link" href="/README">README</a>',
  },
  themeColor: 'el-blue',
  author: 'Blankke',
  blog: {
    // 默认标签面板统计所有文章（含画廊）的标签，已由项目自带的
    // HomePostTags / HomeGalleryTags 按视图拆分替代，这里关闭。
    homeTags: false,
  },
});

export default defineConfig({
  extends: theme,
  lang: 'zh-cn',
  title: "Blankke's Blog",
  description: '记录学习、实践与一点点开源折腾。',
  lastUpdated: true,
  // 详见：https://vitepress.dev/zh/reference/site-config#head
  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],
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
      { text: 'Gallery', link: '/?view=gallery' },
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
    plugins: [
      pdfPostsPlugin(),
      obsidianCompatPlugin(),
      siteAudioLibraryPlugin(),
    ],
  },
});
