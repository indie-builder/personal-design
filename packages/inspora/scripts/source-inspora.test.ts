import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scripts, '../../..');
const effect = import.meta.resolve('effect');
const rsc = (value: unknown) =>
  `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(value))}])</script>`;
const feed = (items: unknown[], nextCursor: string | null = null) =>
  rsc({ initialPage: { items, nextCursor } });

async function browserProbe(mode: string, expectedError?: string) {
  const fixture = {
    mode,
    feed: feed(
      mode === 'details'
        ? [
            { id: 'bad', slug: 'bad', title: 'bad', createdAt: '2026' },
            { id: 'good', slug: 'good', title: 'good', createdAt: '2026' },
          ]
        : [],
      mode === 'pagination' || mode === 'invalid' ? 'next' : null,
    ),
    detail: rsc({
      id: 'good',
      slug: 'good',
      title: 'good',
      createdAt: '2026',
      sourceUrl: 'https://x.com/a/status/1',
    }),
  };
  const playwright = `const fixture = ${JSON.stringify(fixture)};
let closes = 0;
export const chromium = { launch: async () => {
  if (fixture.mode === 'launch') throw Error('launch failed');
  return { close: async () => { closes++; console.log('CLOSE:' + closes); if (fixture.mode === 'close') throw Error('close failed'); }, newPage: async () => {
    if (fixture.mode === 'page') throw Error('page failed');
    return { goto: async () => {}, title: async () => 'Inspora', locator: () => ({ evaluateAll: async () => ['Web'] }), evaluate: async (_, {url}) => {
      console.log('FETCH:' + url);
      if (fixture.mode === 'defect') { const error = Error('program defect'); error.name = 'AssertionError'; throw error; }
      if (url.includes('/posts/bad')) return {status: 200, challenge: null, body: ''};
      if (url.includes('/posts/good')) return {status: 200, challenge: null, body: fixture.detail};
      if (fixture.mode === 'ego' || fixture.mode === 'control' || fixture.mode === 'interrupt' || fixture.mode === 'utf8') return {status: 429, challenge: 'challenge', body: ''};
      if (url.includes('cursor=') && fixture.mode === 'invalid') return {status: 200, challenge: null, body: '{}'};
      if (url.includes('cursor=')) return {status: 503, challenge: null, body: ''};
      return {status: 200, challenge: null, body: fixture.feed};
    } };
  } };
} };
`;
  const unicodeResponse = JSON.stringify({
    status: 200,
    challenge: null,
    body: feed([{ id: '中文', slug: '中文', title: '中文', createdAt: '2026' }]),
  });
  const unicodeCode = `const data = Buffer.from(${JSON.stringify('SYNC_RESULT:' + unicodeResponse)}); const index = data.indexOf(Buffer.from('中')); process.stdout.write(data.subarray(0, index + 1)); setTimeout(() => process.stdout.end(data.subarray(index + 1)), 10);`;
  const childProcess = `export const spawn = (_, args, options) => {
  const cleanup = args[1].includes('completeTaskSpace');
  const fixture = ${JSON.stringify(mode)};
  const code = cleanup ? "console.log('CLEANUP'); process.exitCode = 1;" : fixture === 'control' ? "process.exitCode = 1;" : fixture === 'utf8' ? ${JSON.stringify(unicodeCode)} : fixture === 'interrupt' ? "const {spawn} = require('node:child_process'); const child = spawn('/bin/sleep', ['30'], {stdio:'inherit'}); console.log('GRANDPID:' + child.pid);" : ${JSON.stringify("console.log('SYNC_RESULT:' + JSON.stringify({status:503,challenge:null,body:''}));")};
  const child = globalThis.realSpawn(process.execPath, ['-e', code], options);
  child.stdout.on('data', (chunk) => {
    if (cleanup) console.log(chunk.toString().trim());
    const match = /GRANDPID:(\\d+)/.exec(chunk.toString());
    if (match) { console.log(match[0]); setTimeout(() => process.kill(process.pid, 'SIGINT'), 20); }
  });
  child.once('close', () => { if (!cleanup) console.log('REQUEST_CLOSED'); });
  return child;
};`;
  const downloads = `import {Effect, Schedule} from ${JSON.stringify(effect)};
export const defaultRetrySchedule = Schedule.exponential(1, 1).pipe(Schedule.upTo({times: 2}));
export const extOf = (url) => { new URL(url); return '.jpg'; };
export const download = () => { console.log('DOWNLOADED'); return Effect.succeed('downloaded'); };`;
  const probe = `import {registerHooks} from 'node:module';
import {spawn} from 'node:child_process';
globalThis.realSpawn = spawn;
registerHooks({
resolve(specifier, context, next) {
  if (specifier === 'node:child_process' && context.parentURL === ${JSON.stringify(new URL('./source-inspora.ts', import.meta.url).href)}) return {url: 'fixture:child-process',shortCircuit:true};
  return next(specifier,context);
},
load(url, context, next) {
  if (url.includes('/playwright/') && url.endsWith('index.mjs')) return {format:'module',source:${JSON.stringify(playwright)},shortCircuit:true};
  if (url === 'fixture:child-process') return {format:'module',source:${JSON.stringify(childProcess)},shortCircuit:true};
  if (url === ${JSON.stringify(new URL('./download.ts', import.meta.url).href)}) return {format:'module',source:${JSON.stringify(downloads)},shortCircuit:true};
  return next(url,context);
}});
const {Effect} = await import(${JSON.stringify(effect)});
const {openDatabase} = await import(${JSON.stringify(new URL('./db.ts', import.meta.url).href)});
const {syncInspora} = await import(${JSON.stringify(new URL('./source-inspora.ts', import.meta.url).href)});
const connection = openDatabase(':memory:');
if (${JSON.stringify(mode)} === 'urls') {
  connection.stmts.mediaNeedingDownload.all = () => [{id:'bad',type:'image',url:'invalid',raw_json:'{}'},{id:'good',type:'image',url:'https://example.com/good.jpg',raw_json:'{}'}];
  connection.stmts.creatorsNeedingAvatar.all = () => [{creator_name:'bad',avatar_url:'invalid'},{creator_name:'good',avatar_url:'https://example.com/avatar.jpg'}];
}
const controller = new AbortController();
if (${JSON.stringify(mode)} === 'interrupt') process.once('SIGINT', () => controller.abort());
try {console.log('RESULT:' + JSON.stringify(await Effect.runPromise(syncInspora({...connection,maxPages:2}), {signal: controller.signal})));}
catch(error) {console.log('ERROR:' + error.message);}
console.log('ROWS:' + connection.db.prepare('SELECT COUNT(*) AS n FROM posts').get().n);
console.log('TITLES:' + JSON.stringify(connection.db.prepare('SELECT title FROM posts').all()));
connection.db.close();`;
  const dir = await mkdtemp(path.join(tmpdir(), 'inspora-browser-test-'));
  try {
    const filename = path.join(dir, `browser-${mode}.mjs`);
    await writeFile(filename, probe);
    const result = spawnSync(process.execPath, [filename], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout + result.stderr;
    assert.equal((output.match(/CLOSE:/g) ?? []).length, mode === 'launch' ? 0 : 1, output);
    if (expectedError) assert.ok(output.includes(`ERROR:${expectedError}`), output);
    else if (mode === 'interrupt') {
      assert.ok(output.includes('REQUEST_CLOSED'), output);
      assert.ok(output.indexOf('REQUEST_CLOSED') < output.indexOf('CLEANUP'), output);
      const pid = Number(/GRANDPID:(\d+)/.exec(output)?.[1]);
      assert.ok(pid > 0, output);
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    } else assert.ok(output.includes('RESULT:'), output);
    if (mode === 'urls') {
      assert.equal((output.match(/DOWNLOADED/g) ?? []).length, 2, output);
      assert.equal((output.match(/"failed":1/g) ?? []).length, 2, output);
    }
    if (mode === 'utf8') assert.ok(output.includes('TITLES:[{"title":"中文"}]'), output);
    if (mode === 'defect') {
      assert.equal((output.match(/FETCH:/g) ?? []).length, 1, output);
    }
    if (mode === 'ego') {
      assert.equal((output.match(/CLEANUP/g) ?? []).length, 1, output);
      assert.ok(output.includes('ego-browser 清理失败: Command failed: 1'), output);
    }
    if (mode === 'control') {
      assert.equal((output.match(/FETCH:/g) ?? []).length, 1, output);
      assert.equal((output.match(/CLEANUP/g) ?? []).length, 0, output);
    }
    if (mode === 'details') {
      assert.ok(output.includes('详情补全完成: 1/2'), output);
      assert.ok(output.includes('ROWS:2'), output);
    }
    if (mode === 'pagination' || mode === 'ego') assert.ok(output.includes('ROWS:0'), output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('浏览器在成功、获取页面失败和关闭失败时只释放一次', async () => {
  await browserProbe('empty');
  await browserProbe('launch', 'launch failed');
  await browserProbe('page', 'page failed');
  await browserProbe('close', 'close failed');
});

test('详情逐条继续，最终报告部分失败', async () => {
  await browserProbe('details', '详情、媒体或头像未全部同步成功，下次增量会继续补齐');
});

test('ego 清理失败保留主错，控制失效立即停止', async () => {
  await browserProbe('ego', 'Web: HTTP 503');
  await browserProbe(
    'control',
    'ego-browser 会话不可用或控制权已改变；同步已停止，请检查浏览器后重试',
  );
});

test('ego 请求中断后先终止并等待子进程，再清理 task-space', async () => {
  await browserProbe('interrupt');
});

test('坏媒体与头像 URL 只记单条失败，继续其他下载后统一失败', async () => {
  await browserProbe('urls', '详情、媒体或头像未全部同步成功，下次增量会继续补齐');
});

test('HTTP 200 的无效分页对象是领域失败', async () => {
  await browserProbe('invalid', 'Web: 列表数据无效');
});

test('ego stdout 的中文跨 buffer 仍完整写入', async () => {
  await browserProbe('utf8', '详情、媒体或头像未全部同步成功，下次增量会继续补齐');
});

test('页面请求的程序缺陷穿透且不重试', async () => {
  await browserProbe('defect', 'program defect');
});
