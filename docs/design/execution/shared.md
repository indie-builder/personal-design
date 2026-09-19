# G5 共享交互

状态：实现完成；静态检查、自动播放状态测试与真实浏览器关键交互验证通过，视觉截图归主任务批量验收。

## 来源与适配

依据 `open-design/rules.md` 的控件、动效、可访问性与有限加载规则。分类选择复用 Button，选中中性主按钮胶囊，未选中 ghost 4px；计数保留 mono 12px。原始 JSON 原生 details/summary 不另造弹窗控件。404 使用真实首页、灵感集、布局参考链接，去掉铁路装饰。

灯箱保留触发位置 FLIP，进入 200ms、退出 140ms，关闭目标重新测量；恒定暗房是媒体浏览表面的明确例外，使用 #202020 背景、#353535 控件、#fafafa 文字、#848484 边框，无玻璃材质。按钮共享几何和反馈，灯箱触摸操作至少 44px，焦点白色 2px。图片 object-contain 防止异比例同组图片裁切；图注独立于狭窄图片宽度。

## 操作与状态矩阵

| 表面 | loading / empty / error / populated / edge | 操作与状态处理 |
| --- | --- | --- |
| 灯箱 | 缩略图立即显示，高清最多等待12秒；超时/网络失败展示说明及重试；无缩略图且主图失败有明确错误；单图不显示翻页；长标题省略但 dialog 名称保留完整 | 打开聚焦关闭按钮；Tab/Shift+Tab循环；背景 inert；Esc/遮罩/关闭按钮关闭；关闭返回原焦点；锁 body 滚动且恢复旧值；详情链接关闭弹层；同组左右循环与计数；方向键不抢输入框；触控拖动/甩动，pointercancel只复位；关闭中翻页取消关闭计时；快速关闭不被入场rAF重新展开 |
| 分类 | 同步数据无伪加载；零条计数仍可选择；无效URL在传入allowed名称时归一到全部且保留其他参数；选中 aria-pressed | 原生按钮Enter/Space/Tab；可换行；中性hover/active/focus；useCatParam增加可选参数、旧API兼容 |
| 原始 JSON | 内容是否存在由详情模板决定；展开保留真实JSON | 原生summary Enter/Space；外部点击关闭且不抢外部点击焦点；Esc关闭并回焦summary；内容方向键/Home/End停止向详情导航传播 |
| 自动播放 | 视频poster/错误由消费者负责，本hook不制造加载UI | IO至少25%可见才播放；离屏/文档隐藏暂停；前台恢复；reduced-motion动态切换立即生效；卸载暂停且清理监听；异步play完成后再检查允许条件 |
| 404 | 同步终止页无加载/禁用操作 | 清楚错误说明；三个真实导航入口；使用工作区高度，避免双main和额外整屏高度 |

## 验证证据

- 全部5个TS/TSX拥有文件 eslint通过，最终 `pnpm --filter @personal-design/web typecheck` 通过（2026-09-05）。
- `scripts/design-checks/shared-autoplay.cjs` 用真实TypeScript源转译、模拟DOM事件测试：25%阈值、隐藏/恢复、动态减少动效、卸载清理及异步play竞态，全部通过。
- `scripts/design-checks/shared-browser.cjs` 在真实 Chromium、390×844、`http://localhost:3000` 通过：灵感分类无效URL归一且保留查询；灯箱打开焦点、Tab双向循环、Esc回焦、滚动锁恢复、左右切换、关闭中翻页打断；拦截图片请求后的错误和重试操作；404真实链接；JSON Enter展开、内容方向键不导航、Esc回焦。
- 独立 Chromium 验证通过：reduced-motion 下合成触控 pointer swipe 翻页、Esc即刻关闭并恢复滚动。
- 独立 Chromium 拦截图片并延迟14秒验证通过：先显示加载，12秒后出现超时说明和重试入口。
- 主任务负责双主题、320/390/1024/1440尺寸视觉截图。触控验证为浏览器合成pointer事件，未在物理触摸设备测量手势体验。
- 服务最初Portless未注册、既有3000请求挂起；主任务恢复3000后完成上述浏览器验证，无遗留G5服务阻塞。

## 接口与清理

`useCatParam(allowed?: readonly string[])` 可选参数用于无效URL恢复，灵感调用方传 categories.map(c => c.name)；布局经主任务认可选择保留无效URL并显示明确清除恢复操作，故不传allowed。其余共享API保持原样。局部样式全部为相邻CSS Module。主任务可删除旧 `.category-tab` / `.lightbox-surface` 全局选择器。没有改动数据、提交或部署。

## 可复现命令

> 2026-09-19 更正：两个脚本已重写对齐现行契约。shared-browser 聚焦灯箱
> 滚动锁、焦点环、组内方向键、Esc 焦点回归与真 404 出口（muse 集合与画册
> 的入口专属行为分别由 muse-behavior、layouts-* 覆盖，JSON 查看器已按契约
> 移除不再断言）；shared-autoplay 因原 hook 删除改为对 MotionVideo 的真实
> 浏览器断言（可视自动播、离屏暂停、回视恢复、reduced-motion 不自动播）。
> 下方命令用法不变，历史验证记录保留在上方供追溯。

先运行 `pnpm dev:direct`（或使用已有预览），再运行：

```sh
node scripts/design-checks/shared-autoplay.cjs
node scripts/design-checks/shared-browser.cjs
```

浏览器脚本使用根依赖 `playwright`；可通过 `DESIGN_BASE_URL` 指定预览地址，默认 `http://localhost:3000`。脚本输出 PASS/断言失败作为证据，不生成截图或修改数据。
