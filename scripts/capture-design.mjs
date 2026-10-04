import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.DESIGN_BASE_URL ?? 'http://localhost:3000';
const out = path.resolve('.impeccable/review/full-design');
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const routes = [
  ['home','/'], ['muse','/products/muse'], ['layouts','/products/layout-compositions'],
  ['muse-detail','/products/muse/file-management-dashboard'], ['layout-detail','/products/layout-compositions?cat=构图逻辑&page=001'], ['404','/does-not-exist'],
];
const evidence = [];
try {
for (const [device,width,height] of [['desktop',1440,900],['tablet',1024,768],['mobile',390,844]]) {
 const context = await browser.newContext({ viewport:{width,height},reducedMotion:'reduce' });
 const page = await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 for (const [name,route] of routes) {
  const response = await page.goto(base+route,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(600);
  if (name === 'muse-detail') await page.getByRole('region', {name:'作品媒体'}).locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0 ? undefined : new Promise((resolve,reject) => { img.addEventListener('load',resolve,{once:true}); img.addEventListener('error',reject,{once:true}); setTimeout(() => reject(new Error('Media capture did not settle')),16000); }));
  const file = `${name}-${device}.png`;
  await page.screenshot({path:path.join(out,file),fullPage:!['muse','home'].includes(name)});
  const metrics = await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
  evidence.push({name,device,route,file,status:response.status(),metrics,errors:[...errors]});
  console.log(file,JSON.stringify(metrics));
 }
 await context.close();
}
const context = await browser.newContext({ viewport:{width:1440,height:900},colorScheme:'dark',reducedMotion:'reduce' });
const page = await context.newPage();
for (const [name,route] of routes.slice(0,5)) {
 await page.goto(base+route,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(500);
 if(name==='muse-detail') await page.waitForFunction(()=>{const img=document.querySelector('[aria-label="作品媒体"] img'); return img?.complete && img.naturalWidth>0;});
 const file=`${name}-dark.png`;await page.screenshot({path:path.join(out,file)});evidence.push({name,device:'dark',file,route});
}
await context.close();
await writeFile(path.join(out,'captures.json'),JSON.stringify(evidence,null,2)+'\n');
} finally { await browser.close(); }
