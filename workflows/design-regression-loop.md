# 设计回归 loop

## Outcome

已交付的页面行为、状态与视觉在每次改动后仍与页面契约一致，回归失败在合并前被抓到，而不是在生产上。

## Trigger

- **Event（优先）**：改动触及 `apps/web/src`、`apps/web/components`、`apps/web/lib` 或 `DESIGN.md` 相关章节。
- **Schedule**：每日一次全量，或每个合并到 main 的 PR 之后。
- 无改动时静默。

## Sources of truth

- 页面契约：`docs/design/README.md`。
- 设计标准：`DESIGN.md`（视觉数值与获准例外的权威）。
- 验收索引：`docs/design/execution/README.md`。
- 检查清单：`scripts/design-checks/current-checks.json`（documents 9 / http 4 / browser 28 / utilities 4）。
- 前端规则：`apps/web/AGENTS.md`。

## One run

### 1. 起生产预览

```sh
pnpm build
pnpm start          # 另一终端；portless 提供 https://personal-design.localhost
```

worktree 下 URL 不同，取启动日志里的独立子域名。

### 2. 跑检查

```sh
export DESIGN_BASE_URL=https://personal-design.localhost
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"

pnpm check:http              # 预渲染路由 + portfolio API，不启浏览器
pnpm check:browser           # 浏览器子集
pnpm check:chat              # 隔离假模型环境，自动启停
```

缺 Chromium 时先 `pnpm exec playwright install chromium`。

### 3. 判定

按 `apps/web/AGENTS.md` 的要求**分别报告**行为、状态、视觉结果；站内返回与浏览器原生后退分别记录。缺少视觉证据不得声称全部通过。

重点覆盖：1280 / 1440px 桌面、双主题、键盘、减少动态效果。小屏保证内容不被裁切。

### 4. 修或记录

- 失败且属本轮改动引入 → 修，重跑受影响检查。
- 失败但属既有问题 → 记录，不静默修（可能掩盖别人的工作）；按需开 issue 或 todo。
- 检查脚本本身过期（选择器/断言不符合现行契约）→ 适配脚本并记录，不能以历史通过推定当前通过。

### 5. 证据

结果写入 `docs/design/execution/evidence/` 对应文件（`routes.json`、`journeys.json` 等）。视觉证据存 `.impeccable/review/`（已 gitignore）。

## Checkpoint

- 视觉差异需要设计判断（是回归还是有意变更）；
- 检查失败但无法复现（疑似 flaky）；
- 契约本身需要更新。

## Failure and recovery

- `check:browser` 偶发：历史记录 `shared-autoplay` 批量连跑约 1/6 抖动。单跑确认稳定，不直接重跑掩盖。
- portless 起不来：核对 `DESIGN_BASE_URL` 与实际启动日志 URL，CA 路径 `$HOME/.portless/ca.pem`。
- 检查超时：先看是应用慢还是检查慢，分别处理。

## Definition of done

- 目标范围内的 HTTP / 浏览器 / 聊天检查全部通过，或失败项已明确记录并归因。
- 行为、状态、视觉结果分别报告。
- 无「以历史通过推定当前通过」。

## 宿主与调度

- 与 CI 的 chat 验收互补：CI 跑 `check:chat`，本 loop 补 `check:http` + `check:browser` 的本地全量。
- 排程：Codex App heartbeat 或 Claude Code `/loop`。
- 主工作区或 worktree 均可；worktree 需改 `DESIGN_BASE_URL`。

## 未决

- 每日具体时刻未定。
- 是否需要引入 Lighthouse / 性能预算作为额外门禁未定（见 perf-budget loop）。
