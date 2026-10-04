# 开书起始抖动修复 · 2026-09-28

本页保留历史命令与结果；此前浏览器工具限制已撤销。当前可使用 Playwright、CDP 或环境可用的浏览器工具，应用由根目录 `pnpm build`、`pnpm start` 经 Portless 启动，见[当前验收入口](../README.md)。

原因：书脊悬停已执行 translateY(-20px) rotate(-2deg)，抽书首帧却从零变换开始；进入抽书状态后 hover 过渡也可能争用 transform。点击前保存实际 computed transform，用作抽书首帧，并在抽书期间关闭 transition。所有分类共用此入口。

复现与回归（生产服务）：

```sh
pnpm build
pnpm --filter @personal-design/web start --port 3002
DESIGN_BASE_URL=http://localhost:3002 sh scripts/design-checks/book-opening-stability.sh
```

脚本使用应用内 ego-browser；悬停稳定后实际点击书脊，在真实 animationstart 上检查首帧矩形与点击前的差异，小于 1px 才通过，最后等待画册解除 busy。修复前失败：21.119px；修复后通过：0.000061px。1440px、1280px 桌面复测通过。

行为与状态：翻页到第3–4页、指针合书并恢复书脊焦点、Enter即时开书、Esc返回、减少动态效果开书、浏览器 history.back 返回及焦点恢复通过。390px减少动态效果路径无横向溢出，busy正常解除。生产构建、Web typecheck、修改文件 oxlint、git diff --check 通过。

视觉：检查1440px浅色画册、1280px深色起始书脊及画册截图；本机截图保存在 `.impeccable/review/book-opening/`。起始几何连续性有自动断言；没有逐帧录屏，因此不将此记录表述为整段3D动画所有交接点的视觉认证。

范围限制：本轮为开书定向回归，未运行 `run-all.mjs` 的 Playwright 套件及其他产品专项。这是当时的覆盖范围，不限制当前工具选择。未覆盖真实移动设备或其他浏览器引擎，未提交、推送、部署。
