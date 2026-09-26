import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateEntry } from './translate-claude.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const path = join(root, 'catalog.json');
const catalog = JSON.parse(await readFile(path, 'utf8'));
const terms = catalog.entries.map((entry) => entry.term).sort((a, b) => b.length - a.length);
const limit = process.argv[2] ? Number(process.argv[2]) : Infinity;
if (!(limit > 0)) throw new Error('Backfill limit must be a positive number');

let completed = 0;
for (const [index, entry] of catalog.entries.entries()) {
  if (
    entry.body.zh.length === entry.body.en.length &&
    entry.body.zh.every(
      (text, paragraph) =>
        text.trim() && (entry.body.en[paragraph]?.length <= 80 || /\p{Script=Han}/u.test(text)),
    )
  )
    continue;
  catalog.entries[index] = translateEntry(entry, terms);
  if (
    catalog.entries[index].body.zh.length !== entry.body.en.length ||
    catalog.entries[index].body.zh.some(
      (text, paragraph) =>
        !text.trim() || (entry.body.en[paragraph]?.length > 80 && !/\p{Script=Han}/u.test(text)),
    )
  )
    throw new Error(`Incomplete Chinese translation for ${entry.term}`);
  await writeFile(`${path}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`);
  await rename(`${path}.tmp`, path);
  completed++;
  console.log(`已完整翻译 ${entry.term}（${completed} 条）`);
  if (completed >= limit) break;
}
console.log(`本次完成 ${completed} 条；词典共 ${catalog.entries.length} 条`);
