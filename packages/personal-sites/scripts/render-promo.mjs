import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

const extraArgs = process.argv.slice(2);
// Remotion 默认 3000，常被 Docker 等占用；未显式指定时挑一个空闲端口。
const hasPort = extraArgs.some((arg) => arg === '--port' || arg.startsWith('--port='));
const port = hasPort
  ? null
  : await new Promise((resolve, reject) => {
      const server = createServer();
      server.unref();
      server.once('error', reject);
      server.listen(0, () => {
        const { port } = server.address();
        server.close(() => resolve(port));
      });
    });

const common = ['promo/src/index.tsx', 'PersonalSitePromo'];
const options = [
  '--public-dir=promo/public',
  ...(port ? [`--port=${port}`] : []),
  ...extraArgs,
];
for (const args of [
  [
    'render',
    ...common,
    'promo/out/promo.mp4',
    '--codec=h264',
    '--muted',
    '--crf=19',
    '--pixel-format=yuv420p',
    '--concurrency=2',
    ...options,
  ],
  ['still', ...common, 'promo/out/poster.png', '--frame=75', ...options],
]) {
  const result = spawnSync('remotion', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
