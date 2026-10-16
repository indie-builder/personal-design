# inspora 库瘦身与头像修复 — 决策记录

PR: https://github.com/indie-builder/personal-design/pull/76 (merged `9c94c1d`)

## 结论

推送时 GitHub 报 `packages/inspora/inspora.db` 过大（58MB，逼近 100MB 硬限）。
该库 70% 的字节是 `raw_json`，其中 bestx/collectui 的 38MB **无任何读取方**。
停止写入 + 一次性清理后 **58.1MB → 13.2MB**。

## 为什么不是 zstd 压缩

先按压缩方案评估过，实测推翻了它。判据不是"单文件多大"，而是"该文件在 git 里怎么演化"。

| 方案 | 单 blob | 21 个版本的 pack 磁盘合计 |
| --- | --- | --- |
| 原始 .db（采纳） | 58MB | 8.2MB |
| zstd 快照 | 5.3MB | **107.5MB** |
| 精简库（采纳） | **13MB** | **3.8MB** |

git 对原始 SQLite 页能 delta（正常版本 ~8KB），对已压缩流不能（每版固定 5.3MB）。
压缩只解决单文件报警，却让仓库三个月后涨到 300MB+。故提交未压缩的 .db。

## 删除的安全性依据

三个 `raw_json` 读取点全部限定 `source='inspora'`，已逐个核对：

| 读取点 | 用途 | bestx/collectui 实际 |
| --- | --- | --- |
| `src/index.ts:90` | `videoPreview` | 0/7972 行有该字段 |
| `scripts/db.ts:233` | 头像回填 | SQL 已带 `source='inspora'` |
| `scripts/source-inspora.ts:520` | `variants` | 仅 inspora 路径 |

## 验证证据

- **行为等价**：真实库上 `listPostCards` + `listPostRefs` + `listPostPreviews` + 5 个详情页，
  输出 **10,177,415 字节逐字节一致**
- **写入路径**：`upsertPost` 省略 `raw` 参数确实落 NULL；inspora 的 `raw_json` 仍可写
- **真实 HTTP**：首页 / Muse 网格 / 详情页均 200，含真实作者、海报与热链媒体
- `pnpm test` 204/204、`typecheck`、`lint`、`format:check` 全绿
- 构建产物 DB：58MB → 13MB

## 顺带修复：热链头像被 base 前缀污染

`toPost` 把 bestx/collectui 的 https 头像直链传进 `mediaUrl` 的 `localPath` 参数位，
而该参数契约是站内路径（函数内做 `path.join(PUBLIC_DIR, localPath)`）。
`MEDIA_BASE` 非空时拼出 `https://media.example.comhttps://cdn...`，影响 12829 行。

守卫加在共享 helper 上而非调用点：这是契约违反，不是单点错误。
失败用例先提交（`13260f7`），修复后提交（`b5209a4`）。
真实库 794 个 `local_*` 值 100% 以 `/` 开头，守卫无回归。

## 副作用

`listPostCards` 的 `SELECT *` 原先每请求取回整个 `raw_json` 列（16.41MB），
删除后降到 0.19MB。根因是列没写全，非数据本身。

## 不做：历史清理（force-push 全分支）

评估过 `git filter-repo` 抹掉历史中的 DB blob，**决定不做**。

- 旧 DB blob 被 **50 个远端分支**引用；只 force-push main **回收 0 字节**
  （服务端不 gc 仍可达的对象）
- 真回收需重写并 force-push **全部 49 个远端分支**，其中 **36 个未合并**
- 仓库为 **PUBLIC**，重写会作废所有克隆与 fork
- 收益 **22.5MB / 284MB pack（8%）**；其余大头是有意提交的资产
  （video-shotcraft 44MB、identity-skill 24MB、public 46MB）

收益 8%，代价是公开仓库全分支重写，不划算。

## 未修（已记录，非本次范围）

`listPostPreviews(limit)` 末尾 `unshift` 视频预览，实际返回 `limit+1` 条。
消费方 `home-view.tsx:200` 的 `slice(0,3)` 兜住，无活 bug，仅参数名过度承诺。
