import {readFile,writeFile} from 'node:fs/promises';
// 静态路由清单来自生成的路由树；动态段（$slug）、API 路由与 /_image 优化端点
// 不在预渲染检查范围。/_not-found 是合成探针，新栈下任何未匹配路径返回 404。
const tree=await readFile('apps/web/src/routeTree.gen.ts','utf8');
const routes=[...new Set([...tree.matchAll(/fullPath: '([^']+)'/g)].map(m=>m[1]))]
  .map(r=>(r.replace(/\/+$/,'')||'/'))
  .filter(r=>!r.includes('$')&&!r.includes('/api')&&r!=='/_image');
routes.push('/_not-found');let cursor=0;const results=[];
// HTML 页需要主内容地标；静态资源只检查响应状态。
const kind=(route)=>/\.(txt|xml|json|webmanifest|png|ico|svg)$/.test(route)?'asset':'page';
await Promise.all(Array.from({length:8},async()=>{while(cursor<routes.length){const route=routes[cursor++];const res=await fetch((process.env.DESIGN_BASE_URL ?? 'https://personal-design.localhost')+route);const html=await res.text();results.push({route,status:res.status,kind:kind(route),hasMain:html.includes('<main')});}}));
const failed=results.filter(r=>r.status!==(r.route==='/_not-found'?404:200)||(r.kind==='page'&&!r.hasMain));
await writeFile('docs/design/execution/evidence/routes.json',JSON.stringify({total:results.length,failed,results},null,2)+'\n');console.log(JSON.stringify({total:results.length,failed}));if(failed.length)process.exitCode=1;
