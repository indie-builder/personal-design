import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function testFixture(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const remove = (file = '') => rmSync(join(root, file), { recursive: true, force: true });
  const write = (file, contents) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  };
  t.after(() => remove());
  return { root, write, remove };
}
