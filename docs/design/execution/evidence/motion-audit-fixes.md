# 全项目动效审查修复 · 2026-09-29

本次修复审查确认的5个问题，并处理词典持续渲染与聊天输入区同步布局风险。包含画册翻页中断、首页预览监听器清理、书籍暂停续播与键盘视频策略的基础修复。

## 实现结果

| 问题 | 修复 | 验收证据 |
| --- | --- | --- |
| 混合媒体轮播尺寸来回跳变 | 原生滚动完成后提交媒体几何；快速反向使用目标索引，键盘/减少动态效果/resize收尾对齐 | 531→1104px只变化一次，终点left=1104、current=1；反向回到0，无序号错配 |
| 灵感返回先顶部后跳回 | layout阶段恢复滚动与焦点，复用Activity窗口；缺窗请求可取消，等待期间保留高度；完整小结果集不补空页 | 站内返回首个可见帧y=992.5；原生后退及详情重载后返回首帧y=2842.5，均匹配保存值；48条无重复；1条结果返回零补页请求 |
| 灯箱切策略后模态锁延迟解除 | 统一订阅动效策略，完成进入/关闭并清理待执行帧和计时器 | 关闭中切键盘/模拟后台后dialog消失、overflow和inert解除、焦点回源；关闭中翻图不会被旧计时器卸载 |
| 头像键盘仍播放9.2秒空间动作 | 键盘沿用已有1秒静态姿态淡变，活动指针表演切键盘时收起 | 键盘仅1个1000ms动画且全部transform相同；指针仍10个9200ms原动作；Esc与减少动态效果路径通过 |
| 词典即时策略遗漏WebGL动效 | 原镜头/节点/搜索/粒子直接收敛到终态；保留原图谱和库 | reduced与keyboard初载、搜索、选择、策略中断均矩阵稳定，静态观察窗口draw计数不增加 |
| 词典静态画面仍持续渲染 | 原R3F Canvas受控always/demand/never，主题/选择/搜索请求绘帧，可见性与后台控制暂停 | 主题uniform实际更新后停绘；resize后仍按需；离屏/模拟后台停绘，重新可见/指针输入恢复绘制 |
| 聊天输入高度写入后立刻再读布局 | 从ResizeObserver取得高度，先读未缩放布局坐标，再按高度差更新滚动与inset | 1440/390两种宽度，六行草稿增长与清空都保持底部；浏览历史不丢草稿；首页带scale入场后仍保持最新消息位置 |

新增回归在实现前编写；复核发现的小结果集和祖先scale边缘先扩展回归，再修复。旧综合回归对“书籍停止”的断言由删除活动节点改为检查暂停状态与进度不变，符合此前已采用的暂停续播行为。

## 开书风险的处理

开册width/height插值是DESIGN明确允许的局部例外。对实际360ms对齐动画，在0–350ms间每35ms设置动画时间并读取几何：11个采样触发11次Layout，总LayoutDuration约2.586ms，约0.235ms/次。它证明存在布局工作，但没有证明超出单帧预算；因此保留既有造型，不为该风险引入封面/文字分层重构。

这是本机确定性时间采样，不是低端设备自然播放FPS测量，也不代表开书完全没有布局成本。本机ego动画时钟偶尔延迟，直接等待完整播放会触发既有2.1秒保护；测量通过结束抽书CSS动画后隔离真实WAAPI对齐阶段，未修改业务代码或时长。

## 可重复运行

```sh
pnpm build
pnpm --filter @personal-design/web start --port 3012
```

另一个终端执行下列专项。Agent连续验收须先按应用内ego-browser技能建立一个TaskSpace，再给各命令传同一个`EGO_TASK_SPACE`（`dictionary-search.sh`使用`EGO_SPACE_ID`）；结束后由调用者统一关闭。未提供空间时，各专项自行建立并在成功后关闭。

```sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/muse-motion.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/lightbox-avatar-motion.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/dictionary-motion.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/ai-chat-scroll.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/motion-policy.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/workspace-navigation.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/back-motion.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/back-stability.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/book-opening-stability.sh
DESIGN_BASE_URL=http://localhost:3012 sh scripts/design-checks/dictionary-search.sh
```

`ai-chat-scroll.sh`仅使用隔离localhost端口上的测试会话，有既有会话保护，不请求模型。`dictionary-motion.sh`与`ai-chat-scroll.sh`支持`DESIGN_EVIDENCE_DIR`改变截图/采样输出位置。词典回归先等待真实WebGL矩阵或uniform更新，再检测停绘；后台/离屏观察使用Node侧时钟，避免用已暂停的页面rAF等待暂停结束。

## 验证范围与限制

- 生产构建与TypeScript通过，相关TSX定向oxlint通过；现有单元测试27/27通过。
- 灵感专项8项、灯箱/头像专项9项、词典动效专项、聊天1440/390滚动专项、已有动效策略8项、综合导航及两份回退专项均通过。开书连续性偏差0.000061px；词典搜索在1440浅色、1280深色、390浅色和320深色四组尺寸/主题中通过，后两组开启减少动态效果。
- 浏览器全部使用应用内ego-browser；重点覆盖1440/1280桌面、390窄屏、双主题、键盘与减少动态效果。词典深色选中态、聊天显示/收起状态已检查截图；列表首帧使用实际rAF采样，不以最终URL替代恢复证据。
- 后台策略采用document.hidden加visibilitychange的明确模拟，离屏使用实际iframe移出视口。未做系统级后台CPU/GPU或真实移动设备测试。
- 旧`run-all.mjs`包含独立Playwright浏览器启动，与当前根AGENTS要求的ego-browser入口不同，本轮未运行；本次使用上列ego动效专项与已有回退回归，不宣称全站全部业务功能验收通过。
- 外链媒体依赖上游。本轮使用真实媒体尺寸与DOM状态验证轮播，不把上游临时加载失败计为切换动画回归。

截图保存在执行环境的验收目录，不提交机器专属路径。设置`DESIGN_EVIDENCE_DIR`运行词典动效专项会生成`reduced-dark-selected.png`与`keyboard-selected.png`；聊天滚动专项会生成`1440-visible.png`、`390-visible.png`及对应的收起状态和采样数据，可按上方脚本重新生成。
