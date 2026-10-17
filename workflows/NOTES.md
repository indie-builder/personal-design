# 工作流笔记

`loop-me` 技能的工作区笔记：本项目的世界、工具、渠道，以及自己的术语。术语一旦定形就写在这里。

## 这个仓库是什么

个人站点仓库，站长本人维护。`apps/web` 是唯一站点（TanStack Start + Tailwind v4）；`packages/<product>` 存放内容、类型与同步脚本。八个产品包：ai-chat、ai-coding-dictionary、design-engineer-tools、inspora、layout-compositions、personal-sites、skills-guide、word-arcade。

## 术语

| 本站说法 | 内部名字 | 说明 |
| --- | --- | --- |
| 灵感集 | `muse` / 包名 `inspora` | 对外文案、路由、metadata 不出现来源站点名 |
| 布局参考 | `layout-compositions` | |
| 内容包 | `packages/<product>` | 内容 + 类型 + 同步脚本 |

## 工具与渠道

- **LoopX**：状态与证据控制面，不是调度器。项目态在 `.loopx/registry.json` + `.codex/goals/<goal-id>/ACTIVE_GOAL_STATE.md`；共享态在 `~/.codex/loopx/`。
- **宿主点火**：Codex App heartbeat（`loopx heartbeat-prompt` 生成 RRULE 体）、Claude Code 原生 `/loop`（经 `loopx slash-commands --install` + `quota should-run` 闸）。当前机器**无** crontab、**无** LaunchAgent。
- **隔离**：`~/.codex/worktrees/<name>/personal-design`，分支 `codex/<name>`；另有 `.claude/worktrees/` 供本会话用。worktree 下 portless 给独立子域名。
- **portless**：统一 `https://personal-design.localhost`；CA 在 `$HOME/.portless/ca.pem`。
- **检查**：`scripts/design-checks/current-checks.json` 是清单（documents 9 / http 4 / browser 28 / utilities 4）。`pnpm check:navigation` 只验证登记项。
- **impeccable**：设计评审技能，产物在 `.impeccable/review/`（gitignore），配置 `.impeccable/config.json` 与 `design.json` 入库。

## 已有的循环习惯

- 依赖升级已重复 4 轮（09-25 / 09-30 / 10-04 / 10-14），证据在 `docs/design/execution/evidence/dependency-upgrade-*.json`。
- 决策台账已用 TSV 记录：`.audit/effect-adoption.tsv`、`.audit/muse-optimization.tsv`。
- 另一个项目（personal-sites）已有每日同步自动化，记忆在 `~/.codex/automations/automation/memory.md`。

## 用户偏好

- 中文回复；代码/命令/路径/报错保持原文。
- 依赖积极升稳定版；Node 保持 Vercel 支持的 24.x。
- 独立验证 PASS 后直接合并，不额外等确认；验证门本身不跳过。
- 改代码前先确认分支/远端基线；保留未提交改动。
