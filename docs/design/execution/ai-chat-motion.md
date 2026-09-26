# AI 问答动效

范围仅为第六个作品及其共享标题回退入口。沿用项目 CSS / Web Animations API / `instantMotion`、`observeMotionPolicy`、`playExit`，未增加动画依赖。设计依据为 Emil Design Engineering、Impeccable Animate 与 fixing-motion-performance。

## 交互与参数

| 表面 | 进入 | 退出／完成 | 目的 |
| --- | --- | --- | --- |
| 智能体下拉 | 180ms，从标题下方向下6px、.98缩放到正常 | 140ms，同方向收回 | 保持触发点关系 |
| 导航抽屉 | 220ms，面板在固定裁切区内从左进入 | 180ms向左收回，内容保留至原生层退出完成 | 不越出手机框；遮罩同步淡变 |
| 创建页 | 240ms从右进入 | 180ms从当前位移退向右侧，完成后才切换面板或保存新智能体 | 前进／返回方向一致，快速反向不跳帧 |
| 新消息 | 180ms小幅上移／淡入 | 无逐字或逐块重播 | 仅新消息确认到达；恢复的历史不播放 |
| 发送／停止 | 图标140ms轻显现 | 原生按钮按下反馈 | 确认状态切换 |
| 生成中 | 3个4px点做900ms透明度提示 | 结束或停止后移除；后台、减少动效或键盘路径为静态点 | 表达真实等待状态 |

只有 transform / opacity 做连续空间动效；display / overlay 是原生层进退的离散切换。导航面板在静止的 `overflow:hidden` 容器内运动，不把浏览器级 top-layer 面板滑到手机框外。创建页仍是框内 absolute section，底层聊天保持挂载但 inert、对辅助技术隐藏。进入时聚焦使用 preventScroll，外框使用 overflow:clip（旧浏览器回退 hidden），让输入焦点也不能滚动外框；消息与表单内部滚动保留。

参考：[MDN 原生 dialog 动效](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#animating_dialogs)、[MDN Popover 动效](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using#animating_popovers)。不支持离散过渡的浏览器即时关闭，内容与操作仍可用。

## 中断与退化

- 键盘与 `prefers-reduced-motion` 不等待空间动效；中途切换会完成正在退出的创建页并恢复正确面板。
- 创建退出复用 `playExit` 的超时兜底，原DOM保留到提交；重复提交只提交一次，卸载时取消旧动作，保留的页面重新显示时清理 inert / exiting 状态。
- 进入和快速返回之间只读取一次当前 transform，再取消旧入口并接上出口；不做逐帧布局测量。
- 页面进入后台后暂停等待动效；原生返回／前进和首页返回检查不会留下 modal 或 inert 残留。
- 颜色、边界等既有控件反馈保留；动效不改变当前的小字号、头像、生成逻辑和手机优先布局。

## 标题与问题入口

共享页头的「← AI 问答」位于手机展示框外，与其他作品对齐，点击返回作品时间轴；复用其他作品的 WorkspaceLink 标题衔接。问答页不显示主题切换控件，其他页面不变。

问题入口统一为点按：自然语言问题加一句结果说明，位于欢迎区，移除 Alt 快捷键、键帽和向上箭头。输入区仍位于底部。

## 可复现验收

按 `ai-chat.md` 启动生产构建与独立本地 provider，再运行：

```sh
DESIGN_BASE_URL=http://localhost:3107 sh scripts/design-checks/ai-chat-motion.sh
DESIGN_BASE_URL=http://localhost:3107 sh scripts/design-checks/ai-chat.sh
```

动效专项记录实际 CSS / WAAPI 时间线，暂停并采集运动帧；使用 Page.captureScreenshot 原始CDP捕获，避免高层截图稳定化改变动画状态。产物位于 `evidence/ai-chat-motion/`。普通回归在减少动态效果下检查终态，不能单独证明动效存在。

证据分开记录：行为由动画及原生层记录证明；状态由返回、重复提交、键盘、偏好切换与模拟后台断言证明；视觉由进入／退出帧证明。没有真机帧率或系统软键盘测量，不声称所有平台均达到60fps。模型响应来自独立测试夹具，不作为真实智谱输出质量证明。

## 本轮结果

- 生产构建、类型检查、改动文件 oxlint、24项已有单元检查通过。
- [动效专项](evidence/ai-chat-motion/result.json) 10项通过，含桌面／手机成对进退、实际位置反向、键盘即时、偏好中断、重复提交、消息单次入场、模拟后台、首页与浏览器原生前进／后退。
- [基础回归](evidence/ai-chat/result.json) 20项通过，已覆盖移动问题选项、无 Alt 绑定／箭头、常驻共享标题返回、浮层与创建页高度扣除页头、记录恢复及原有生成式交互。
- 进入创建页时聚焦输入字段曾触发外框横向滚动；最终用外框 overflow:clip 消除，回归同时断言动画过程中聚焦字段不改变外框 scrollLeft。
- 进入／退出真实时间线按25%时间位置暂停并截图，已检查所有桌面和手机运动帧。流式响应来自本地模型夹具，后台由可控 visibility 状态模拟；未做真机帧率或软键盘认证。
