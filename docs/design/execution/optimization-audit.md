# 迁移后优化审计（证据驱动）

- 日期：2026-10-16
- 基线：`be7c618`（TanStack 生态收敛合并）
- 方法：生产构建产物 + 本地生产预览实测取证；经 LoopX `personal-design-goal` 端到端实施。

## 证据与优化项

| # | 项 | 证据 | 判定 |
| --- | --- | --- | --- |
| O1 | 小票预览水合竞态 | `site-receipt-preview.tsx` 仅 `onLoad → setImageReady`；图片在监听器挂载前完成加载则 `data-ready` 永久 false（动效检查段实测发现） | **P0 缺陷修复**：effect 内补 `img.complete` 兜底 |
| O2 | ai-chat 路由 chunk 600KB gzip（2.0MB 原始） | 构成：`@openuidev/react-ui` 依赖链（radix 全家桶、d3、katex、`react-syntax-highlighter` 全语言构建，chunk 内 highlight 引用 174 处）。代码分割正常（仅 ai-chat 路由加载），但该路由自身过重 | **P1 减重**：Vite alias 把 `react-syntax-highlighter` 指向 light 构建 + 注册实际需要的语言；不动 openui 源码 |
| O3 | muse 网格/首页预览等 fill+sizes 图未优化 | `plate-cell.tsx` fill + sizes(25vw/33vw/50vw/100vw)，直连上游原图（bestdesignsonx 可达数百 KB/张），网格 24 张 | **P1 带宽**：`Img` 对 fill+sizes 生成响应式 srcSet 走 `/_image`（Next fill 行为对齐） |
| O4 | `/_image` 无服务端缓存 | 每请求重新拉源+转换（数据媒体段报告已记录） | **P1**：进程内 LRU（按 url+w+q+格式键，容量与字节上限），配合 O3 使上游回源只发生一次 |
| O5 | muse 详情冷启动 TTFB 0.79s（热 40ms） | 首请求含 DB 打开 + `listPostRefs()` 全量扫描；DB 每部署不可变 | **P1**：应用层模块级 memo（lambda 生命周期内一次扫描） |
| O6 | route-motion 批量偶发抖动（约 1/6） | 验收段遗留；timeline-motion 同类问题已用 scrollIntoView+轮询加固 | **P2**：同款模式加固 route-motion |

## 提案不实施（架构级，需单独决策）

- **inspora.db 60.6MB 逼近 GitHub 100MB 硬限制**（#67 同步提交已预警）：建议后续迁 Git LFS 或构建期从对象存储拉取；影响 sync 工作流与本地开发，不在本轮静默改动。
- ai-chat 路由 Vercel maxDuration：Fluid compute 默认已宽，出现超时实测后再配。

## 验收口径

- O1：小票预览在"图片先于水合完成"场景下 `data-ready=true`（浏览器检查 + 预览循环检查回归）。
- O2：ai-chat chunk gzip 显著下降（目标 <400KB）；`check:chat` 全绿（代码块高亮不回退）。
- O3/O4：muse 网格 srcSet 生效且 `/_image` 返回尺寸化 AVIF/WebP；重复请求命中缓存（转换只发生一次）；`check:browser` 全绿。
- O5：详情页二次请求 TTFB 持平、跨路由冷请求不再重复扫描（构建产物冒烟）。
- O6：`check:browser` 批量连跑 3 次全绿。
- 全局：typecheck/lint/203 单测/format/navigation + check:http + check:chat；PR 合并后生产路由冒烟。
