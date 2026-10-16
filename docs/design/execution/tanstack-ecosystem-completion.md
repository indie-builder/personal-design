# TanStack 生态完成度审计（迁移后残留清单）

- 日期：2026-10-16
- 基线：`8309a99`（TanStack Start 迁移合并）+ #72/#73 部署修复
- 目标：列出迁移后仍属 Next.js 范式或未接入 TanStack 生态的部分，给出端到端收敛方案。经 LoopX `personal-design-goal` 交付。

## 结论先行

核心运行时已完全落在 TanStack 生态内（Start 1.169 / Router 1.170 / server functions / loader 流式 / head / notFound / errorComponent）。残留分四类：**Next 指令残留**（量大、机械）、**导航兼容层**（有存在的结构性理由，但需收窄边界）、**typed route 未完成**（生态招牌特性，静态路径应采纳）、**devtools 缺失**（开发体验）。

## 残留清单

| # | 残留 | 现状 | 判定 |
| --- | --- | --- | --- |
| 1 | `'use client'` 指令 | 40 个文件仍保留（迁移时判定为无害 no-op 未删） | **删除**。TanStack 无 RSC 边界，指令是死代码；官方迁移清单明确要求移除 |
| 2 | `@/lib/navigation` 兼容层 | 6 个文件、12 处调用（`usePathname`/`useSearchParams`/`splitHref`），文件头自述「next/navigation 的最小等价层」 | **保留实现、更新定位**。三个 hook 均为 `useRouterState` 薄包装——这正是 TanStack Router 对跨路由全局读取的官方推荐形态；`splitHref` 服务于动态浏览链接（DB 生成的 href 无法静态 typed）。改文件头注释为「TanStack Router 全局读取助手」，不再是 next/navigation 等价层 |
| 3 | `WorkspaceLink` 字符串 href facade | 5 个文件使用；props 面仍是 Next Link 时代契约（`scroll`/`prefetch`） | **收窄**。注释已声明「公共契约是字符串 href」——动态浏览 href（browse-context 拼接、DB slug）无法静态 typed，保留 facade 合理；但 `scroll/prefetch` 语义已映射为 `resetScroll/preload`，props 改为 TanStack 命名，调用点同步 |
| 4 | 静态路径未走 typed route | 站点导航、产品卡片、返回链接等静态内部路径全走字符串 facade；TanStack 招牌的编译期路由校验只覆盖路由文件内部 | **采纳**。静态路径调用点（导航头、首页产品菜单、返回链接、error/not-found 视图）改用类型化 `<Link to>`；动态浏览链接保持字符串 facade |
| 5 | Router Devtools 未安装 | 无 `@tanstack/react-router-devtools` | **接入**。dev-only 挂载到根路由，对齐 TanStack 生态默认开发体验 |
| 6 | `Img` 组件 props 命名 | `unoptimized`/`priority` 沿用 next/image 命名 | **保留**。该组件本就是 next/image 语义的替代封装（契约对齐是有意为之，见组件头注释），改名零收益 |
| 7 | `pageHead()` / `siteTitle()` 助手 | 对齐 Next metadata 模板语义 | **保留**。纯属本站 helper，与框架无关 |
| 8 | `maxDuration=120` 注释 | ai-chat 路由保留部署侧超时提示 | **保留**。部署事实记录 |

## 端到端迁移方案（对应 LoopX todos）

1. **兼容层收敛与指令清理**：删 40 处 `'use client'`；`lib/navigation.ts` 重定位注释；`WorkspaceLink` props 改 `resetScroll`/`preload` 命名并收窄注释边界。
2. **typed route 采纳**：静态路径调用点改类型化 `<Link to>`（编译期路由校验生效面从路由文件扩展到组件层）；动态浏览链接维持字符串 facade。
3. **Devtools**：`@tanstack/react-router-devtools` dev-only 挂载根路由。
4. **验收**：typecheck/lint/203 单测/check:navigation；导航触及面跑 `check:browser`（含 shallow-navigation、route-motion、journeys）；muse 流式与浏览上下文回归；PR 合并后生产路由冒烟。

## 明确不做

- 浏览上下文（`browse-context.ts` 拼接 href）改 typed params：需要把 DB 驱动的相邻窗口/分类逻辑重构为 params 对象，收益低于风险，facade 已隔离。
- 客户端数据层引入 `@tanstack/react-query`：现有 loader + 局部 fetch 模式无状态同步痛点，引入属新增而非迁移。
