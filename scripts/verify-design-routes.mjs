import {readFile,writeFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile('apps/web/.next/prerender-manifest.json'));
const routes=Object.keys(manifest.routes).filter(r => r !== "/_global-error");let cursor=0;const results=[];
// 路由类别决定断言：HTML 页需要 <main> 地标；旧图鉴编号 /<id> 是重定向
// stub（meta refresh 进对应书页），robots.txt 等非 HTML 产物只要求状态码。
const kind=(route)=>/^\/products\/layout-compositions\/[^/]+$/.test(route)?'redirect':/\.(txt|xml|json|webmanifest)$/.test(route)?'asset':'page';
await Promise.all(Array.from({length:8},async()=>{while(cursor<routes.length){const route=routes[cursor++];const res=await fetch((process.env.DESIGN_BASE_URL ?? 'http://localhost:3000')+route);const html=await res.text();results.push({route,status:res.status,kind:kind(route),hasMain:html.includes('<main'),isRedirectStub:/http-equiv="refresh"/.test(html)});}}));
const failed=results.filter(r=>r.status!==(r.route==='/_not-found'?404:200)||(r.kind==='page'&&!r.hasMain)||(r.kind==='redirect'&&!r.isRedirectStub));
await writeFile('docs/design/execution/evidence/routes.json',JSON.stringify({total:results.length,failed,results},null,2)+'\n');console.log(JSON.stringify({total:results.length,failed}));if(failed.length)process.exitCode=1;
