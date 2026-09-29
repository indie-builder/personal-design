# 首页等价性能优化

2026-09-30。基线 `c4e00c8`。用户明确要求保持效果：不降低帧率、DPR、节点数量、画质，不改动效时序、物理规则、预取和导航速度。

## 实施

- **游戏预览**：缓存像素背景的Path2D几何，仍逐帧使用原来的时间、透明度和颜色。整数DPR合并绘制调用；小数DPR保留原fillRect路径，避免边缘覆盖差异。曾试验文字贴图缓存，发现1灰阶合成差异后弃用，最终标题仍按原方式绘制。正式游戏页调用不传缓存，规则和绘制路径保持原状。
- **三维图谱**：复用节点、标签、区间和目标索引的临时存储，使用等价标量区间计算取代大量两元素数组排序。保留原投影、节点排序、碰撞规则、插值、着色器与刷新策略。
- **词典预览生命周期**：短暂离屏立即隐藏并将原渲染器设为never，实例保留1.5秒，期间返回则原位恢复；超过时间释放。使用visibility隐藏，避免改变画布尺寸或重设相机。键盘／减少动态效果仍展示原SVG静态缩略图。路由离开立即清理定时器和iframe。
- **首页滚动**：滚动时只读取scrollLeft，最大范围由ResizeObserver维护；首尾按钮或是否可滚动状态发生变化才调用React状态更新。原2px阈值、拖动及键盘操作保持。

没有修改OpenUI加载、路由预取或资源缓存头。Next已有内容哈希资源缓存保留；词典部分固定路径资源仍会在更新时修改内容，不将其贸然标记为长期immutable。

## 等价性与行为验证

1. 实施前生成三维间距计算的确定性金样；8/71个节点、192个连续状态覆盖节点显隐、选中、重排、深度、相机旋转、尺寸和即时模式。优化后的Float32坐标/纹理数据哈希与原结果逐位一致。测试：`apps/web/lib/atlas-spacing.test.mjs`。
2. 旧提交与新代码在实际浏览器Canvas中对照：3尺寸×4个DPR×12组状态，共144组，深浅主题、剩余文字、粒子、时间及减少动态效果均覆盖；最终可见像素差异为0。生成器：`scripts/design-checks/preview-pixel-equivalence.mjs`，读取基线git提交，不保留重复的旧实现源码。
3. 内置浏览器确认短暂离屏时同一个iframe仍存在、隐藏且frameloop=never，返回后同一实例visible/always；1.8秒离屏后释放。最终构建相同检查通过。
4. 首页首端、中间、末端按钮状态与原阈值一致；390px深色游戏预览继续运动；键盘和减少动态效果停住，指针恢复后继续。
5. 进入完整词典页后，首页预览iframe数量为0，完整词典Canvas正常出现，浏览器错误0。
6. `pnpm test`共36项通过，类型检查、Lint、格式检查、生产构建通过。旧独立浏览器启动器因AGENTS约束未执行，本轮使用内置浏览器定向检查；真机触摸和其他浏览器引擎未验证。

## 性能对比

与此前审计相同的本地生产模式、内置浏览器、桌面1440×900/DPR1和约5秒CPU采样。下表是渲染主线程工作时间，不是整机CPU占用；改善比例按实际采样窗口长度归一化。

| 场景 | 优化前 | 优化后 | 主线程工作减少 |
|---|---:|---:|---:|
| 词典预览所在区域 | 2.53s | 1.72s | 约32% |
| 游戏预览（隔离词典） | 0.84s | 0.48s | 约43% |
| 首页后半段全部预览 | 2.41s | 1.74s | 约28% |

采样不是多轮基准中位数，受本机负载、GC及场景阶段影响，不保证固定百分比。原始数据保存在`.impeccable/review/home-performance/samples.json`及`after/samples.json`，CPU profile同目录。

正常场景rAF中位间隔仍约8.3ms，没有限帧。CPU四倍降速场景仍有较高负载：主线程约4.97→4.74秒，5秒rAF采样数295→322，P95仍约33ms；不能把这次等价优化说成消除了低性能设备上的全部压力。保持视觉的前提下，剩余三维材质及绘制成本仍然存在。

## 复现

```sh
pnpm test
pnpm build
pnpm --filter @personal-design/web exec next start --port 3013
node scripts/design-checks/preview-pixel-equivalence.mjs
python3 -m http.server 3020 --bind 127.0.0.1 --directory .impeccable/review/home-performance/equivalence
```

在Codex内置浏览器打开3020的`canvas.html`，运行 `verifyPreviewPixels`；在3013首页显示词典缩略图、Canvas就绪后运行 `verifyDictionaryReuse`，运行 `verifyTimelineBounds` 检查按钮。三个检查导出自 `scripts/design-checks/home-performance.browser.mjs`，只使用传入的内置浏览器CDP能力，不启动其他浏览器。

截图与JSON记录：`.impeccable/review/home-performance/after/`（`pixels.json`、`final-lifecycle.json`、`motion-states.json`、桌面及深色窄屏截图）。
