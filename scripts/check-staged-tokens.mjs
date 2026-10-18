import { spawn, spawnSync } from 'node:child_process';

const maxBytes = 20_000;

function git(args, input) {
  const result = spawnSync('git', args, {
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || 'Git command failed');
  }
  return result.stdout;
}

function isBinary(oid) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', 'blob', oid], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let inspected = 0;
    let binary = false;
    child.stdout.on('data', (chunk) => {
      // Git's binary heuristic inspects the first 8,000 bytes for NUL.
      if (inspected < 8_000) {
        const prefix = chunk.subarray(0, 8_000 - inspected);
        binary ||= prefix.includes(0);
        inspected += prefix.length;
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`Cannot inspect staged blob ${oid}`));
      else resolve(binary);
    });
  });
}

async function check() {
  const diffArgs = [
    'diff',
    '--cached',
    '--no-renames',
    '--no-ext-diff',
    '--no-textconv',
    '--diff-filter=ACMT',
  ];
  const entries = git([...diffArgs, '--raw', '--no-abbrev', '-z']).split('\0');
  const files = [];
  for (let i = 0; i < entries.length - 1; i += 2) {
    const [, mode, , oid] = entries[i].split(' ');
    if (mode === '100644' || mode === '100755') files.push({ path: entries[i + 1], oid });
  }
  if (!files.length) return;

  const attrs = git(
    ['check-attr', '--cached', '-z', '--stdin', 'linguist-generated', 'linguist-vendored'],
    `${files.map((file) => file.path).join('\0')}\0`,
  ).split('\0');
  const exempt = new Set();
  for (let i = 0; i < attrs.length - 1; i += 3) {
    if (attrs[i + 2] === 'set' || attrs[i + 2] === 'true') exempt.add(attrs[i]);
  }
  const candidates = files.filter((file) => !exempt.has(file.path));
  if (!candidates.length) return;
  const sizes = git(
    ['cat-file', '--batch-check=%(objectsize)'],
    `${candidates.map((file) => file.oid).join('\n')}\n`,
  )
    .trim()
    .split('\n');
  const oversized = [];
  for (let i = 0; i < candidates.length; i++) {
    const bytes = Number(sizes[i]);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Cannot read staged blob size');
    if (bytes > maxBytes && !(await isBinary(candidates[i].oid))) {
      oversized.push({ path: candidates[i].path, bytes });
    }
  }
  if (!oversized.length) return;

  console.error(
    'Commit blocked: staged authored files exceed 5,000 tokens (20,000 bytes; tokens = bytes / 4).',
  );
  for (const file of oversized) {
    console.error(`  ${JSON.stringify(file.path)}: ${file.bytes / 4} tokens (${file.bytes} bytes)`);
  }
  console.error(`
Split each listed file into cohesive files of at most 20,000 bytes:
  1. Move independent UI components into separate component files.
  2. Extract helpers or domain logic into focused modules; update imports and exports.
  3. Move hand-authored data, fixtures or documentation sections into separate files.
  4. Run relevant checks, then stage every split file with git add and retry the commit.
For actual codegen or imported files only, declare their exact paths in .gitattributes
with linguist-generated=true or linguist-vendored=true, then stage .gitattributes.`);
  process.exitCode = 1;
}

try {
  await check();
} catch (error) {
  console.error(`Staged token check failed: ${error.message}`);
  process.exitCode = 1;
}
