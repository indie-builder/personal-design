# 技能同步 loop

## Outcome

`.agents/skills/` 的实体、`.claude/skills/` 的软链接、`skills-lock.json` 与各上游来源的最新清单三者一致；退役技能无残留。

## Trigger

- **Event（优先）**：用户要求同步/更新技能。
- **Schedule**：每月一次巡检上游是否发布新版本。
- 上游无变化时静默。

## Sources of truth

- 步骤规则：`docs/agents/navigation.md#更新技能集`（权威，本文件不重复其细节）。
- 锁文件：`skills-lock.json`（67 个技能，18 个上游来源）。
- 策略：`scripts/skills-policy.json`（`localSkills` 与 `excludedSkills`）。
- 检查入口：`pnpm check:skills`；库存列表 `pnpm check:skills --list`。

## 已知边界

- `.agents/skills/<name>/` 是实体唯一存放位置；`.claude/skills/<name>` 用相对软链接 `../../.agents/skills/<name>`。
- 明确排除且必须保持未安装：`next-dev-loop`（用户有意移除）、`ponytail*`（由用户级 plugin 取代）。
- `harness-code-check` 是自有技能，无上游锁项。
- `pnpm check:skills` 是只读离线检查，**不**验证上游新鲜度与哈希一致性——同步时仍需人工比较上游。

## 上游来源分布（供巡检优先级）

| 来源 | 技能数 |
| --- | --- |
| mattpocock/skills | 38 |
| trkbt10/indexion-skills | 9 |
| wshobson/agents | 4 |
| vercel/next.js | 2 |
| 其余 14 个来源 | 各 1 |

## One run

### 1. 盘点

1. `pnpm check:skills --list` 取当前库存。
2. 对同步范围内的每个来源，查其最新版本/提交，与 `skills-lock.json` 记录比较。
3. 列出新增、变化、退役三类。

### 2. 保护

`git status --short`；识别未提交的本地改动，避免静默覆盖。

### 3. 执行

按 `docs/agents/navigation.md#更新技能集` 的同步步骤：

1. 用 skills CLI 的 `--help` 核对安装参数。
2. 显式选择目标技能与 `claude-code codex` 两个代理。
3. 实体写入 `.agents/skills/`，Claude 用相对软链接，锁文件记录来源/路径/哈希。
4. 删除上游已移除的技能目录、代理链接、锁项与失效引用。

### 4. 验证

```sh
pnpm check:skills
pnpm check:navigation      # 技能文档引用不失效
pnpm test
```

确认：锁项 ↔ 实体 ↔ `SKILL.md` 名称 ↔ Claude 相对链接一致；退役项无残留。

### 5. 证据与收尾

记录同步范围、来源版本标识、新增/更新/退役清单。提交，message 按 CLAUDE.md 署名规则。

## Checkpoint

- 某上游发布破坏性变更（技能结构调整、命令改名）；
- 上游移除了正在使用的技能；
- 出现新的候选排除项（如被用户级 plugin 取代）。

## Failure and recovery

- 安装成功 ≠ 本会话已加载：新增技能的用户专用命令需用户直接触发，须在报告中说明。
- 锁文件哈希与实际内容不符：重新安装该项，不手改哈希。
- 软链接断开：核对相对路径深度（`.claude/skills/<name>` → `../../.agents/skills/<name>`）。

## Definition of done

- `pnpm check:skills` 通过。
- 同步范围内的技能清单与上游最新版一致（扣除明确排除项）。
- 退役项无残留（实体、链接、锁项、引用）。
- 已明确告知用户：新增技能需新会话才生效。

## 宿主与调度

- 事件驱动为主（用户要求）。
- 月度巡检可挂 Codex App heartbeat 或 Claude Code `/loop`。
- 主工作区跑（改的是仓库内的技能实体）。

## 未决

- 月度巡检的具体时点未定。
- 是否对 18 个来源全做新鲜度巡检、还是只巡 top 3（覆盖 51/67）未定。
