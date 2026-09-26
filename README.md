# Personal Design

个人设计作品集。首页按上线日期展示作品时间轴；站点基于 Next.js 16、Tailwind CSS v4 和 pnpm workspace。

## 作品

| 作品 | 功能 |
| --- | --- |
| [布局参考](apps/web/app/products/layout-compositions) | 按 8 个分类和主题浏览 350 张排版构图图鉴；支持搜索、双页画册和图片放大。 |
| [灵感集](apps/web/app/products/muse) | 按中文分类或关键词浏览图像与视频；滚动加载作品，查看详情、作者和原作。 |
| [设计工程工具](apps/web/app/products/design-engineer-tools) | 按分类浏览设计工程工具，直接打开工具原站。 |
| [个人网站](apps/web/app/products/personal-sites) | 观看网站宣传片，再打开独立部署的个人网站。 |
| [AI Coding 词典](apps/web/app/products/ai-coding-dictionary) | 在可搜索的知识网中探索术语，逐段对照阅读中英文内容。 |

## 本地运行

需要 Node.js 24、pnpm 12。`pnpm dev` 使用全局安装的 portless，地址为 <https://personal-design.localhost>；也可以用 `pnpm dev:direct` 在 <http://localhost:3000> 启动。

```bash
pnpm install
pnpm dev
```

## 项目结构

- `apps/web`：唯一的 Next.js 站点，包括首页、作品页面和共享组件。
- `packages/*`：各作品的数据、查询 API 和内容同步脚本。
- `apps/web/public`：同步或生成的本地媒体；灵感集的大图和视频等媒体由来源站点提供。

## 常用命令

```bash
pnpm build                       # 生产构建
pnpm start                       # 启动生产服务
pnpm lint                        # 代码检查
pnpm typecheck                   # 类型检查
pnpm test                        # 单元测试
pnpm format:check                # 格式检查
pnpm sync:layouts                # 同步布局参考缩略图
pnpm sync:inspora                # 增量同步灵感集
pnpm sync:design-engineer-tools  # 同步工具目录
pnpm sync:ai-coding-dictionary   # 增量同步和翻译词典
```

词典同步依赖已登录的 `gh` 和本机 `claude` CLI。个人网站的本地预览媒体由 `packages/personal-sites` 生成，更新宣传片后运行该包的 `render:promo` 和根目录的 `pnpm sync:personal-sites`。

布局参考内容改编自 [nevertoday/350-layout-compositions](https://github.com/nevertoday/350-layout-compositions)，依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用。页面流程与验收见 [设计文档](docs/design/README.md)。
