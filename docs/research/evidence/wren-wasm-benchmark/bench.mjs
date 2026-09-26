// Failure checks defined up front: both engines must match independently
// calculated sums/counts, all repeats must agree, and each case uses a fresh process.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
const root = new URL('.', import.meta.url).pathname;
const sql = `SELECT region, SUM(amount) AS total, COUNT(*) AS cnt FROM Orders WHERE status = 'paid' AND day >= 30 AND day < 300 GROUP BY region ORDER BY region`;
const sizes = [100000, 1000000];
const modes = ['wren-json', 'wren-csv', 'wren-parquet', 'duckdb-csv', 'duckdb-file'];
const median = a => [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const rounded = n => Math.round(n*10)/10;
const mode = process.argv[2];
if (!mode) {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  for (const n of sizes) {
    const db = await DuckDBInstance.create(resolve(root, `${n}.duckdb`), {threads:'1'});
    const c = await db.connect();
    await c.run(`CREATE TABLE orders AS SELECT i::BIGINT AS id, 'r' || (i % 20)::VARCHAR AS region, (i % 365)::BIGINT AS day, ((i * 17) % 100000)::BIGINT AS amount, CASE WHEN i % 7 = 0 THEN 'cancelled' ELSE 'paid' END AS status FROM range(${n}) t(i)`);
    await c.run(`COPY orders TO '${root}${n}.csv' (HEADER)`);
    await c.run(`COPY orders TO '${root}${n}.json' (FORMAT JSON, ARRAY true)`);
    await c.run(`COPY orders TO '${root}${n}.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)`);
    await c.run('CHECKPOINT');
    c.closeSync(); db.closeSync();
    const expected = new Map();
    for(let i=0;i<n;i++) {
      if(i%7===0 || i%365<30 || i%365>=300) continue;
      const k=`r${i%20}`, row=expected.get(k)||{region:k,total:0,cnt:0};
      row.total+=(i*17)%100000; row.cnt++; expected.set(k,row);
    }
    writeFileSync(resolve(root, `${n}.expected.json`),JSON.stringify([...expected.values()].sort((a,b)=>a.region < b.region ? -1 : 1)));
  }
  const results=[];
  for (const n of sizes) for (const m of modes) {
    const child=spawnSync(process.execPath,[new URL(import.meta.url).pathname,m,String(n)],{encoding:'utf8',timeout:90000,maxBuffer:2_000_000});
    assert.equal(child.status,0,`${m}/${n}: ${child.stderr}`);
    const result=JSON.parse(child.stdout); results.push(result); console.log(JSON.stringify(result));
  }
  writeFileSync(resolve(root,'results.json'),JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:'Apple M2 Max',ram_gib:64,wren:'0.4.1',duckdb_node:'1.5.5-r.5',query:sql,warm_repeats:5,results},null,2));
} else {
  const n=Number(process.argv[3]);
  const expected=JSON.parse(readFileSync(resolve(root,`${n}.expected.json`),'utf8'));
  const t0=performance.now();
  let query,close,init_ms,load_ms;
  if (mode.startsWith('wren-')) {
    const { WrenEngine }=await import('@wrenai/wren-core-wasm');
    const bytes=readFileSync(resolve(root,'node_modules/@wrenai/wren-core-wasm/dist/wren_core_wasm_bg.wasm'));
    const engine=await WrenEngine.init({wasmUrl:bytes}); init_ms=performance.now()-t0;
    const t=performance.now();
    if(mode==='wren-json') await engine.registerJson('orders',JSON.parse(readFileSync(resolve(root,`${n}.json`),'utf8')));
    else if(mode==='wren-csv') await engine.registerCsv('orders',readFileSync(resolve(root,`${n}.csv`)));
    else await engine.registerParquet('orders',readFileSync(resolve(root,`${n}.parquet`)));
    await engine.loadMDL({catalog:'wren',schema:'public',models:[{name:'Orders',tableReference:{table:'orders'},primaryKey:'id',columns:[{name:'id',type:'BIGINT'},{name:'region',type:'VARCHAR'},{name:'day',type:'BIGINT'},{name:'amount',type:'BIGINT'},{name:'status',type:'VARCHAR'}]}],relationships:[],views:[]},{source:''});
    load_ms=performance.now()-t; query=()=>engine.query(sql); close=()=>engine.free();
  } else {
    const { DuckDBInstance }=await import('@duckdb/node-api');
    const db=await DuckDBInstance.create(mode==='duckdb-file'?resolve(root,`${n}.duckdb`):':memory:',{threads:'1',...(mode==='duckdb-file'?{access_mode:'READ_ONLY'}:{})});
    const c=await db.connect(); init_ms=performance.now()-t0;
    const t=performance.now();
    if(mode==='duckdb-csv') await c.run(`CREATE TABLE Orders AS SELECT * FROM read_csv('${root}${n}.csv', header=true, columns={'id':'BIGINT','region':'VARCHAR','day':'BIGINT','amount':'BIGINT','status':'VARCHAR'})`);
    load_ms=performance.now()-t;
    query=async()=>{ const r=await c.runAndReadAll(sql); return r.getRowObjects(); };
    close=()=>{c.closeSync();db.closeSync();};
  }
  const normalize=rows=>rows.map(r=>({region:r.region,total:Number(r.total),cnt:Number(r.cnt)}));
  let t=performance.now(); const first=await query(); const first_query_ms=performance.now()-t;
  assert.deepEqual(normalize(first),expected);
  const warm=[];
  for(let i=0;i<5;i++){t=performance.now(); const result=await query();warm.push(performance.now()-t);assert.deepEqual(normalize(result),expected);}
  console.log(JSON.stringify({mode,rows:n,init_ms:rounded(init_ms),load_ms:rounded(load_ms),first_query_ms:rounded(first_query_ms),warm_median_ms:rounded(median(warm)),warm_ms:warm.map(rounded),peak_process_rss_mib:rounded(process.resourceUsage().maxRSS/1024),file_mib:Object.fromEntries(['csv','json','parquet','duckdb'].map(ext=>[ext,rounded(statSync(resolve(root,`${n}.${ext}`)).size/1024/1024)])),correct:true}));
  close();
}
