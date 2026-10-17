# 文档漂移 loop

## Outcome

文档里引用的路径、脚本、导出函数与检查清单在代码变动后仍真实存在；契约文档与实现不脱节。

## Trigger

- **Event（优先）**：改动触及 `scripts/`、`docs/agents/`、`docs/design/` 或 `package.json` scripts。
- **Schedule**：每周一次。
- 无相关改动时静默。

## Sources of truth

- 检查实现：`scripts/check-navigation.mjs`。
- 检查清单：`scripts/design-checks/current-checks.json`。
- 导航文档：`docs/agents/navigation.md`。

## 检查实际覆盖什么

`pnpm check:navigation` 读取 `current-checks.json`，验证其中登记的条目：

| 数组 | 当前数量 | 验证内容 |
| --- | --- | --- |
| `documents` | 9 | Markdown 文件存在、路径在仓库内 |
| `http` | 4 | 检查脚本存在、有对应 export |
| `browser` | 28 | 同上 |
| `utilities` | 4 | 同上 |

同时校验文档内的仓库相对链接目标存在、不越出仓库。**它只验证登记过的条目**——新增文档或脚本若未登记，检查不会发现。

## One run

### 1. 跑检查

```sh
pnpm check:navigation
pnpm test:navigation      # 检查自身的失败分支测试
```

### 2. 补未登记项

1. 对比实际目录与清单：

```sh
ls scripts/design-checks/*.mjs
ls docs/agents/*.md docs/design/*.md
```

2. 找出未登记但应当登记的条目，补进 `current-checks.json` 对应数组。
3. 找出已删除但仍登记的条目，移除。

### 3. 检查契约文档

对照 `docs/design/README.md`（页面契约）与 `docs/design/execution/README.md`（验收入口）：

1. 文档描述的命令是否仍在 `package.json` scripts 里。
2. 文档引用的文件路径是否存在。
3. 文档描述的页面行为是否与当前实现一致（抽样，不追求全覆盖）。

### 4. 修

- 路径/命令失效 → 更新文档。
- 契约与实现不一致 → **先判断哪边对**。实现是事实，文档是意图；不一致可能意味着实现有 bug，不能默认改文档迁就实现。
- 发现的实现 bug → 单独记录，不在本 loop 顺手修（避免混淆改动范围）。

### 5. 收尾

提交，message 按 CLAUDE.md 署名规则。

## Checkpoint

- 契约与实现不一致，需要判断哪边是权威；
- 需要删除或大幅重写文档章节；
- 发现实现 bug（需决定是否本轮修）。

## Failure and recovery

- `check:navigation` 报路径逃逸：检查是否用了绝对路径或 `..`。
- 新增脚本未在清单登记：这是最常见漏项，按第 2 步补。
- 文档链接指向已移动的文件：用 `git log --follow` 追历史确认新位置。

## Definition of done

- `pnpm check:navigation` 通过。
- `current-checks.json` 与实体目录一致（无幽灵项、无遗漏项）。
- 契约文档描述的命令与路径全部有效。
- 发现的不一致已修正或已明确记录。

## 宿主与调度

- 每周一次，推荐 Codex App heartbeat 或 Claude Code `/loop`。
- 主工作区跑（改文档与清单）。

## 未决

- 「抽样检查契约文档」的抽样规则未定。
- 是否把 `check:navigation` 的覆盖范围扩到自动扫描目录（现在只认登记项）未定——这会改变检查语义，需用户决定。
