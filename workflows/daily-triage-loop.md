# 每日巡检 loop

## Outcome

一份可决策的项目摘要：LoopX 目标状态、待办、开着的闸门、过期信号、下一条动作。只读，不改代码、不外写。

## Trigger

- **Schedule**：每工作日早晨一次。
- 无排程能力时由用户手动触发。

## Sources of truth

- LoopX 状态：`loopx status`（读 `.loopx/registry.json`）。
- 目标态：`.codex/goals/personal-design-goal/ACTIVE_GOAL_STATE.md`。
- 注意力队列：`loopx status` 的 Attention Queue 段。

## 已知现状（首次运行时的起点）

`loopx status` 当前输出：

- goals 1、runs 20、投影 sources_fresh 5/5。
- **warning**：`personal-design-goal: active state has a state_projection_gap for agent` — 没有 open 的 Agent Todo 或 User Todo，loop 无 next action。
- Attention Queue 1 条：`personal-sites-deletion-audit-20261004` 属另一项目，本仓库不处理。
- Promotion Gate：warning（缺 promotion-readiness 证据），non-blocking。

首次运行需先修 state_projection_gap：开一条真实的 open Agent Todo 或 User Todo。

## One run

### 1. 读状态

```sh
loopx status
loopx doctor
```

### 2. 归类

1. **待办**：open 的 Agent Todo / User Todo，按 P0–P2 排序。
2. **闸门**：`can_promote=False` 的项、attention queue 条目。
3. **过期信号**：`state_projection_gap`、`stale_source_registry`、freshness=missing。
4. **下一条动作**：`loopx status` 给出的 Next Action。

### 3. 报告

写一份紧凑摘要，包含：

- 目标当前状态（active / 有无 next action）；
- open 待办（若有）；
- 开着的闸门与阻塞点；
- 过期信号及建议修复；
- **单一**下一条动作。

不写代码，不改文件，不推送。若发现应做的事，写进 todo 或报告里，由用户决定。

### 4. 修复投影（可选，仅限状态层）

若 `state_projection_gap` 持续存在，且确实有应做的下一步：

```sh
loopx todo --help          # 查看可用子命令
```

开一条真实的 open todo（不是占位），使 loop 有 next action。

## Checkpoint

- 是否要开新 todo、开哪条；
- 是否需要处理 attention queue 里跨项目的条目（默认不处理）；
- 任何涉及代码修改或外写的动作（本 loop 默认不做）。

## Failure and recovery

- `loopx status` 报错：先 `loopx doctor` 定位安装/PATH/registry 问题。
- registry 与目标态不同步：`loopx refresh-state`（按 `loopx-project` 技能）。
- 输出过长：用 `--format json` 取结构化数据自行裁剪。

## Definition of done

- 摘要已产出，含目标状态、待办、闸门、过期信号、单一下一条动作。
- 无代码修改、无外写。
- 需要用户决定的事项已明确列出。

## 宿主与调度

- Codex App heartbeat，或 Claude Code `/loop`。
- 只读，主工作区跑即可。
- 对应 LoopX preset：`daily-triage`（`report_only`）。

## 未决

- 早晨具体时刻未定。
- 摘要的落盘位置未定（终端输出？`docs/` 下某文件？）。
