import { spawnSync } from 'node:child_process';

const common = ['promo/src/index.tsx', 'PersonalSitePromo'];
const options = ['--public-dir=promo/public', ...process.argv.slice(2)];
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
