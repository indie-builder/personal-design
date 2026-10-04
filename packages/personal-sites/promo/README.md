# 个人网站宣传片

36 秒，1920×1080 / 30fps，中文。源站为 https://default-coder.lovemyrmb.cn/ 。
使用本项目已安装的 `.agents/skills/video-shotcraft`，按自主创作模式制作。
分镜、视觉取舍、功能与镜头映射见 SPEC.md；参考实现、Gallery 索引与样片见 references/。

## 渲染

在仓库根执行 `pnpm --filter @personal-design/personal-sites render:promo`。
渲染后执行 `pnpm sync:personal-sites`，把成片和封面同步到站点 public。
Remotion 仅为内容包的开发依赖，不进入网站运行时。
如自动下载 Chrome 失败，可在命令后追加 `--browser-executable=/path/to/chrome-headless-shell`。

## 素材

public/textures/ 是 2026-09-09 的公开页面冻结截图，1920px CSS 视口、2倍像素密度；
`*-full.png` 为整页，`*.png` 为首屏，`*-cut-*.png` 为原生元素切片。
layout.json 记录页面来源和元素坐标。截图不使用登录数据；浏览器翻译工具浮层在拍摄时临时隐藏。
实时页面在字体与内容加载后冻结为 PNG；视频使用这些固定素材，不在渲染时请求线上页面。
`styleframe.html` 和 out/qa/styleframe.png 是制作前的静态方向验证。

## 无声输出

宣传片为完全无声版本，视频文件不保留音轨。工程只包含画面，渲染使用 `--muted` 导出。
