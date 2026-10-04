# Domain Docs

## 当前布局

采用 **single-context**：虽然仓库使用 pnpm workspace，但全部内容包服务于同一个个人设计产品门户，先使用根目录统一术语，不按包预建多套领域文档。

- `GLOSSARY.md`：领域术语与约定的含义。
- `docs/adr/`：实际作出的架构决策，使用递增编号。

这些文件按实际需要延迟创建。缺失时静默继续，不创建空模板，不据此阻塞开发。

## 阅读规则

1. 先遵循根 `AGENTS.md` 的入口要求，读取 `PRODUCT.md`；界面相关工作再读 `DESIGN.md` 和 `docs/design/README.md`。
2. 如果根 `GLOSSARY.md` 存在，读取与当前任务相关的术语；描述、命名和规格使用其中的约定。
3. 如果 `docs/adr/` 存在，读取涉及当前修改的决策。与既有 ADR 冲突时明确指出并说明取舍，不能静默覆盖。
4. 后续若明确拆分领域，可采用 `GLOSSARY-MAP.md` 指向各领域的 `GLOSSARY.md` 和 ADR 路径；在此之前不自动扩展为 multi-context。

## 内容边界

产品边界继续归 `PRODUCT.md`，视觉和交互契约继续归现有设计文档，操作规则归 `AGENTS.md`。术语表不复制页面规格，ADR不记录每次常规维护；历史验收继续归 `docs/design/execution/`。

`domain-modeling`、`grill-with-docs`、`improve-codebase-architecture` 等技能仅在任务中形成真实术语或决策时维护相关文件。用户最新明确决定优先，不把技能默认方案当成迁移现有产品的授权。
