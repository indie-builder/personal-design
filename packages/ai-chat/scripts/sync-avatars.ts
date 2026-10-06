import { execFileSync } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeRuntime } from '@effect/platform-node';
import { Data, Effect, Schema } from 'effect';
import sharp from 'sharp';

class AvatarInputError extends Data.TaggedError('AvatarInput')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

class AvatarStepError extends Data.TaggedError('AvatarStep')<{
  readonly step: string;
  readonly cause: unknown;
}> {}

const step = <A>(name: string, run: () => A | Promise<A>) =>
  Effect.tryPromise({
    try: async () => run(),
    catch: (cause) => new AvatarStepError({ step: name, cause }),
  });

const metadataSchema = Schema.Struct({
  images: Schema.Array(
    Schema.Union([
      Schema.Struct({
        file: Schema.optionalKey(Schema.Unknown),
        gender: Schema.optionalKey(Schema.Unknown),
      }),
      Schema.String,
      Schema.Number,
      Schema.Boolean,
      Schema.Array(Schema.Unknown),
    ]),
  ),
});
const genderSchema = Schema.Literals(['male', 'female']);
const genderMessage = 'Missing avatar gender metadata; no output was changed.';

const program = Effect.gen(function* () {
  const archive = process.argv[2];
  if (!archive) {
    return yield* Effect.fail(
      new AvatarInputError({
        message: 'Usage: pnpm sync:ai-chat-avatars /path/to/young-avatars-20.zip',
      }),
    );
  }
  const entries = yield* step('list', () =>
    execFileSync('unzip', ['-Z1', resolve(archive)], { encoding: 'utf8' })
      .split('\n')
      .filter((name) => /^young-avatars-20\/waker-young-\d{3}\.png$/.test(name))
      .sort(),
  );
  if (
    entries.length !== 20 ||
    entries.some((name, i) => !name.endsWith(`${String(i + 1).padStart(3, '0')}.png`))
  ) {
    return yield* Effect.fail(
      new AvatarInputError({
        message: 'Expected the 20 numbered avatar PNGs; no output was changed.',
      }),
    );
  }
  const metadataJson = yield* step('prompts', () =>
    JSON.parse(
      execFileSync('unzip', ['-p', resolve(archive), 'young-avatars-20/prompts.json'], {
        encoding: 'utf8',
      }),
    ),
  );
  const images = yield* Effect.try({
    try: () => {
      const metadata = Schema.decodeUnknownSync(metadataSchema)(metadataJson);
      const genders = new Map(
        metadata.images.map((image) => [
          Reflect.get(Object(image), 'file'),
          Reflect.get(Object(image), 'gender'),
        ]),
      );
      return entries.map((entry, index) => ({
        entry,
        id: index + 1,
        filename: `${String(index + 1).padStart(3, '0')}.webp`,
        gender: Schema.decodeUnknownSync(genderSchema)(genders.get(basename(entry))),
      }));
    },
    catch: (cause) => new AvatarInputError({ message: genderMessage, cause }),
  });
  if (!images.some((image) => image.gender === 'male')) {
    return yield* Effect.fail(new AvatarInputError({ message: genderMessage }));
  }
  const directory = fileURLToPath(
    new URL('../../../apps/web/public/ai-chat/avatars/', import.meta.url),
  );
  yield* step('mkdir', () => mkdir(directory, { recursive: true }));
  const avatars = yield* Effect.all(
    images.map((image) =>
      Effect.gen(function* () {
        const destination = resolve(directory, image.filename);
        const source = yield* step(`unzip:${image.entry}`, () =>
          execFileSync('unzip', ['-p', resolve(archive), image.entry], {
            maxBuffer: 8 * 1024 * 1024,
          }),
        );
        yield* step(`webp:${image.filename}`, () =>
          sharp(source)
            .resize(192, 192, { fit: 'cover' })
            .webp({ quality: 90 })
            .withExif({
              IFD0: { ImageDescription: `User-provided ${basename(archive)} / ${image.entry}` },
            })
            .toFile(`${destination}.part`),
        );
        yield* step(`rename:${image.filename}`, () => rename(`${destination}.part`, destination));
        return {
          id: image.id,
          url: `/ai-chat/avatars/${image.filename}`,
          gender: image.gender,
        };
      }),
    ),
    { concurrency: 4 },
  );
  const manifest = new URL('../src/avatars.json', import.meta.url);
  const temporaryManifest = new URL('../src/avatars.json.part', import.meta.url);
  yield* step('manifest:write', () =>
    writeFile(temporaryManifest, `${JSON.stringify(avatars, null, 2)}\n`),
  );
  yield* step('manifest:rename', () => rename(temporaryManifest, manifest));
  console.log(`Synced ${avatars.length} avatars (192px WebP).`);
});

NodeRuntime.runMain(program);
