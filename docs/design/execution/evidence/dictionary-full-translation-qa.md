# AI Coding 词典 · 完整翻译与轻量关联区验收

## 可重复检查

在本分支运行 `pnpm sync:ai-coding-dictionary`、`pnpm build`，再以 `pnpm --filter @personal-design/web exec next start -p 3203` 启动生产构建。翻译命令在 `scripts/translate-claude.mjs` 中固定为本机默认 `claude -p`，不覆盖用户模型或认证配置。

在上述生产服务上运行 `DESIGN_BASE_URL=http://localhost:3203 node scripts/design-checks/run-all.mjs`，全部 11 组回归检查通过。

目录检查：71 条词条，英文正文 528 段与中文全文 528 段逐段对应；18 张表格的行数及各行列数一致，71 条原有中文概述保存在独立 `summary.zh` 字段。英文正文约 120,089 字符，中文全文约 58,443 字符。未发现空段、英文长段无中文或译文长度异常过短。

## 浏览器结果

| 路径与操作 | 实际结果 |
| --- | --- |
| `?term=context-window` | 7 对完整中英正文；关联术语默认关闭，仅高 49px，保留 12 个原生链接 |
| 展开关联术语 | 6 个章节、12 个链接；展开区高约 464px，先前始终展开的目录高约 613px |
| 点击“关联术语”内容定位，再进入 Context window | 折叠区展开、词条和 URL 同步；浏览器后退恢复原词条 |
| `?term=context`，390×844 深色视口 | 8 对中英正文、2 张语义 table；关联区默认关闭，无横向溢出 |

## 视觉记录

- [1500px 浅色 Context window：完整中英对照](dictionary-full-context-desktop.webp)
- [关联术语展开后的紧凑章节链接](dictionary-full-related-expanded.webp)
- [390px 深色 Context：底部阅读面](dictionary-full-context-mobile.webp)

这些截图记录最终画面，交互结论来自同一生产构建的 URL、DOM 与滚动状态检查。正式预览部署通过后应补记部署链接。
