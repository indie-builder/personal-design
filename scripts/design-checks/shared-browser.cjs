// Run: node scripts/design-checks/shared-browser.cjs (requires a running preview).
// 共享灯箱行为回归：对齐 docs/design/README.md「灯箱与恢复状态」契约——
// 背景滚动锁、焦点约束（Tab 环不逃逸、初始与关闭后焦点落点）、组内方向键
// 翻图同步计数、Esc 关闭；404 提供清晰首页出口。 muse 集合与布局画册的
// 专属入口行为分别由 muse-behavior / layouts-* 脚本覆盖，此处不重复。
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const baseURL = process.env.DESIGN_BASE_URL || 'http://localhost:3000';
const target = (path) => new URL(path, baseURL).href;
(async()=>{const b=await chromium.launch();try {
const p=await b.newPage({viewport:{width:1440,height:900}});
const errors=[];p.on('pageerror',(e)=>errors.push(e.message));

// 灯箱：滚动锁、焦点环、组内方向键、Esc 与焦点回归（用多媒体详情的组入口）。
await p.goto(target('/products/muse/product-comps'),{waitUntil:'domcontentloaded'});
await p.getByRole('button',{name:/^放大查看 /}).first().waitFor();
await p.getByRole('button',{name:/^放大查看 /}).first().click();
const d=p.getByRole('dialog');await d.waitFor();
assert.equal(await p.evaluate(()=>document.body.style.overflow),'hidden','灯箱应锁定背景滚动');
assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'关闭','初始焦点应在关闭按钮');
await p.keyboard.press('Shift+Tab');
assert.ok(await p.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')),'Tab 环不得逃出灯箱');
await p.keyboard.press('Tab');
assert.equal(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'关闭');
await p.keyboard.press('ArrowRight');await p.waitForTimeout(400);
assert.match(await d.innerText(),/2 \/ /,'方向键应翻到第 2 张');
await p.keyboard.press('ArrowLeft');await p.waitForTimeout(400);
assert.match(await d.innerText(),/1 \/ /,'方向键应翻回第 1 张');
await p.keyboard.press('Escape');await p.waitForTimeout(400);
assert.equal(await d.count(),0,'Esc 应关闭灯箱');
assert.match(await p.evaluate(()=>document.activeElement?.getAttribute('aria-label')),/^放大查看 /,'关闭后焦点应回到触发按钮');
assert.equal(await p.evaluate(()=>document.body.style.overflow),'','关闭应解除滚动锁');

// 404：清晰首页出口，未知路由保持真 404 状态。
const nf=await p.goto(target('/unknown-g5-verification'),{waitUntil:'domcontentloaded'});
assert.equal(nf.status(),404,'未知路由应返回 404');
assert.equal(await p.getByRole('heading',{name:'找不到这个页面'}).count(),1);
assert.equal(await p.getByRole('link',{name:'回到首页'}).getAttribute('href'),'/');

assert.equal(errors.length,0,`页面报错：${errors.join(' | ')}`);
console.log('PASS shared browser: lightbox scroll lock/focus wrap/group arrows/Esc focus return; true 404 with home exit');
} finally { await b.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
