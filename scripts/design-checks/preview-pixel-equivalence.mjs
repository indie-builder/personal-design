import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const baseline = process.argv[2] ?? 'c4e00c844f8ca33dc2dcb2770e16bd39539cf759';
const baselineFile = (p) => execFileSync('git', ['show', baseline + ':' + p], { encoding: 'utf8' });
const dir = '.impeccable/review/home-performance/equivalence/';
const source = async (p) =>
  stripTypeScriptTypes(await readFile(p, 'utf8'))
    .replace(/^import .*;$/gm, '')
    .replaceAll('export ', '');
await mkdir(dir, { recursive: true });
const old = stripTypeScriptTypes(baselineFile('apps/web/components/word-arcade-draw.ts'))
  .replace(/^import .*;$/gm, '')
  .replaceAll('export ', '')
  .replace('function drawArcade(', 'function legacyDrawArcade(');
const current = await source('apps/web/components/word-arcade-draw.ts');
const draw = async (p) => {
  const s = await readFile(p, 'utf8');
  return s.slice(s.indexOf('    const draw = () => {'), s.indexOf('    const animate ='));
};
const oldPreview = baselineFile('apps/web/components/word-arcade-preview.tsx');
const originalDraw = oldPreview.slice(
  oldPreview.indexOf('    const draw = () => {'),
  oldPreview.indexOf('    const animate ='),
);
const newDraw = await draw('apps/web/components/word-arcade-preview.tsx');
const patterns = await readFile('packages/word-arcade/src/pixel-patterns.json', 'utf8');
await writeFile(
  dir + 'canvas.html',
  `<!doctype html><meta charset="utf-8"><title>Canvas equivalence</title><pre id="result">Running</pre><script>
const pixelPatterns=${patterns};
${old}
${current}
const originals=${JSON.stringify(originalDraw)},currentDraw=${JSON.stringify(newDraw)};
function renderer(body,paint,w,h,scale){
 const canvas=document.createElement('canvas');canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);const ctx=canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);
 const background=typeof arcadeBackgroundPaths==='function'&&Number.isInteger(scale)?arcadeBackgroundPaths(w,h):undefined;
 const run=Function('ctx','canvas','drawArcade','background','font',
  'let game,ink,paper,quiet;const instantMotion=()=>quiet;'+body+';return (g,i,p,q)=>{game=g;ink=i;paper=p;quiet=q;draw()};'
 )(ctx,canvas,paint,background,'500 21px "Albert Sans", system-ui, sans-serif');
 return {canvas,run};
}
function opaque(canvas,paper){const c=document.createElement('canvas');c.width=canvas.width;c.height=canvas.height;const x=c.getContext('2d');x.fillStyle=paper;x.fillRect(0,0,c.width,c.height);x.drawImage(canvas,0,0);return x.getImageData(0,0,c.width,c.height).data;}
const results=[];
for(const scale of [1,1.25,1.5,2])for(const [w,h] of [[254,174],[320,196],[360,220]]){
 const a=renderer(originals,legacyDrawArcade,w,h,scale),b=renderer(currentDraw,drawArcade,w,h,scale);
 for(let f=0;f<12;f++){
  const ink=f%4<2?'#202020':'#fafafa',paper=f%4<2?'#fafafa':'#202020',quiet=f%5===0;
  const game={width:w,height:h,floor:h-16,kind:'breakout',playerX:60+f*9,time:f*.47,ball:{x:40+f*13,y:95+f*2},particles:[{x:100.5,y:90.7,life:.22}],bricks:[...'任何想法一键开玩'].map((text,i)=>({text,homeX:(w-168)/2+i*21,homeY:52,alive:i>=f%9}))};
  a.run(game,ink,paper,quiet);b.run(game,ink,paper,quiet);const x=opaque(a.canvas,paper),y=opaque(b.canvas,paper);let max=0,changed=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);max=Math.max(max,d);if(d)changed++;}
  results.push({scale,w,h,f,max,changed});
 }
}
window.comparison={pass:results.every(r=>r.changed===0),cases:results.length,max:Math.max(...results.map(r=>r.max)),changedCases:results.filter(r=>r.changed).length,results};document.getElementById('result').textContent=JSON.stringify({pass:window.comparison.pass,cases:window.comparison.cases,max:window.comparison.max,changedCases:window.comparison.changedCases},null,2);
</script>`,
);

console.log(
  'Open http://localhost:3020/canvas.html in the Codex browser after serving ' +
    dir +
    '; expect pass=true and 144 identical frames.',
);
