import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { get } from 'node:https';
import { createServer, connect } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = join(root, '.impeccable/review/chat-checks');

export function chatEnvironment(inherited, { stateDir, proxyPort, browser = false }) {
  return {
    ...inherited,
    ZHIPU_API_KEY: 'test-only',
    ZHIPU_BASE_URL: 'http://127.0.0.1:3907/v1',
    ANALYTICS_MCP_TOKEN: browser ? 'test-only' : '',
    ANALYTICS_MCP_URL: 'http://127.0.0.1:3908/mcp',
    PORTLESS_STATE_DIR: stateDir,
    PORTLESS_PORT: String(proxyPort),
    PORTLESS_HTTPS: '1',
    PORTLESS_TLD: 'localhost',
    PORTLESS_LAN: '0',
    PORTLESS_SYNC_HOSTS: '0',
    PORTLESS_WILDCARD: '0',
    PORTLESS: '1',
    PORTLESS_APP_PORT: '',
    PORTLESS_TAILSCALE: '0',
    PORTLESS_FUNNEL: '0',
    PORTLESS_NGROK: '0',
    NODE_EXTRA_CA_CERTS: join(stateDir, 'ca.pem'),
    FORCE_COLOR: '0',
  };
}

export async function trustTestCertificate(stateDir) {
  // Portless 0.15.7 rechecks system trust even after --skip-trust. Keep the marker test-local;
  // Node uses this CA explicitly and the isolated browser context accepts test certificates.
  const fingerprint = createHash('sha256')
    .update(await readFile(join(stateDir, 'ca.pem')))
    .digest('hex');
  await writeFile(join(stateDir, 'ca.trusted'), `${fingerprint}\n`);
}

export async function requireBuild(repository = root) {
  try {
    await access(join(repository, 'apps/web/.next/BUILD_ID'));
  } catch {
    throw new Error('缺少生产构建，请先从根目录运行 pnpm build。');
  }
}

export async function waitForReady(
  check,
  { timeoutMs = 30000, intervalMs = 100, alive = () => true } = {},
) {
  const deadline = Date.now() + timeoutMs;
  const timeout = () => new Error('服务未在期限内就绪；查看本轮启动日志。');
  while (Date.now() < deadline) {
    if (!alive()) throw new Error('服务在就绪前退出；查看本轮启动日志。');
    let timer;
    try {
      const ready = await Promise.race([
        Promise.resolve()
          .then(check)
          .catch(() => false),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(timeout()), deadline - Date.now());
        }),
      ]);
      if (!alive()) throw new Error('服务在就绪前退出；查看本轮启动日志。');
      if (ready) return;
    } finally {
      clearTimeout(timer);
    }
    await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
  throw timeout();
}

const ownedGroups = new WeakMap();
const stopping = new WeakMap();
const running = (child) => child.exitCode === null && child.signalCode === null;

export function captureProcessGroups(child) {
  if (!child?.pid) return new Set();
  const groups = ownedGroups.get(child) ?? new Set([child.pid]);
  ownedGroups.set(child, groups);
  if (!running(child)) return groups;
  const rows = execFileSync('ps', ['-e', '-o', 'pid=,ppid=,pgid='], {
    encoding: 'utf8',
    timeout: 1000,
  })
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = new Set([child.pid]);
  let count;
  do {
    count = descendants.size;
    for (const [pid, parent] of rows) if (descendants.has(parent)) descendants.add(pid);
  } while (count !== descendants.size);
  // Portless starts Next in another detached group; retain it before any wrapper exits.
  for (const [pid, , group] of rows)
    if (descendants.has(pid) && descendants.has(group)) groups.add(group);
  return groups;
}

export async function stopProcess(child, { graceMs = 6000 } = {}) {
  if (!child?.pid) return;
  if (stopping.has(child)) return stopping.get(child);
  const cleanup = (async () => {
    const groups = [...captureProcessGroups(child)].reverse();
    const signal = (group, name) => {
      try {
        process.kill(-group, name);
        return true;
      } catch (error) {
        if (error.code === 'EPERM') {
          // macOS can report EPERM for a group containing only zombies awaiting reaping.
          const rows = execFileSync('ps', ['-e', '-o', 'pgid=,stat='], {
            encoding: 'utf8',
            timeout: 1000,
          })
            .trim()
            .split('\n')
            .map((line) => line.trim().split(/\s+/))
            .filter(([id]) => Number(id) === group);
          if (rows.every(([, state]) => state.startsWith('Z'))) return false;
        }
        if (error.code !== 'ESRCH') throw new Error(`进程组 ${group} ${name}: ${error.message}`);
        return false;
      }
    };
    for (const group of groups) signal(group, 'SIGTERM');
    const deadline = Date.now() + graceMs;
    while (groups.some((group) => signal(group, 0)) && Date.now() < deadline) await delay(25);
    for (const group of groups) signal(group, 'SIGKILL');
    try {
      await waitForReady(async () => groups.every((group) => !signal(group, 0)), {
        timeoutMs: 3000,
        intervalMs: 25,
      });
    } catch {
      throw new Error(`进程组 ${groups.filter((group) => signal(group, 0)).join(', ')} 未退出。`);
    }
  })();
  stopping.set(child, cleanup);
  try {
    await cleanup;
  } finally {
    stopping.delete(child);
  }
}

export async function waitForExit(
  child,
  { timeoutMs = 30000, graceMs = 6000, label = '命令' } = {},
) {
  if (!running(child)) return [child.exitCode, child.signalCode];
  try {
    return await once(child, 'exit', { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
    await stopProcess(child, { graceMs });
    throw new Error(`${label} 超时（${timeoutMs}ms）。`);
  }
}

async function freePort(preferred = 0) {
  const server = createServer();
  try {
    await new Promise((resolvePort, reject) => {
      server.once('error', reject);
      server.listen(preferred, '127.0.0.1', resolvePort);
    });
    const port = server.address().port;
    await new Promise((close) => server.close(close));
    return port;
  } catch (error) {
    server.close();
    if (preferred && error.code === 'EADDRINUSE')
      throw new Error(`测试端口 ${preferred} 已被占用；保留现有服务，请先停止占用它的测试夹具。`);
    throw error;
  }
}

function listening(port) {
  return new Promise((result) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (ok) => {
      socket.destroy();
      result(ok);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function healthy(url, certificate) {
  const ca = await readFile(certificate);
  return new Promise((result) => {
    const request = get(url, { ca, timeout: 1500 }, (response) => {
      response.resume();
      result(response.statusCode === 200);
    });
    request.once('error', () => result(false));
    request.once('timeout', () => {
      request.destroy();
      result(false);
    });
  });
}

export async function runChat({ httpOnly = false } = {}) {
  await requireBuild();
  await freePort(3907);
  if (!httpOnly) await freePort(3908);
  await mkdir(evidence, { recursive: true });
  const stateDir = await mkdtemp(join(evidence, 'portless-'));
  const proxyPort = await freePort();
  let env = chatEnvironment(process.env, { stateDir, proxyPort });
  const services = new Set();
  const logs = [];
  let interrupted = false;
  let cleaning;
  const cleanup = () =>
    (cleaning ??= (async () => {
      const results = await Promise.allSettled(
        [...services].reverse().map((child) => stopProcess(child)),
      );
      await writeFile(join(stateDir, 'routes.json'), '[]\n');
      const failed = results.filter((result) => result.status === 'rejected');
      if (failed.length)
        throw new AggregateError(
          failed.map((result) => result.reason),
          `测试进程清理失败：${failed.map((result) => result.reason.message).join('；')}`,
        );
    })());
  const start = async (command, args, name) => {
    if (interrupted) throw new Error('验收已中断。');
    const path = join(evidence, `${name}.log`);
    const output = createWriteStream(path);
    logs.push(path);
    const child = spawn(command, args, {
      cwd: root,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    child.once('close', () => output.end());
    services.add(child);
    await once(child, 'spawn');
    if (interrupted) throw new Error('验收已中断。');
    captureProcessGroups(child);
    return {
      child,
      path,
      alive: () => {
        captureProcessGroups(child);
        return !interrupted && running(child);
      },
    };
  };
  const command = async (executable, args, name, timeoutMs = 30000) => {
    const service = await start(executable, args, name);
    const [code, signal] = await waitForExit(service.child, {
      timeoutMs,
      label: `${name}；日志：${service.path}`,
    });
    await stopProcess(service.child);
    services.delete(service.child);
    if (interrupted) throw new Error('验收已中断。');
    if (code !== 0) throw new Error(`${name} 失败（${signal || code}）；日志：${service.path}`);
  };
  const interrupt = () => {
    interrupted = true;
    void cleanup().catch((error) => console.error(`清理失败：${error.message}`));
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const checks = [];
  try {
    // Fail early on broken pnpm shims rather than misdiagnosing source checks.
    await command('pnpm', ['--version'], 'pnpm-version');
    await command('portless', ['--version'], 'portless-version');
    const proxy = await start(
      'portless',
      ['proxy', 'start', '--foreground', '--port', String(proxyPort), '--https', '--skip-trust'],
      'proxy',
    );
    await waitForReady(() => listening(proxyPort), { alive: proxy.alive });
    await trustTestCertificate(stateDir);
    const fixture = await start(
      process.execPath,
      ['scripts/design-checks/fixtures/ai-chat-provider.mjs'],
      'provider',
    );
    await waitForReady(() => listening(3907), { alive: fixture.alive });
    const preview = async (name) => {
      const service = await start('pnpm', ['start'], name);
      let appPort;
      await waitForReady(
        async () => {
          const log = await readFile(service.path, 'utf8');
          appPort = log.match(/Local:\s+http:\/\/localhost:(\d+)/)?.[1];
          return !!appPort;
        },
        { alive: service.alive },
      );
      await command(
        'portless',
        ['alias', 'upgrade-check.personal-design', appPort],
        `${name}-alias`,
      );
      const base = `https://upgrade-check.personal-design.localhost:${proxyPort}`;
      await waitForReady(() => healthy(`${base}/products/ai-chat`, env.NODE_EXTRA_CA_CERTS), {
        alive: service.alive,
      });
      env = { ...env, DESIGN_BASE_URL: base, PORTFOLIO_API_BASE: base };
      console.log(`聊天隔离验收：${base}；日志：${evidence}`);
      return service;
    };
    let app = await preview('preview-http');
    await command(
      process.execPath,
      ['scripts/design-checks/run-http.mjs', 'chat-api', 'chat-analytics'],
      'http',
      180000,
    );
    checks.push('chat-api', 'chat-analytics');
    if (!httpOnly) {
      await stopProcess(app.child);
      services.delete(app.child);
      await command(
        'portless',
        ['alias', '--remove', 'upgrade-check.personal-design'],
        'http-alias-cleanup',
      );
      env = chatEnvironment(process.env, { stateDir, proxyPort, browser: true });
      const data = await start(
        process.execPath,
        ['scripts/design-checks/fixtures/analytics-mcp.mjs'],
        'data',
      );
      await waitForReady(() => listening(3908), { alive: data.alive });
      app = await preview('preview-browser');
      await command(
        process.execPath,
        ['scripts/design-checks/chat-analytics.mjs'],
        'browser',
        120000,
      );
      checks.push('analytics progress browser');
    }
    await cleanup();
    if (interrupted) throw new Error('验收已中断。');
    await writeFile(
      join(evidence, 'result.json'),
      `${JSON.stringify({ passed: true, checks, logs }, null, 2)}\n`,
    );
    console.log(`PASS：${checks.join('、')}。结果：${join(evidence, 'result.json')}`);
  } catch (error) {
    await writeFile(
      join(evidence, 'result.json'),
      `${JSON.stringify({ passed: false, checks, error: error.message, logs }, null, 2)}\n`,
    );
    throw error;
  } finally {
    try {
      await cleanup();
    } finally {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--http')) {
    console.error('用法：pnpm check:chat [--http]；先执行 pnpm build。');
    process.exitCode = 1;
  } else {
    try {
      await runChat({ httpOnly: args.includes('--http') });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
