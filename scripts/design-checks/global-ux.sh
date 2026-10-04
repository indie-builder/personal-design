#!/bin/sh
set -eu
ego-browser nodejs <<'EOF'
const assert=(await import('node:assert/strict')).default;
const task=await taskSpace('全站 UX 优化验收');const page=task.page('p1');
await page.goto('https://personal-design.localhost/',{waitUntil:'domcontentloaded'});
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await page.press('a[aria-label="进入布局参考"]','Enter');
await page.waitForSelector('button[aria-label="打开构图，86页"]',{state:'visible'});
await page.press('button[aria-label="打开构图，86页"]','Enter');
await page.waitForSelector('select[aria-label="跳转到图鉴"]',{state:'visible'});
const last=await page.evaluate(()=>document.querySelector('select[aria-label="跳转到图鉴"]').lastElementChild.value);
await page.selectOption('select[aria-label="跳转到图鉴"]',last);
await page.waitForFunction(id=>!!document.querySelector(`[data-page-id="${id}"]`),last);
await page.press('button[aria-label="返回书架"]','Enter');
await page.waitForSelector('#book-0',{state:'visible'});
assert.equal(await page.evaluate(()=>document.activeElement?.id),'book-0');
await page.evaluate(()=>history.back());await page.waitForURL('https://personal-design.localhost/');
// Native back from a book also restores the original shelf trigger.
await page.press('a[aria-label="进入布局参考"]','Enter');await page.waitForSelector('#book-0',{state:'visible'});
await page.press('#book-0','Enter');await page.waitForSelector('select[aria-label="跳转到图鉴"]',{state:'visible'});
await page.evaluate(()=>history.back());await page.waitForSelector('#book-0',{state:'visible'});
assert.equal(await page.evaluate(()=>document.activeElement?.id),'book-0');
// Current book URLs select the page; magnification is an explicit user action.
await page.goto('https://personal-design.localhost/products/layout-compositions?cat=构图逻辑&page=001',{waitUntil:'commit'});
await page.waitForSelector('button[data-page-id="001"]',{state:'visible'});
await page.press('button[data-page-id="001"]','Enter');
await page.waitForSelector('[role="dialog"]',{state:'visible'});
assert.ok((await page.url()).includes('/products/layout-compositions?'));
await page.keyboard.press('Escape');await page.waitForSelector('[role="dialog"]',{state:'detached'});
assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-page-id')),'001');
await page.press('button[aria-label="返回书架"]','Enter');await page.waitForSelector('#book-0',{state:'visible'});
await page.goto('https://personal-design.localhost/products/muse',{waitUntil:'domcontentloaded'});
await page.waitForSelector('a[id^="muse-"]',{state:'visible'});
assert.equal(await page.evaluate(()=>document.querySelectorAll('[role="slider"],aside').length),0);
const first=await page.evaluate(()=>document.querySelector('a[id^="muse-"]').id);
await page.press('#'+first,'Enter');
await page.waitForSelector('main h1',{state:'visible'});
assert.ok((await page.url()).includes('/products/muse/'));
await page.click('nav[aria-label="作品导航"] a:first-child');
await page.waitForSelector('a[id^="muse-"]',{state:'visible'});
await page.waitForFunction(id=>document.activeElement?.id===id,first);
await page.click('[aria-label="分类"] button:last-child');
await page.waitForFunction(()=>!!new URLSearchParams(location.search).get('cat'));
assert.ok(await page.evaluate(()=>document.querySelectorAll('a[id^="muse-"]').length)>0);
await page.goto('https://personal-design.localhost/products/muse?post=sticker-footer',{waitUntil:'commit'});
await page.waitForSelector('a[id^="muse-"]',{state:'visible'});
assert.equal(new URL(await page.url()).pathname,'/products/muse');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
cliLog({status:'PASS',checks:'book jump and return, explicit magnification, restored gallery and detail, return focus, category, obsolete post parameter ignored, narrow viewport'});
EOF
