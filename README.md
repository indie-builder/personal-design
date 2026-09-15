# Personal Design · 产品集

设计工具与参考产品的合集，pnpm monorepo。

## 产品

| 产品 | 路径 | 说明 |
| --- | --- | --- |
| 布局参考 | [`apps/web/app/products/layout-compositions`](apps/web/app/products/layout-compositions) | 350 种排版构图图鉴，内容改编自 [nevertoday/350-layout-compositions](https://github.com/nevertoday/350-layout-compositions)（CC BY 4.0） |

## 结构

```
apps/web                        # Next.js 产品集站点（App Router + Tailwind v4）
packages/layout-compositions    # 布局参考内容包：catalog.json + 查询 API + 图片同步脚本
```

## 命令

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动开发服务器
pnpm build          # 构建
pnpm lint           # oxlint
pnpm typecheck      # 全部包 TypeScript 检查
pnpm sync:layouts   # 从上游同步布局图片（下载 tarball → sha256 校验 → 转 WebP）
```

## 新增产品

1. 在 `packages/<product>/` 建内容包（数据 + 同步脚本）
2. 在 `apps/web/app/products/<slug>/` 建页面
3. 在 `apps/web/lib/products.ts` 注册

## 署名

布局参考产品的图片与数据改编自上游项目，依 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 使用，站点内已附署名。
