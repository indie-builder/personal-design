# 工作基线与导航

## 修改前确认基线

先记录 `git status --short --branch` 与 `git log -1 --oneline`；有远端时执行 `git fetch origin`，比较 `git rev-list --left-right --count HEAD...origin/main`（目标分支不同时替换）。再检查关联 PR 是否已合并。没有网络时明确注明远端基线未经确认。

落后或存在并行修改时，先区分已有成果与本轮工作，再选择整合方式。保留用户未提交改动；不自动 reset、覆盖或丢弃。开始修改前明确当前提交、目标分支及本轮范围；提交前再确认一次目标分支，避免把已交付的修复重新实现。

## 按任务定位

页面行为及实现入口见[页面契约](../design/README.md)，当前检查见[验收入口](../design/execution/README.md)。先读任务对应章节，再顺着实现导入定位依赖；符号名称不保证等于文件名。

| 任务 | 起点 |
| --- | --- |
| 首页注册、卡片、预览 | [products.ts](../../apps/web/lib/products.ts)、[home-view.tsx](../../apps/web/components/home-view.tsx)、[home-previews.tsx](../../apps/web/components/home-previews.tsx) |
| 灵感集路由与数据包映射 | [muse/page.tsx](../../apps/web/app/products/muse/page.tsx)、[muse-catalog.ts](../../apps/web/lib/muse-catalog.ts)、[inspora 指引](../../packages/inspora/AGENTS.md)；对外名称“灵感集”、路由 `muse`、内部包 `inspora` |
| 聊天存储、流式更新、后端 | [use-saved-chat.ts](../../apps/web/components/ai-chat/use-saved-chat.ts) → [chat-persistence.ts](../../apps/web/lib/chat-persistence.ts)；[use-pi-chat.ts](../../apps/web/lib/use-pi-chat.ts) → [chat-stream.ts](../../apps/web/lib/chat-stream.ts)；[API 路由](../../apps/web/app/api/ai-chat/route.ts) → [pi-chat.ts](../../apps/web/lib/pi-chat.ts) |
| 词典阅读面与运行资源 | [bridge.js](../../packages/ai-coding-dictionary/runtime/bridge.js)、[detail.css](../../packages/ai-coding-dictionary/runtime/detail.css)、[dictionary-map.tsx](../../apps/web/components/dictionary-map.tsx)；上游同步工具已退役，更新边界见 [PRODUCT.md](../../PRODUCT.md) |

## 控制搜索范围

先用 `rg --files <任务目录>` 确认路径，再搜符号。默认从 `apps/web/app`、`apps/web/components`、`apps/web/lib` 或对应包的 `src` 搜起。只有分析打包运行资源、生成内容或旧证据时，才进入 `apps/web/public/ai-coding-atlas`、生成 JSON、`docs/design/execution/evidence`；来源快照继续遵循根指引。

Next 文档从 `apps/web/node_modules/next/dist/docs` 枚举实际文件名，再读取匹配章节；依赖升级后章节编号和后缀可能变化。规范和代码分开读取、按标题或行段收窄；遇到截断先缩小范围，不重复输出同一大批内容。

## 更新技能集

“更新已安装项”和“与上游技能清单对齐”是两个操作。用户要求完整更新时，先对比上游全部 `SKILL.md` 与 [skills-lock.json](../../skills-lock.json) 的同来源条目，列出新增、变化和退役项。保留其他来源、本地修改和明确移除的技能。

本项目使用 `.agents/skills/<name>` 保存技能，`.claude/skills/<name>` 是相对符号链接；Codex 直接使用前者。用 skills CLI 的 `--help` 核对当前安装参数，显式选择差集与 `claude-code codex` 两个代理，不用不加区分的全来源更新。

完成条件：已安装目录与选定上游版本一致、预期新增项无遗漏、锁文件来源正确、Claude 链接可解析。新增技能的用户专用命令需要用户直接触发；安装成功不等于本会话已加载。`next-dev-loop` 保持移除。
