# AI Coding 词典 · 浏览器验收

2026-09-26 起，词典图谱直接由本站 Next 组件渲染。旧版从参考站捕获 JS/CSS、放进 iframe 的 [CDP JSON](evidence/ai-coding-dictionary-cdp.json) 只保留为历史迁移证据，不再是现行实现的验收结果。

本轮原生组件的实际检查与截图见 [验收记录](evidence/ai-coding-dictionary-native-qa.md)。

## 当前实现

- `packages/ai-coding-dictionary/catalog.json`：从上游按 Git blob SHA 增量同步的中英双语内容。
- `packages/ai-coding-dictionary/graph-layout.json`：参考图谱的节点坐标与连线控制点；新增词条在所属章节稳定补位。
- `apps/web/components/dictionary-map.tsx`：搜索、URL 历史、选中与详情状态。
- `apps/web/components/dictionary-graph.tsx`：Canvas 图谱和径向避让；首页只在可见且允许动态效果时复用预览。
- `apps/web/components/dictionary-detail.tsx`：章节分组的双语阅读面。

## 可重复检查

1. 运行 `pnpm build && pnpm start`，在浏览器打开 `/products/ai-coding-dictionary?term=agent`，确认页面中有 `canvas[data-graph-ready]` 和 Agent 的中英正文，没有 iframe。
2. 点击 Model 节点，确认 URL 的 `term=model`、右侧标题与选中标记同步；浏览器后退恢复 Agent。关闭或按 Esc，确认选中清除并返回搜索入口焦点。
3. 展开右下搜索，输入中文或英文关键词，选择结果；通过章节目录跳到关联词条，检查目标不在当前搜索结果时清除 `q`。
4. 从首页进入词典、返回首页再进入，确认不会保留上次搜索、选中或镜头状态。首页预览有节点和连线，离屏时停止动画。
5. 检查浅色、深色、减少动态效果、键盘操作，以及 1280px 桌面和 390px 小屏。用截图记录实际视觉结果；构建成功不能代替视觉验收。

这套检查应在任务结束时运行并留下可复核的部署链接或截图；不要把历史 JSON 结果当作当前原生图谱的结论。
