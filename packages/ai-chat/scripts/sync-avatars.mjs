import { execFileSync } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const archive = process.argv[2];
if (!archive) throw new Error('Usage: pnpm sync:ai-chat-avatars /path/to/young-avatars-20.zip');
const entries = execFileSync('unzip', ['-Z1', resolve(archive)], { encoding: 'utf8' })
  .split('\n')
  .filter((name) => /^young-avatars-20\/waker-young-\d{3}\.png$/.test(name))
  .sort();
if (
  entries.length !== 20 ||
  entries.some((name, i) => !name.endsWith(`${String(i + 1).padStart(3, '0')}.png`))
) {
  throw new Error('Expected the 20 numbered avatar PNGs; no output was changed.');
}
const metadata = JSON.parse(
  execFileSync('unzip', ['-p', resolve(archive), 'young-avatars-20/prompts.json'], {
    encoding: 'utf8',
  }),
);
const genders = new Map(metadata.images.map((image) => [image.file, image.gender]));
if (
  entries.some((entry) => !['male', 'female'].includes(genders.get(basename(entry)))) ||
  !entries.some((entry) => genders.get(basename(entry)) === 'male')
) {
  throw new Error('Missing avatar gender metadata; no output was changed.');
}
const directory = fileURLToPath(
  new URL('../../../apps/web/public/ai-chat/avatars/', import.meta.url),
);
await mkdir(directory, { recursive: true });
const avatars = [];
for (const [index, entry] of entries.entries()) {
  const filename = `${String(index + 1).padStart(3, '0')}.webp`;
  const destination = resolve(directory, filename);
  const source = execFileSync('unzip', ['-p', resolve(archive), entry], {
    maxBuffer: 8 * 1024 * 1024,
  });
  await sharp(source)
    .resize(192, 192, { fit: 'cover' })
    .webp({ quality: 90 })
    .withExif({ IFD0: { ImageDescription: `User-provided ${basename(archive)} / ${entry}` } })
    .toFile(`${destination}.part`);
  await rename(`${destination}.part`, destination);
  avatars.push({
    id: index + 1,
    url: `/ai-chat/avatars/${filename}`,
    gender: genders.get(basename(entry)),
  });
}
const manifest = new URL('../src/avatars.json', import.meta.url);
await writeFile(
  new URL('../src/avatars.json.part', import.meta.url),
  `${JSON.stringify(avatars, null, 2)}\n`,
);
await rename(new URL('../src/avatars.json.part', import.meta.url), manifest);
console.log(`Synced ${avatars.length} avatars (192px WebP).`);
