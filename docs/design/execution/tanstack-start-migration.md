# TanStack Start 迁移探索报告

- 日期：2026-10-15
- 目标：`apps/web` 从 Next.js 16（App Router）整体迁移到 TanStack Start 1.0，经 LoopX 目标 `personal-design-goal` 端到端交付。
- 结论先行：可行，规模可控（16 个页面路由 + 3 个 API route），但有 3 个必须先解决的结构性差异——图像优化器缺失、无 RSC 下的服务端数据隔离、SQLite 打包路径。建议单分支整体切换，不做双框架并存。

## 1. 背景与上游基线

- TanStack Start 1.0 已正式 stable；栈为 Vite 8 + Nitro（Node 输出），官方要求 Node 24+（与仓库 engines 一致）。
- 当前版本：`@tanstack/react-start` 1.169.2、`@tanstack/react-router` 1.170.44（peer 要求 vite >=8、react 19 ✓）。
- 官方提供 [Next.js 迁移指南](https://tanstack.com/start/latest/docs/framework/react/migrate-from-next-js)，并明确：无内置图像优化器、RSC 支持是实验性 opt-in、`revalidatePath`/`generateStaticParams`/cache 指令不随迁。
- 动机：用户指定的框架切换。附带收益是 Vite dev 启动速度、类型化路由、摆脱 `cacheComponents`/PPR 复杂度。

## 2. 现状盘点（Next.js 使用面）

| 维度 | 现状 | 迁移影响 |
| --- | --- | --- |
| 页面路由 | `/`、7 个 `/products/<slug>`、`/products/muse/[slug]`、`layout/not-found/error`、`robots.ts`、`sitemap.ts` | 全部重写为 `src/routes/` 文件路由 |
| API route | `/api/portfolio/[[...path]]`（GET 目录）、`/api/ai-chat`（POST 流式）、`/products/muse/api/posts`（GET） | 改写为 server routes（Web `Request`/`Response` 形态可保留） |
| 客户端组件 | 45 个文件含 `use client` | Start 无 RSC 边界，组件默认同构， directive 删除即可 |
| `next/image` | 7 个文件（tool-icon、plate-cell、taichi-avatar、home-previews、site-receipt-preview、ai-chat、book-reader） | 无对应物，需替代方案（见 §4 R1） |
| `next/navigation` / `next/link` / `next/server` | 8 / 3 / 1 处 | 换 `@tanstack/react-router` 的 `Link`/`useRouter`/`useLocation`/`notFound` |
| metadata | 10 个页面 `metadata` / `generateMetadata` | 改为路由 `head()` 配置 + 根路由 `HeadContent` |
| 流式渲染 | `cacheComponents: true` + `partialPrefetching`；muse、layout-compositions 把 `params`/`searchParams` 转发进 `<Suspense>` 内 await，外壳预渲染、内容请求时分叉 | loader 返回未 resolve 的 promise + 组件内 `<Await>`/Suspense 等价实现；无 `use cache` |
| 服务端数据 | 包 `src/index.ts` 直接在模块顶层读 SQLite（如 `packages/inspora/src/index.ts` 以 `import.meta.url` 定位 `inspora.db`）；`muse/[slug]` 顶层调用 `listPostRefs()` | 必须收进 server functions/loader（见 §4 R2/R3） |
| `next.config` | 安全头、`/ai-coding-atlas` CSP、媒体 immutable 缓存头（`?v=<sha40>` 查询条件）、图像热链白名单、`transpilePackages`、`serverExternalPackages`、`outputFileTracing*`、`allowedDevOrigins`、`reactCompiler`、`devIndicators` | 逐项映射，见 §3 |
| 部署 | 本地 `pnpm dev`/`pnpm start` 经 portless；媒体版本读 `VERCEL_GIT_COMMIT_SHA`；`/api/ai-chat` 声明 `maxDuration=120` | start 脚本改为 Nitro Node 产物；Vercel 走 Nitro preset，超时另配 |
| 验收 | `check:http` / `check:browser` / `check:chat` 基于 `DESIGN_BASE_URL`，工具中立 | 可整体复用，断言受 HTML 结构变化影响的部分需适配 |

## 3. 逐项映射方案

| Next.js | TanStack Start 1.0 |
| --- | --- |
| `app/layout.tsx` | `src/routes/__root.tsx`（`<HeadContent>` + `<Scripts>`） |
| `app/page.tsx` | `src/routes/index.tsx` |
| `app/products/<slug>/page.tsx` | `src/routes/products/<slug>.tsx`（平铺，7 个） |
| `app/products/muse/[slug]/page.tsx` | `src/routes/products/muse.$slug.tsx` |
| `app/not-found.tsx` / `error.tsx` | 根路由 `notFoundComponent` / `errorComponent` |
| `app/api/**/route.ts` | `createServerFile` + API server route，保留 GET/POST 与流式 `Response` |
| `app/sitemap.ts` / `app/robots.ts` | `/sitemap.xml`、`/robots.txt` server routes（迁移指南推荐做法） |
| `metadata` / `generateMetadata` | 路由 `head()`；动态标题走 loader data |
| `next/link` | 类型化 `<Link to params search>` |
| `next/navigation` | `useRouter` / `useLocation` / `notFound()`（`@tanstack/react-router`） |
| `next/image` | 自建 `/_image` 优化 server route（sharp，workspace 已有依赖）+ 轻量 `<Img>` 包装组件；URL 白名单与 `?v=` 版本化语义在 route 内复刻 |
| `cacheComponents` + Suspense 外壳 | loader 内 server function 取数、返回 deferred promise、组件 Suspense 流式；预渲染外壳由 Start prerender 配置承担 |
| `transpilePackages` | 不需要：workspace 包 exports 直指 `src/*.ts`，Vite 原生编译 |
| `serverExternalPackages` | Nitro `externals`（`@earendil-works/pi-*`） |
| `headers()` 全站安全头 | Nitro route rules / server middleware |
| `/ai-coding-atlas` CSP、媒体 immutable 头（query 条件） | route rules 不支持 query 匹配，落 server middleware 判断 `?v=` |
| `images.remotePatterns` 热链白名单 | `/_image` route 内常量白名单 |
| `outputFileTracingIncludes`（`inspora.db`） | Nitro 语义不同：DB 作为 server assets 显式纳入，运行时路径改由 assets 解析（见 R4） |
| `reactCompiler` | `@vitejs/plugin-react` + `babel-plugin-react-compiler` |
| Tailwind `@tailwindcss/postcss` | `@tailwindcss/vite` 插件 |
| `allowedDevOrigins` / `devIndicators` | Vite `server.allowedHosts` / 无对应（删除） |
| `pnpm dev` / `pnpm start`（portless） | dev → `vite dev`；start → `node .output/server/index.mjs`；portless.json 不动，`PORT` 透传需在验收段实测 |
| `maxDuration=120` | Nitro/部署平台运行时配置 |

## 4. 风险清单

- **R1 图像优化器缺失（高）**：7 处 `next/image` 承担热链上游媒体与本地媒体的压力优化、尺寸与 CLS。方案：自建 `/_image` server route（sharp 已在 workspace，format/resize 语义可对齐），URL 契约由 `<Img>` 包装组件封装，页面代码零散改动最小。验收段必须核对 Lighthouse/响应头无回退。
- **R2 服务端数据隔离（高）**：Start 默认无 RSC，包 `src/index.ts` 的同步产物 API 若被 client 组件 import，SQLite 读取代码会进 client bundle。必须把数据访问收进 `*.server.ts` / server functions，页面经 loader 取数；`portfolio` API 已是纯 server route，风险集中在 muse 页面顶层 `listPostRefs()` 与各页面直接调用包 API 的路径。
- **R3 PPR 等价性（中）**：`cacheComponents` 的外壳预渲染 + 请求时分叉在 Start 中变为 prerender + loader 流式；首屏字节构成与 TTFB 特性会变化，需在验收段对比首页与 muse 列表页的流式行为。
- **R4 SQLite 打包路径（中）**：`inspora.db` 以 `import.meta.url` 相对定位，Nitro 打包后路径失效；改为 Nitro server assets 或构建期拷贝 + assets 路径解析。
- **R5 媒体缓存头 query 条件（低）**：`?v=<sha40>` 才发 immutable 头的逻辑需 middleware 实现，注意不影响无版本 URL 的 revalidate 语义。
- **R6 部署差异（中）**：Vercel 上 Next 原生 vs Nitro preset；`maxDuration`、图像优化在 serverless 的执行模式需部署侧验证（本地 Node 输出不受影响）。
- **R7 E2E 断言兼容（低）**：check 套件 URL/选择器中立，但流式 HTML 时序与 CSP 头变化可能触发个别断言失败，按失败逐条适配并记录。
- **R8 迁移策略（决策）**：16 页规模整体切换成本低于双框架并存（共享组件无 RSC 边界冲突）；单分支一次切换、E2E 全绿后删除 Next 依赖，回滚即还原分支。

## 5. 交付顺序（对应 LoopX todos）

1. `tanstack-start-exploration`（本报告）。
2. `tanstack-start-scaffold`：Vite 8 + Nitro 基座、`src/routes` 全部页面与根布局、head metadata、Tailwind/Compiler/portless 接入。
3. `tanstack-start-server`：3 个 API route → server routes、sitemap/robots、安全头与缓存头 middleware。
4. `tanstack-start-data-media`：`/_image` 优化 route 与 7 处替换、muse/layout-compositions 流式改 loader+defer、导航 hooks 替换。
5. `tanstack-start-acceptance`：`pnpm build`+`pnpm start` 后跑 `check:http`/`check:browser`/`check:chat` + 全套单测/typecheck/lint，证据落 `docs/design/execution/evidence/`，移除 `next` 与 `next.config`。

## 6. 验收基线

- 迁移分支上全套检查绿：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm check:navigation`，生产预览后 `DESIGN_BASE_URL` 指向 Portless URL 跑三个 E2E 套件（准备方式见[当前验收入口](./README.md)）。
- 首页、muse 列表/详情、layout-compositions 的流式行为与安全头逐一核对；`/_image` 输出的尺寸、格式、缓存头与原 `next/image` 行为对齐。
- 仓库内不再残留 `next` 依赖、`next.config.*`、`.next` 产物路径；文档与 AGENTS.md 中的 Next.js 表述同步更新。
