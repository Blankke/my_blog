---
publish: false
cover: false
---

# Blankke's Blog

Blankke 的个人博客，记录操作系统、GPU 与算子优化、内核开发、论文阅读，以及这个站点自身的设计与迭代。

站点基于 VitePress 和 `@sugarat/theme` 构建，并在主题之上实现了文章/画廊双视图、目录分类、音频播放器、Obsidian 语法兼容、PDF 文章接入与一套自定义视觉交互。

## 本地运行

环境要求：Node.js 20 或更高版本、npm。

```bash
npm install
npm run dev
```

常用命令：

```bash
# 静态检查
npm run check

# 生产构建，产物位于 .vitepress/dist
npm run build

# 构建并预览生产版本
npm run preview

# 清理 VitePress 的缓存与构建产物
npm run clean
```

## 内容结构

```text
.
├── index.md                 # 首页配置、格言和播放器设置
├── about.md                 # About 页面
├── posts/                   # 普通文章与专题
│   ├── index.md             # 全站文章归档
│   └── 专题名/index.md       # 专题介绍页
├── gallery/                 # 画廊作品，目录约定与 posts/ 一致
├── public/                  # 图片、音频、品牌素材等静态资源
├── scripts/                 # 可复现的资源处理脚本
└── .vitepress/
    ├── config.mts           # 站点、导航和主题配置
    ├── plugins/             # 音频、PDF、Obsidian 兼容插件
    └── theme/               # 页面组件、交互逻辑与样式
```

普通文章放在 `posts/`，画廊作品放在 `gallery/`。一级目录会成为首页分类；目录中的 `index.md` 用于设置分类名称和撰写专题介绍，不参与普通文章流。专题页下的文章列表由站点自动生成。

文章使用 YAML frontmatter 描述元数据：

```yaml
---
title: 文章标题
date: 2026-09-01
description: 一句话介绍文章内容
cover: false
tags:
  - blog
  - feature
---
```

`date` 会影响首页最近文章和专题内排序；需要完整隐藏某篇内容时可使用 `hidden: true`。

## 站点能力

- 首页按 `posts/` 一级目录自动生成文章分类，并提供最近文章与标签浏览。
- Gallery 通过首页内视图切换呈现，内容来自 `gallery/`，拥有独立的分类、标签和瀑布流。
- 播放器自动扫描 `public/audio/home/`，无需逐首维护配置。
- `posts/` 内的 PDF 会随构建发布；同名 Markdown 可作为 PDF 的介绍或阅读笔记。
- 兼容常用 Obsidian 图片链接、callout 与代码围栏写法。
- 包含主题切换过渡、导航字母翻转与追光、卡片聚光和倾斜反馈等交互效果。
- Vercel Page Views API 为文章提供轻量浏览量统计。

## 发布

仓库通过 Vercel 自动部署。推送前先完成：

```bash
npm run check
npm run build
```

Vercel 按 `vercel.json` 安装依赖并执行生产构建，发布目录为 `.vitepress/dist`。

站点的设计决策与维护记录收录在[博客开发日志](/posts/Blog/)中。
