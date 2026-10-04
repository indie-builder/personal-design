import {readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('apps/web/.next/prerender-manifest.json'));
const routes=Object.keys(manifest.routes).filter(r => r !== "/_global-error");let cursor=0;const results=[];
// HTML 页需要主内容地标；静态资源只检查响应状态。
const kind=(route)=>/\.(txt|xml|json|webmanifest|png|ico|svg)$/.test(route)?'asset':'page';
await Promise.all(Array.from({length:8},async()=>{while(cursor<routes.length){const route=routes[cursor++];const res=await fetch((process.env.DESIGN_BASE_URL ?? 'https://personal-design.localhost')+route);const html=await res.text();results.push({route,status:res.status,kind:kind(route),hasMain:html.includes('<main')});}}));
const failed=results.filter(r=>r.status!==(r.route==='/_not-found'?404:200)||(r.kind==='page'&&!r.hasMain));
await writeFile('docs/design/execution/evidence/routes.json',JSON.stringify({total:results.length,failed,results},null,2)+'\n');console.log(JSON.stringify({total:results.length,failed}));if(failed.length)process.exitCode=1;
