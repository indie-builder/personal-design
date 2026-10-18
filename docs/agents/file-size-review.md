# Agent 文件阅读成本审查

日期：2026-10-18。基线：`3c977be`；范围为当前仓库维护文本，按 bytes / 4 估算 tokens。超过 20,000 bytes 即超限。沿用 `.gitattributes` 的生成／外部来源豁免，跳过符号链接及前 8,000 bytes 含 NUL 的二进制文件。

## 审查发现与处理

原扫描共 12 个超限文件。问题集中在现行规则与历史记录混放、验收场景与浏览器探针混放，以及可维护数据与消费格式没有分离。拆分保持原外部 interface，内部 seam 按职责建立，不按行数或编号切片。

| 原文件 | 原 bytes | 处理 |
| --- | ---: | --- |
| `apps/web/lib/openui-system-prompt.json` | 140,959 | 确认为构建脚本生成，精确豁免；修改入口仍是 `apps/web/scripts/generate-openui-prompt.mjs` |
| `docs/research/wren-chatbi-integration-source-review.md` | 48,824 | 保留结论／版本／模块索引；SDK 与技能、API 与部署证据、接入计划分别成册 |
| `DESIGN.md` | 43,925 | 保留 token 快照、权威关系与共享基线；视觉基础、聊天、阅读面、动效各有专题 |
| `.impeccable/design.json` | 39,660 | 将配置、叙述规则与单个示例拆为维护源，生成固定路径快照并检查漂移 |
| `.agents/design-log.md` | 37,837 | 保留轮次索引；完整历史按首页导航、灯箱阅读、收官阶段归档 |
| `scripts/design-checks/route-motion.browser.mjs` | 30,147 | 保留场景编排，将浏览器内探针与设置收拢到 `route-motion-probes.mjs` |
| `scripts/design-checks/preview-loops.browser.mjs` | 27,540 | 保留预览状态场景，将采样探针收拢到 `preview-loops-probes.mjs` |
| `docs/design/execution/ai-chat.md` | 27,176 | 运行入口保留；渲染规则与历史验证分别成册 |
| `packages/personal-sites/promo/references/SceneOpen.tsx` | 24,458 | 确认为原样导入的上游参考，精确豁免 |
| `docs/design/README.md` | 22,790 | 保留产品契约入口；将完整聊天契约放入 `products/ai-chat.md` |
| `packages/inspora/scripts/source-inspora.ts` | 22,538 | 公开入口与媒体阶段保留；浏览器同步生命周期移入 `inspora-browser.ts` |
| `scripts/design-checks/timeline-motion.browser.mjs` | 20,385 | 保留时间轴场景编排，将浏览器内观测收拢到 `timeline-motion-probes.mjs` |

独立审查结果：采集器行为、浏览器探针等价性、文档职责与完整性、设计快照 source interface 均未发现剩余阻塞问题。需求审查未发现缺项或范围蔓延。代码审查不替代下方实际验证。

## 其他审查发现

`apps/web/scripts/generate-openui-prompt.mjs` 的 `libraryVersion` 仍写死为 `0.16.3`，当前安装的 `@openuidev/react-ui` 为 `0.18.1`。生成正文来自当前安装包，已核对与现有 JSON 一致；标签未被运行时使用。本轮保持生成内容不变，此元数据漂移待后续依赖维护时处理。

## 临近上限的维护点

以下文件未超限，本轮未扩大修改范围；下次向对应职责追加内容前，应先考虑其内部 seam：`apps/web/components/ai-chat.module.css` 为 19,709 bytes，`scripts/design-checks/lightbox-motion.browser.mjs` 为 19,563 bytes，`.audit/effect-adoption.tsv` 为 19,104 bytes。历史审计轨迹应按完整阶段归档，不能删行腾空间。

## 维护与阅读入口

- [任务导航](navigation.md)：先定位任务，再读对应专题和实现；无需一次载入全部分册。
- [设计标准](../../DESIGN.md)：保留原标题锚点，链接到权威专题。
- [聊天执行入口](../design/execution/ai-chat.md)：现行运行链路、实现与验收；历史单独按需读取。
- [设计面板维护源](../../.impeccable/design/README.md)：只维护小文件；`pnpm generate:design` 合成，`pnpm check:design` 查漂移。
- 浏览器验收继续使用原 `verifyRouteMotion`、`verifyPreviewLoops`、`verifyTimelineMotion` interface；内部探针只由各自场景使用。
- 灵感同步继续使用 `syncInspora`；浏览器资源、分页写入、错误和清理集中在一个内部 module。

## 验证依据

- 重扫所有已跟踪及未忽略的新文件：非豁免超限文本为 0。
- 文档原有 1,020 行非空内容遗漏 0；252 条本地链接有效；五份旧入口的原锚点全部保留。DESIGN token front matter 与 fenced 示例完整保留。
- 设计面板生成结果与原 `.impeccable/design.json` 逐字节一致；缺失／陈旧输出及无效维护源有回归检查。现行分册已纳入导航检查。
- 灵感采集器使用已有模拟与内存数据库测试，未执行真实上游同步，未修改内容数据库。
- 三个浏览器验收 module 的 138 个模板字符串逐字保留；展开内部 module 后与重构前格式化实现等价，断言、场景顺序与清理保留。
- `pnpm test`：215 项通过；`pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm check:navigation`、`pnpm check:skills`、`pnpm check:design` 全部通过。
- 本轮全部改动在临时 Git index 执行真实 `check-staged-tokens.mjs` 通过，真实暂存区未改动。

复现静态验收：

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:navigation
pnpm check:skills
pnpm check:design
```

生产构建通过；本轮用根目录 `pnpm start` 与临时 Portless HTTPS 代理提供 `https://personal-design.localhost:1355`，重构后 `pnpm check:browser` 的 19 套 HTTP／浏览器回归全部通过。一次中间运行因操作时误停代理导致最后三项连接失败；恢复代理后完整重跑通过，未修改断言。生产页面在 ego-browser 打开，首页语义快照正常。

复现命令（代理端口按实际环境替换；默认代理已运行时无需启动临时代理）：

```sh
pnpm build
portless proxy start --port 1355 --https
PORTLESS_PORT=1355 pnpm start
# 另一终端：
DESIGN_BASE_URL=https://personal-design.localhost:1355 \
NODE_EXTRA_CA_CERTS="$HOME/.portless/ca.pem" pnpm check:browser
```

设置实际 `DESIGN_BASE_URL` 及 Node 本地 CA，不能将不带浏览器的模块导入视为交互通过。既有验收的真机／逐帧视觉与真实外部模型覆盖限制继续有效。

文件上限控制单次阅读负担，不证明运行性能或 Agent 延迟得到量化提升。本轮保持外部行为，未引入通用 module 框架，也未把维护源码标为生成内容以绕过限制。
