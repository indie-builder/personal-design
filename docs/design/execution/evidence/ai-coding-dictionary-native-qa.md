# AI Coding 词典原生图谱验收 · 2026-09-26

## 可重复环境

在本分支运行 `pnpm build && pnpm start`，以生产构建访问 `/products/ai-coding-dictionary`。项目现有浏览器回归在 `DESIGN_BASE_URL=http://localhost:3203 node scripts/design-checks/run-all.mjs` 下 **11/11 套通过**；其中路由核对为 358 条。原生词典的专项交互通过 ego-browser 在同一生产构建上检查。

## 专项结果

| 操作 | 已核对结果 |
| --- | --- |
| 直达 `?term=agent` | 页面有 `canvas[data-graph-ready]`、Agent 中英双语阅读面；iframe 数量为 0 |
| 从 Agent 点击关联的 Model，再浏览器后退 | URL 和标题依次变为 Model、Agent |
| 搜索“缓存”并选择 Prefix cache | 结果可见，选中后 URL 同时保留 `term` 与 `q` |
| 从 Prefix cache 跳到搜索结果之外的 Model provider | 目标打开，`q` 自动清除 |
| 关闭词条 | `term` 清除、阅读面退场，焦点返回搜索入口 |
| 首页退出后再次进入第五项 | 旧搜索与选中不保留；首页预览有 Canvas 节点和连线 |
| 390px 深色 Session 直达 | 选中节点在底部阅读面上方可见；页面无横向溢出；iframe 数量为 0 |

## 视觉记录

- [1500px 浅色 Agent 与双语阅读面](dictionary-native-agent-light.png)
- [首页第五项动态图谱缩略预览](dictionary-native-home-preview.png)
- [390px 深色 Session 与底部阅读面](dictionary-native-session-mobile-dark.png)

复核步骤：打开上述直达链接并按表中顺序操作；首页预览需把第五项滚入视口。截图只证明当时视口的视觉状态，交互结果由 URL、DOM 状态与焦点检查确认。
