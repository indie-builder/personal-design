import { copyFile, mkdir, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { Data, Effect } from 'effect';
import { NodeRuntime } from '@effect/platform-node';

// 2026-09-09 截取自 https://default-coder.lovemyrmb.cn/ 的公开首页。
// 更换 assets/home.jpg 后重跑即可更新本地预览，不读取原项目私有数据。

class SyncStepError extends Data.TaggedError('SyncStep')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const step = <A>(name: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: () => run(),
    catch: (cause) => new SyncStepError({ step: name, cause }),
  });

const output = new URL('../../../apps/web/public/personal-sites/', import.meta.url);

const pages = Effect.all(
  ['home', 'news', 'curation', 'open-source'].map((name) =>
    step(`webp:${name}`, () =>
      sharp(new URL(`../assets/${name}.jpg`, import.meta.url).pathname)
        .resize({ width: name === 'home' ? 1080 : 1512, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toFile(new URL(`${name}.webp`, output).pathname),
    ),
  ),
  // 四页图片互不依赖，并行渲染。
  { concurrency: 4 },
);

const program = Effect.gen(function* () {
  yield* step('mkdir', () => mkdir(output, { recursive: true }));
  yield* pages;
  // Existing profile portrait from the user's personal website.
  yield* step('webp:profile-avatar', () =>
    sharp(new URL('../assets/profile-avatar.png', import.meta.url).pathname)
      .resize(128, 128)
      .webp({ quality: 92 })
      .toFile(new URL('profile-avatar.webp', output).pathname),
  );
  // 宣传片由本包的 Remotion 工程生成；先 render:promo，再同步。
  yield* step('copy:promo.mp4', () =>
    copyFile(new URL('../promo/out/promo.mp4', import.meta.url), new URL('promo.mp4', output)),
  );
  yield* step('webp:promo-poster', () =>
    sharp(new URL('../promo/out/poster.png', import.meta.url).pathname)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 88 })
      .toFile(new URL('promo-poster.webp', output).pathname),
  );
  yield* Effect.all(
    ['walkthrough.mp4', 'timeline-avatar.webp', 'timeline-avatar-full.webp'].map((name) =>
      step(`rm:${name}`, () => rm(new URL(name, output), { force: true })),
    ),
    { concurrency: 'unbounded' },
  );
});

// runMain 处理 SIGINT 与非零退出，替代裸 top-level await。
NodeRuntime.runMain(program);
