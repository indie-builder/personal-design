#!/bin/sh
set -eu
# DESIGN_BASE_URL=http://localhost:3001 sh scripts/design-checks/dictionary-search.sh
# EGO_SPACE_ID resumes an existing task; the caller then owns finishing it.
ego-browser nodejs <<EOF
const config = $(node -e 'console.log(JSON.stringify({space:process.env.EGO_SPACE_ID,base:process.env.DESIGN_BASE_URL,output:process.env.DESIGN_EVIDENCE_DIR}))');
$(cat <<'JS'
const assert = (await import('node:assert/strict')).default;
const { mkdir } = await import('node:fs/promises');
const task = await taskSpace(config.space ? Number(config.space) : '词典搜索验收');
const page = task.page('p1');
const base = config.base || 'http://localhost:3000';
const output = config.output || '/tmp/dictionary-search';
await mkdir(output, { recursive: true });
const state = () => page.evaluate(() => {
  const d = document.querySelector('iframe').contentDocument;
  const input = d.querySelector('#atlas-search'), field = input.parentElement;
  const css = e => d.defaultView.getComputedStyle(e);
  const rect = e => { const r = e.getBoundingClientRect(); return { x:r.x, right:r.right, width:r.width, height:r.height }; };
  return { focus:d.activeElement?.id, query:input.value, field:rect(field), input:rect(input),
    fieldOutline:css(field).outlineStyle, shadow:css(field).boxShadow, inputOutline:css(input).outlineStyle,
    inputBorder:css(input).borderWidth, inputShadow:css(input).boxShadow,
    buttons:[...field.querySelectorAll('button')].map(e=>({...rect(e), outline:css(e).outlineStyle})),
    matches:d.defaultView.__atlasJourney.getState().matchCount,
    reduced:d.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches,
    transition:css(field).transitionDuration, viewport:d.defaultView.innerWidth };
});
for (const [width, height, theme, reduced] of [[1440,900,'light',false],[1280,900,'dark',false],[390,844,'light',true],[320,740,'dark',true]]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<800});
  await page.cdp('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});
  await page.goto(`${base}/products/ai-coding-dictionary`);
  await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('button[aria-label="搜索词典"]')?.hasAttribute('data-base-ui-tooltip-trigger'));
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
  await page.click('button[aria-label="搜索词典"]');
  // A pointer focus expands the field before the upstream click handler runs.
  await page.click('#atlas-search');
  await page.waitForFunction(()=>{const d=document.querySelector('iframe').contentDocument;return d.activeElement?.id==='atlas-search' && Math.abs(d.querySelector('#atlas-search').parentElement.getBoundingClientRect().width-280)<1;});
  let s=await state();
  assert.equal(s.fieldOutline,'solid');
  assert.equal(s.shadow,'none','no shadow layered beneath the focus boundary');
  assert.equal(s.inputOutline,'none'); assert.equal(s.inputBorder,'0px'); assert.equal(s.inputShadow,'none');
  assert.equal(s.field.height,44); assert.ok(s.field.x>=20 && s.field.right<=s.viewport-20);
  assert.ok(s.input.width>=190,'placeholder has room');
  if(reduced) assert.equal(s.transition,'0s');
  await page.screenshot({path:`${output}/${width}-${theme}-focus.png`});
  await page.fill('#atlas-search','agent');
  await page.waitForFunction(()=>new URLSearchParams(location.search).get('q')==='agent');
  s=await state(); assert.ok(s.matches>0); assert.equal(s.buttons.length,2);
  for(const button of s.buttons) {assert.equal(button.width,44);assert.equal(button.height,44);assert.equal(button.outline,'none');}
  await page.press('#atlas-search','Tab');
  assert.equal(await page.evaluate(()=>document.querySelector('iframe').contentDocument.activeElement?.getAttribute('aria-label')),'Clear search');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('#atlas-search').value==='');
  assert.equal((await state()).focus,'atlas-search');
  await page.fill('#atlas-search','zzzznonexistentxxxx');
  await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.__atlasJourney.getState().matchCount===0);
  await page.press('#atlas-search','Escape');
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('#atlas-search').value==='');
  await page.press('#atlas-search','Escape');
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('#atlas-search').parentElement.getBoundingClientRect().width===44);
  await page.keyboard.press('/');
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.activeElement?.id==='atlas-search');
  await page.fill('#atlas-search','agent');
  await page.waitForFunction(()=>document.querySelector('iframe').contentWindow.__atlasJourney.getState().matchCount>0);
  await page.press('#atlas-search','Enter');
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('.dictionary-detail')?.dataset.open==='true');
  s=await state(); assert.ok(s.field.x>=0 && s.field.right<=s.viewport);
  await page.screenshot({path:`${output}/${width}-${theme}-detail.png`});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.activeElement?.getAttribute('aria-label')==='搜索词典');
  console.log(`PASS ${width}px ${theme}: single focus boundary, search, clear, empty, keyboard, detail return${reduced?', reduced motion':''}`);
}
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.cdp('Emulation.setEmulatedMedia',{features:[]});
if(!config.space) await task.finish({keep:[]});
console.log(`Evidence: ${output}`);
JS
)
EOF
