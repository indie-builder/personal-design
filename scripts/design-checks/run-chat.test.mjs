import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  chatEnvironment,
  trustTestCertificate,
  requireBuild,
  waitForReady,
  stopProcess,
  captureProcessGroups,
  waitForExit,
} from './run-chat.mjs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

test('fixture environment overrides inherited model, MCP and proxy settings', () => {
  const env = chatEnvironment(
    {
      ZHIPU_API_KEY: 'real',
      ZHIPU_BASE_URL: 'https://real.example',
      ANALYTICS_MCP_TOKEN: 'real',
      ANALYTICS_MCP_URL: 'https://real.example',
      PORTLESS_LAN: '1',
      PORTLESS_SYNC_HOSTS: '1',
      PORTLESS_WILDCARD: '1',
      PORTLESS: '0',
      PORTLESS_APP_PORT: '3999',
      NODE_EXTRA_CA_CERTS: '/wrong',
    },
    { stateDir: '/test/state', proxyPort: 1356 },
  );
  assert.equal(env.ANALYTICS_MCP_TOKEN, '');
  assert.equal(env.ANALYTICS_MCP_URL, 'http://127.0.0.1:3908/mcp');
  assert.equal(env.ZHIPU_API_KEY, 'test-only');
  assert.equal(env.ZHIPU_BASE_URL, 'http://127.0.0.1:3907/v1');
  assert.equal(env.PORTLESS_STATE_DIR, '/test/state');
  assert.equal(env.PORTLESS_PORT, '1356');
  assert.equal(env.PORTLESS_LAN, '0');
  assert.equal(env.PORTLESS_SYNC_HOSTS, '0');
  assert.equal(env.PORTLESS_WILDCARD, '0');
  assert.equal(env.PORTLESS, '1');
  assert.equal(env.PORTLESS_APP_PORT, '');
  assert.equal(env.NODE_EXTRA_CA_CERTS, '/test/state/ca.pem');
});

test('test certificate trust marker belongs only to the dedicated state directory', async (t) => {
  const stateDir = await mkdtemp(join(tmpdir(), 'chat-ca-'));
  t.after(() => rm(stateDir, { recursive: true, force: true }));
  await assert.rejects(trustTestCertificate(stateDir), /ENOENT/);
  const certificate = 'test-only CA fixture\n';
  await writeFile(join(stateDir, 'ca.pem'), certificate);
  await trustTestCertificate(stateDir);
  assert.equal(
    (await readFile(join(stateDir, 'ca.trusted'), 'utf8')).trim(),
    createHash('sha256').update(certificate).digest('hex'),
  );
});

test('missing production build fails before starting any services', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'chat-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(requireBuild(root), /pnpm build/);
  await mkdir(join(root, 'apps/web/.next'), { recursive: true });
  await writeFile(join(root, 'apps/web/.next/BUILD_ID'), 'fixture');
  await requireBuild(root);
});

test('readiness retries transient failures and rejects startup exits or deadline', async () => {
  let attempt = 0;
  await waitForReady(async () => ++attempt >= 3, { timeoutMs: 200, intervalMs: 1 });
  assert.equal(attempt, 3);
  await assert.rejects(
    waitForReady(async () => false, { timeoutMs: 10, intervalMs: 1 }),
    /就绪|ready/,
  );
  await assert.rejects(
    waitForReady(async () => false, { alive: () => false }),
    /退出|exited/,
  );
  await assert.rejects(
    waitForReady(() => new Promise(() => {}), { timeoutMs: 10 }),
    /就绪|ready/,
  );
  let alive = true;
  await assert.rejects(
    waitForReady(
      async () => {
        alive = false;
        return true;
      },
      { alive: () => alive },
    ),
    /退出|exited/,
  );
});

test('cleanup terminates only the owned process and can be called again', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  await new Promise((resolve) => child.once('spawn', resolve));
  await stopProcess(child);
  assert.notEqual(child.signalCode, null);
  await stopProcess(child);
});

const processGone = (pid) => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
    return true;
  }
};

async function processTree(t, detached) {
  const childSource =
    'process.on("SIGTERM", () => {}); process.send("ready"); setInterval(() => {}, 1000);';
  const parentSource = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{detached:${detached},stdio:['ignore','ignore','ignore','ipc']});child.once('message',()=>process.send(child.pid));process.on('message',()=>{child.disconnect();process.exit(0);});setInterval(()=>{},1000);`;
  const parent = spawn(process.execPath, ['-e', parentSource], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const [pid] = await once(parent, 'message');
  t.after(() => {
    for (const id of [pid, parent.pid]) {
      try {
        process.kill(id, 'SIGKILL');
      } catch {}
    }
  });
  return { parent, pid };
}

test('cleanup kills a surviving same-group child after its wrapper exits', async (t) => {
  const { parent, pid } = await processTree(t, false);
  const exit = once(parent, 'exit');
  parent.send('exit');
  await exit;
  await stopProcess(parent, { graceMs: 20 });
  await waitForReady(async () => processGone(pid), { timeoutMs: 1000, intervalMs: 10 });
});

test('cleanup retains owned detached groups even after their wrapper exits', async (t) => {
  const { parent, pid } = await processTree(t, true);
  captureProcessGroups(parent);
  const exit = once(parent, 'exit');
  parent.send('exit');
  await exit;
  await stopProcess(parent, { graceMs: 20 });
  await waitForReady(async () => processGone(pid), { timeoutMs: 1000, intervalMs: 10 });
});

test('cleanup accepts an already gone group even if its final probe reports EPERM', async (t) => {
  const child = spawn(process.execPath, ['-e', ''], { detached: true, stdio: 'ignore' });
  await once(child, 'exit');
  const kill = process.kill;
  t.mock.method(process, 'kill', (pid, signal) => {
    if (pid === -child.pid) throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
    return kill(pid, signal);
  });
  await stopProcess(child, { graceMs: 20 });
});

test('a stalled child command has a deadline and is cleaned before rejecting', async (t) => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {},1000)'], {
    detached: true,
    stdio: 'ignore',
  });
  await once(child, 'spawn');
  t.after(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {}
  });
  await assert.rejects(
    waitForExit(child, { timeoutMs: 20, graceMs: 20, label: 'fixture-command' }),
    /fixture-command.*超时/,
  );
  assert(processGone(child.pid));
});
