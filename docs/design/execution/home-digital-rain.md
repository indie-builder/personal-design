# 首页数字背景验收

本页为历史结果，保留当时使用的工具、命令和限制；此前浏览器工具限制已撤销。当前验收可使用 Playwright、CDP 或环境可用的浏览器工具，应用由根目录 `pnpm build`、`pnpm start` 经 Portless 启动，见[当前验收入口](README.md)。

2026-09-27。参考 https://aiforui.dev/ 顶部字符雨：浅蓝12px字符、16px行距、逐列下落、尾迹、左右与底部渐隐、鼠标局部提亮。保留首页时间轴结构，单个 Canvas，无新增依赖。

## 执行与结果

- `pnpm --filter @personal-design/web typecheck`、定向 oxlint 与 `git diff --check` 通过。
- `pnpm build` 被已有的缺失脚本 `packages/ai-coding-dictionary/scripts/prepare-runtime.mjs` 阻塞；绕过该前置步骤执行 `pnpm --filter @personal-design/web exec next build` 通过（365个静态页面）。
- 生产预览：`pnpm --filter @personal-design/web exec next start --port 3001`。
- 当时使用 ego-browser，创建 TaskSpace 后在 p2 打开本地预览；历史命令：`EGO_SPACE_ID=<任务空间ID> DESIGN_BASE_URL=http://localhost:3001 sh scripts/design-checks/home-digital-rain.sh`。
- 1440、1280、390px × 深浅主题：画布有实际像素、没有页面横向溢出、不捕获指针、辅助技术隐藏；减少动态效果下图像保持静止。六张截图位于 `.impeccable/review/home-digital-rain/`，已实看桌面与窄屏的双主题截图。
- 恢复普通动效后图像持续变化；方向键仍能移动时间轴并停止背景动效。进入工具页后，Next Activity 缓存的首页隐藏，背景 effect 清理；站内返回首页后恢复绘制与播放。

## 限制

后台暂停已接入共享 motion policy；当时 Ego 的跨标签聚焦未稳定产生 document.hidden，未宣称通过真实后台暂停验收。浏览器原生后退未单独验证，本次没有改动导航逻辑。本次未执行既有 Playwright 回归入口，仅完成上述定向生产回归；这不限制当前工具选择。未覆盖其他浏览器内核及真实手机。

## 中性灰配色调整

按用户后续确认，字符改为主题 ink-soft，鼠标提亮改为 ink；亮／暗主题透明度为 .32／.24。直接 Next 生产构建及类型检查通过，1440px双主题截图与 Canvas 像素检查确认无彩色字符，减少动态效果下保持静态。截图为 `.impeccable/review/home-digital-rain/home-rain-neutral-{light,dark}.png`。本次仅调整配色，未重复执行全站行为回归。

## 全宽适配

画布宽度改为100%视口，ResizeObserver按实际宽度重建字符列与高分辨率位图；字符大小、间距及顶部区域高度保持。取消左右遮罩，仅保留底部渐隐。2560/1440/1280/390px双主题通过全宽及左右边缘像素检查，减少动态效果静止、恢复动画、键盘滚动与离开/返回清理检查通过。缩放后的静态检查等待 ResizeObserver 和主题重绘完成，避免把一次尺寸重绘误判为持续动画。截图位于 `.impeccable/review/home-digital-rain/full-width/`。定向lint和直接生产构建通过。

## PR交付检查

已从dev/build入口移除已退役的词典准备脚本调用。标准 `pnpm build`、workspace类型检查、全站lint、格式检查及27项已有单元测试全部通过。
