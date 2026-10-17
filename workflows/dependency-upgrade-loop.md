# 依赖升级 loop

## Outcome

持续把 workspace 依赖推进到最新稳定版，每一轮都留下可复现的验证证据，且不把工具链、运行时和主版本跳跃混进同一批。

## Trigger

- **Schedule**：每周一次（当前机器无 cron/LaunchAgent，见「宿主」）。
- **Event（优先）**：`pnpm outdated` 出现新的 patch/minor，或上游发布安全公告。
- 两轮之间若 `git status --short` 有未提交改动，先分类再决定是否并入本轮。

事件触发比排程更省：只在真有候选时唤醒。

## Sources of truth

- 本轮规则由本文件定义。
- `package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml` 是当前事实。
- 历史轮次证据：`docs/design/execution/evidence/dependency-upgrade-*.json`、`.impeccable/review/dep-upgrades-*/`。
- 目标态：`.codex/goals/personal-design-goal/ACTIVE_GOAL_STATE.md`（LoopX 目标状态）。
- 用户长期偏好：积极升稳定版；Node 保持 Vercel 支持的 24.x；轻量本地验证优先。

## Policy

1. **默认只升 patch 与 minor。** major、运行时（Node/pnpm engines）、`packageManager` 字段、跨 lockfile 重写需要显式授权。
2. **denylist**：`@types/node` 不跟到 26.x（须匹配 `engines.node: 24.x`）；`minimumReleaseAgeExclude` 中的项按 `pnpm-workspace.yaml` 现有清单处理，不擅自扩大。
3. 同一主版本内的多项升级可以合成一批；跨主版本每项单独一轮。
4. 工具链版本（oxfmt / oxlint / playwright / pnpm `packageManager`）单独成轮，不与业务依赖混。
5. 上游有 breaking change 时先读 changelog，再决定是否在本轮执行。

## One run

### 1. 基线

1. 记录 `git status --short --branch` 与 `git log -1 --oneline`；有远端时 `git fetch origin` 并比较 `git rev-list --left-right --count HEAD...origin/main`。
2. 保留无关脏改动，不 reset、不覆盖、不 stage。
3. 在隔离 worktree 工作（见「宿主」），分支 `codex/dep-upgrade-<yyyymmdd>`。

### 2. 候选

1. `pnpm outdated` 取候选列表。
2. 按 Policy 分类：patch / minor / 工具链 / 需授权。
3. 只取一类，列出包名、当前版本、目标版本、所属 `package.json`。

### 3. 升级

1. 编辑目标 `package.json`，版本前缀遵循现有约定（多为 `^`，锁定的按现状保持精确）。
2. `pnpm install`。
3. 若 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 因新版本需要更新，一并改。

### 4. 验证（全部通过才算这一轮结束）

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm check:navigation
pnpm build
```

全部从仓库根目录执行。任一失败：先判断是否由本次升级引起，是则在本轮修；否则保留失败输出，不动无关文件，记录后缩小本轮范围。

涉及 UI 或运行时的升级，另跑一次生产预览下的浏览器子集：

```sh
export DESIGN_BASE_URL=https://personal-design.localhost   # worktree 用启动日志里的独立子域名
export NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem"
pnpm build && pnpm start   # 另一个终端
pnpm check:browser
```

### 5. 证据与收尾

1. 写 `docs/design/execution/evidence/dependency-upgrade-<yyyymmdd>.json`：包名、旧版本、新版本、每项检查结果。
2. 提交，message 按 CLAUDE.md 署名规则。
3. 独立验证 PASS 后直接开 PR 合并，不额外等确认（验证门本身不跳过）。
4. 若 Vercel 构建或 CI 失败，回到本轮修，不新开一轮。

## Checkpoint

推到最右。只在下列情况暂停问用户：

- 出现 major 升级或运行时变更；
- 某项升级需要改业务代码而非版本号；
- 同一批连续失败两次；
- 命中 denylist 但看起来必须升。

Brief 内容：候选包、目标版本、失败点、建议决定、备选方案、证据路径。

## Failure and recovery

- 升级后 typecheck 失败：先读报错，判断是类型不兼容还是 API 变更；API 变更则按 Policy 判定是否本轮处理。
- `pnpm install` 冲突：检查 `pnpm-workspace.yaml` 的 overrides，必要时补 override 而非降级。
- CI 通过但本地失败（或反之）：以本地为准继续排查，不假设环境差异。

## Definition of done

一轮完成需同时满足：

- 选定批次的每个包都已升到目标版本，`pnpm-lock.yaml` 已更新。
- 第 4 步全部检查通过，结果写入证据文件。
- PR 已合并，或明确记录未合并原因。
- 没有把未验证的版本推进 main。

整个 loop 没有终点：上游持续发布，下一轮由 Trigger 再次唤醒。

## 宿主与调度

- **推荐**：Claude Code 原生 `/loop`，经 `loopx slash-commands --install --surface claude-code` 安装，每 tick 过 `loopx quota should-run` 闸。
- **备选**：Codex App heartbeat，用 `loopx heartbeat-prompt --thin --goal-id personal-design-goal --agent-id <agent-id> --agent-scope project --runtime-profile codex_app_heartbeat` 生成自动化体。
- **隔离**：在 `~/.codex/worktrees/dep-upgrade/personal-design`（分支 `codex/dep-upgrade`）跑，或 `git worktree add`。worktree 下 portless 给独立子域名，从启动日志取。
- 纯 shell 定时（cron/launchd）当前**不可用**：`loopx host-mode-plan --intent timer_keepalive --host-capability service_timer` 报缺 `shell`、`loopx_turn`、`typed_host_adapter`、`independent_validator` 四项 capability。补齐后才可用。

## 未决

- 每周具体触发时点（周一/周五）未定。
- 是否给 `dependency-sweeper` preset 的 denylist 补项目专属条目未定。
