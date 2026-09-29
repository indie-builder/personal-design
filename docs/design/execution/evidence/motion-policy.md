# 动效策略修复验收 · 2026-09-29

本记录覆盖基础修复：画册翻页中断、首页预览监听器清理、书籍离屏续播、键盘视频策略。此前头像素材与造型改动已按用户要求回退；后续仅对原头像实现补齐键盘动效策略，见[全项目动效审查修复](motion-audit-fixes.md)。

## 可重复执行

```sh
pnpm build
pnpm --filter @personal-design/web start --port 3002
DESIGN_BASE_URL=http://localhost:3002 sh scripts/design-checks/motion-policy.sh
DESIGN_BASE_URL=http://localhost:3002 sh scripts/design-checks/book-opening-stability.sh
```

使用应用内ego-browser。连续调试可传入现有EGO_TASK_SPACE；独立运行完成后关闭自己的浏览空间。视频检查需要首页预览媒体及个人网站宣传片可加载。

## 保留的行为与状态检查

- 书籍离屏暂停，回来使用同一个Animation继续原进度。
- 键盘模式停止自动视频预览。
- 离开首页释放4个预览IntersectionObserver。
- 返回首页仍只有4个活动预览监听器。
- 翻页途中切换键盘，立即完成跨页并解除按钮禁用。
- 翻页途中开启减少动态效果，立即完成跨页。
- 减少动态效果仍允许用户通过Enter手动播放，后续Tab不会误暂停。
- 手动视频离屏暂停，返回视口后保留播放意图并续播。

以上8项在生产回归中通过。开书起始位置回归偏差0.000061px。未做真实移动设备、全站每条路由视觉验收或逐帧性能录制。
