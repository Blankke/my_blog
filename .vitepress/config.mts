import { getThemeConfig, defineConfig } from '@sugarat/theme/node';
import mathjax3 from 'markdown-it-mathjax3';
import { obsidianCompatPlugin } from './plugins/obsidian-compat';

const theme = getThemeConfig({
  footer: {
    version: true,
    copyright: 'Blankke',
  },
  themeColor: 'el-blue',
  author: 'Blankke',
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
      { text: '首页', link: '/' },
      {
        text: '文章',
        items: [
          { text: '文章归档', link: '/posts/' },
          { text: 'Matmul Fusion 专题', link: '/posts/第一题matmul fusion/' },
        ],
      },
      { text: '关于', link: '/about' },
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
    plugins: [obsidianCompatPlugin()],
  },
});
