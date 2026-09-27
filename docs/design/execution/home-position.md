# 首页右下角浏览按钮

按用户最终决定，取消底部位置条，恢复右下角上一项／下一项交互。使用共享44px ghost图标按钮：常态无圆形外框与底色，悬停轻底色和方向反馈，键盘焦点可见，首末端禁用。不增加文字或重复作品导航。

定向lint、类型检查、直接Next生产构建通过。ego-browser在1440/1280/390px、深浅主题下验证前后移动、首末端禁用、键盘Enter、44px操作尺寸、无位置条和页面级横向溢出。截图：`.impeccable/review/home-arrows/`。

复现：启动3001生产预览，在ego任务空间p1运行 `EGO_SPACE_ID=<ID> DESIGN_BASE_URL=http://localhost:3001 sh scripts/design-checks/home-overview.sh`。原有home.mjs箭头回归保持，未执行其Playwright入口或全站回归；未测试真实触屏设备。PR交付时已移除失效的词典准备脚本调用，标准pnpm build通过。

## 作品起点对齐

首个作品、日期和时间轴起点改为与页头头像图像左边缘对齐（含头像按钮内6px留白），宽屏遵循页头1440px居中容器。2560/1440/1280/640/639/390px双主题的实际坐标差小于1px；前后按钮、边界禁用、键盘与无页面横向溢出回归通过。直接生产构建通过。截图：`.impeccable/review/home-alignment/`。
