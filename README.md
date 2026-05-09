---
publish: false
cover: false
---

# Blankke's Blog

基于 VitePress 和 `@sugarat/theme` 搭建的个人博客。

## 环境要求

- Node.js 20 或更高版本
- npm

## 本地安装

```bash
npm install
```

## 本地开发

```bash
npm run dev
```

默认会启动本地开发服务器，适合边改边看。

## 构建

```bash
npm run build
```

构建产物会输出到 `.vitepress/dist`。

## 本地预览构建结果

```bash
npm run preview
```

默认预览地址是 `http://localhost:4173/`。

## 部署到 Vercel

这个项目已经包含 `vercel.json`，Vercel 导入仓库后会使用：

- Install Command: `npm install`
- Output Directory: `.vitepress/dist`

推荐在 Vercel 项目设置里将 Node.js 版本设置为 20 或更高。

## 站点内容说明

- `index.md`：首页配置
- `about.md`：关于页
- `posts/`：博客文章
- `public/`：静态资源
- `.vitepress/config.mts`：站点主题与导航配置

## 备注

评论系统目前默认关闭；如果需要 Giscus、Waline 或其他评论方案，可以再单独接上。
