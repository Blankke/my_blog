---
title: 新建功能：自动生成专题文章列表
date: 2026-02-18
description: 用目录和 index.md 组织专题，让专题介绍可编辑、文章列表自动维护。
cover: false
tags:
  - blog
  - feature
  - content
---

# 新建功能：自动生成专题文章列表

博客早期的文章入口完全依靠手写列表。文章少的时候很直观，专题变多后，同一篇内容需要同时维护文件、专题页和归档页，很容易漏掉链接。

现在专题采用统一的目录约定：

```text
posts/
  专题名/
    index.md
    第一篇文章.md
    第二篇文章.md
```

`index.md` 只负责专题标题和介绍，并设置 `publish: false`，避免进入普通文章流。站点在访问这个专题首页时读取同目录文章，自动生成列表；文章标题、日期和简介来自各自的 frontmatter。

```yaml
---
title: 专题名称
publish: false
cover: false
aside: false
---
```

这个约定也用于 `gallery/`。目录负责表达内容归属，frontmatter 负责文章自身元数据，页面组件负责展示。以后增加专题内容，只需把 Markdown 放进对应目录；专题介绍仍然可以自由编辑。

需要注意，全站的 `/posts/` 归档页承担跨专题导航，目前仍由人工整理。它更新频率低于日常发文，但新增专题或完成一批文章后应同步检查一次。
