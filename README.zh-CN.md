# Personal Design

[English](README.md) · 中文

个人设计作品集。首页按上线日期排列作品时间轴，每个作品点开后都是一个基于真实内容、可以完整浏览的产品。站点基于 Next.js 16、Tailwind CSS v4 和 pnpm workspace。

## 作品

| 作品 | 能做什么 |
| --- | --- |
| [布局参考](apps/web/app/products/layout-compositions) | 按 8 个分类和主题浏览 350 张排版构图图鉴；支持搜索、双页画册翻页，点击图片即可放大。 |
| [灵感集](apps/web/app/products/muse) | 按中文分类或关键词浏览图像与视频；滚动自动加载，可查看详情、作者并前往原作。 |
| [设计工程工具](apps/web/app/products/design-engineer-tools) | 按分类浏览设计工程工具，直接打开工具原站。 |
| [个人网站](apps/web/app/products/personal-sites) | 先看 36 秒宣传片，再打开独立部署的个人网站。 |
| [AI Coding 词典](apps/web/app/products/ai-coding-dictionary) | 在可搜索的知识网中探索术语，中英文逐段对照阅读。 |
| [AI 问答](apps/web/app/products/ai-chat) | 选择或创建智能体，用文字、表格、图表和交互卡片对话；会话保存在当前浏览器。 |
| [文字游乐场](apps/web/app/products/word-arcade) | 五款以标题文字为目标的本机小游戏，随时切换、暂停与重来。 |

## 本地运行

需要 Node.js 24、pnpm 12，以及全局安装的 [Portless](https://github.com/vercel-labs/portless)。开发和本地生产预览统一走 Portless，地址固定为 <https://personal-design.localhost>，无需指定应用端口。

```bash
npm install -g portless          # 本机已安装可跳过
pnpm install
pnpm dev
```

首次运行会自动启动 HTTPS 代理并信任本地证书；macOS/Linux 绑定 443 端口时可能要求 sudo 密码。生产预览先运行 `pnpm build`，再运行 `pnpm start`；两种模式共用同一域名，切换前先用 Ctrl+C 停止当前服务。Git worktree 会自动使用独立子域名，以启动日志中的 URL 为准。

## 参与维护

本站是单人维护的个人作品集。开发命令、仓库结构与内容更新边界见 [CONTRIBUTING.md](CONTRIBUTING.md)；页面行为契约见 [docs/design/README.md](docs/design/README.md)，产品边界见 [PRODUCT.md](PRODUCT.md)。

## 内容来源

布局参考改编自 [nevertoday/350-layout-compositions](https://github.com/nevertoday/350-layout-compositions)，依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。
