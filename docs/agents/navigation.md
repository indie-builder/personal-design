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

所有上游来源的技能均以该来源最新技能清单和内容为准。用户要求“同步／更新技能”时，默认执行清单对齐，包含新增、更新和退役清理；用户指定来源时仅处理该来源，未指定时处理 [skills-lock.json](../../skills-lock.json) 中已登记的全部上游来源。用户明确排除的技能（包括 `next-dev-loop`）保持未安装。

### 存放与链接

- `.agents/skills/<name>/` 是技能实体文件的唯一存放位置，包含 `SKILL.md` 及配套脚本、引用和资源；Codex 直接读取此目录。
- `.claude/skills/<name>` 使用相对符号链接 `../../.agents/skills/<name>`，复用同一份技能；不保存独立副本。
- 项目适配规则写入项目指引或 `docs/agents/`，通过入口引用；上游技能正文随上游同步。

### 同步步骤

1. 核对同步范围内各来源的最新上游版本，记录提交或版本标识；将全部技能清单与锁文件、实体目录比较，列出新增、变化和退役项。修改前识别未提交的本地改动，避免静默覆盖。
2. 补齐新增技能、更新现有技能及配套文件，并删除上游已移除的技能目录、代理链接、锁文件条目和失效引用；同一技能内上游已删除的文件也要清理。范围外来源和无上游来源的自有技能保持原样。
3. 用 skills CLI 的 `--help` 核对安装参数，显式选择目标技能和 `claude-code codex` 两个代理；确保实体写入 `.agents/skills/`，Claude 使用相对软链接，锁文件记录正确来源、路径和内容哈希。
4. 验证同步范围内的技能清单与最新上游一致（扣除明确排除项）、全部配套文件内容一致、退役项无残留、锁文件正确、Claude 链接可解析且指向对应实体目录。

安装成功不等于本会话已加载；新增技能的用户专用命令仍需用户直接触发。
