// Run: node scripts/design-checks/shared-autoplay.cjs (requires a running preview).
// 网格视频自动播放回归：对齐 docs/design/README.md 契约——可视时静音自动预览、
// 离开视口暂停、回到视口恢复；reduced-motion 下不自动播放。
// 旧版对本仓已删除的 use-autoplay-video 钩子做 vm 静态断言，现行为集中在
// MotionVideo（motion-video.tsx），改为真实浏览器行为断言。
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const baseURL = process.env.DESIGN_BASE_URL || 'http://localhost:3000';
const target = (path) => new URL(path, baseURL).href;
(async()=>{const b=await chromium.launch();try {
// 常规偏好：首个视频格可视时自动播放，滚离暂停，滚回恢复。
const page=await b.newPage({viewport:{width:1440,height:900}});
await page.goto(target('/products/muse'),{waitUntil:'domcontentloaded'});
const firstVideo=page.locator('a[id^="muse-"] video').first();
await firstVideo.waitFor({timeout:20000});
await page.waitForFunction(()=>{
  const v=document.querySelector('a[id^="muse-"] video');
  return v && v.readyState>=2 && !v.paused && v.currentTime>0;
},undefined,{timeout:30000});
await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await page.waitForFunction(()=>{
  const v=document.querySelector('a[id^="muse-"] video');
  return !v || v.paused;
},undefined,{timeout:15000});
await page.evaluate(()=>window.scrollTo(0,0));
await page.waitForFunction(()=>{
  const v=document.querySelector('a[id^="muse-"] video');
  return v && v.readyState>=2 && !v.paused && v.currentTime>0;
},undefined,{timeout:30000});
await page.close();
console.log('PASS autoplay: visible autoplay, offscreen pause, return resume');

// reduced-motion：不自动播放。
const rm=await b.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
await rm.goto(target('/products/muse'),{waitUntil:'domcontentloaded'});
await rm.locator('a[id^="muse-"] video').first().waitFor({timeout:20000});
await rm.waitForTimeout(2500);
assert.ok(
  await rm.evaluate(()=>{
    const videos=Array.from(document.querySelectorAll('a[id^="muse-"] video'));
    return videos.every((v)=>v.paused || v.currentTime===0);
  }),
  'reduced-motion 下网格视频不应自动播放',
);
await rm.close();
console.log('PASS autoplay: reduced motion stays paused');
} finally { await b.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
