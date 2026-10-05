import {
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = 'skills-lock.json';
const policyPath = 'scripts/skills-policy.json';
const entityRoot = '.agents/skills';
const claudeRoot = '.claude/skills';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const skillName = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const sourcePath = (value) =>
  text(value) &&
  !isAbsolute(value) &&
  !/^[A-Za-z]:/.test(value) &&
  !value.includes('\\') &&
  value.split('/').every((part) => part && part !== '.' && part !== '..') &&
  (value === 'SKILL.md' || value.endsWith('/SKILL.md'));

// JSON.parse silently overwrites duplicate keys. Inspect tokens only after syntax validation.
function duplicateKeys(source) {
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}[\],:]|[^{}[\],:\s]+/g);
  const duplicates = [];
  let index = 0;
  function visit() {
    const token = tokens[index++];
    if (token === '{') {
      const keys = new Set();
      while (tokens[index] !== '}') {
        const key = JSON.parse(tokens[index++]);
        if (keys.has(key)) duplicates.push(key);
        keys.add(key);
        index++; // colon
        visit();
        if (tokens[index] === ',') index++;
      }
      index++;
    } else if (token === '[') {
      while (tokens[index] !== ']') {
        visit();
        if (tokens[index] === ',') index++;
      }
      index++;
    }
  }
  visit();
  return duplicates;
}

function declaredName(source) {
  const frontmatter = source
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .match(/^---\n([\s\S]*?)\n---(?:\n|$)/)?.[1];
  if (!frontmatter) throw new Error('missing or unterminated frontmatter');
  const names = [...frontmatter.matchAll(/^name:[ \t]*([^\n]*)$/gm)];
  if (names.length !== 1) throw new Error('frontmatter requires exactly one name');
  const scalar = names[0][1].match(/^(?:"([^"\n]*)"|'([^'\n]*)'|([^\s#"']+))(?:[ \t]+#.*|[ \t]*)$/);
  const name = scalar && (scalar[1] ?? scalar[2] ?? scalar[3]);
  if (!skillName(name)) throw new Error('invalid frontmatter name; expected a simple skill name');
  return name;
}

export function checkSkills(root = repositoryRoot) {
  const result = {
    errors: [],
    counts: { locked: 0, local: 0, entities: 0, claude: 0 },
    inventory: [],
    excluded: [],
  };
  const fail = (context, message) => result.errors.push(`${context}: ${message}`);
  try {
    root = realpathSync(root);
    if (!statSync(root).isDirectory()) throw new Error('expected a directory');
  } catch (error) {
    fail('root', `cannot read repository directory (${error.message})`);
    return result;
  }
  function readJson(file) {
    try {
      const source = readFileSync(join(root, file), 'utf8');
      const value = JSON.parse(source);
      const duplicates = duplicateKeys(source);
      if (duplicates.length) throw new Error(`duplicate JSON keys: ${duplicates.join(', ')}`);
      return value;
    } catch (error) {
      fail(file, `cannot read valid JSON (${error.message})`);
      return null;
    }
  }
  const lock = readJson(lockPath);
  const policy = readJson(policyPath);
  if (!object(lock) || lock.version !== 1 || !object(lock.skills)) {
    fail(lockPath, 'expected version 1 and a skills object');
  }
  if (
    !object(policy) ||
    policy.version !== 1 ||
    !object(policy.localSkills) ||
    !object(policy.excludedSkills)
  ) {
    fail(policyPath, 'expected version 1, localSkills and excludedSkills objects');
  }
  if (result.errors.length) return result;

  const locked = new Set();
  for (const [name, entry] of Object.entries(lock.skills)) {
    if (!skillName(name)) {
      fail(lockPath, `invalid skill name: ${JSON.stringify(name)}`);
      continue;
    }
    locked.add(name);
    const context = `${lockPath}/${name}`;
    if (!object(entry)) {
      fail(context, 'expected lock metadata object');
      continue;
    }
    for (const field of ['source', 'sourceType']) {
      if (!text(entry[field])) fail(context, `missing or invalid ${field}`);
    }
    if (!sourcePath(entry.skillPath))
      fail(context, 'invalid skillPath; expected relative SKILL.md');
    if (typeof entry.computedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.computedHash)) {
      fail(context, 'missing or invalid computedHash');
    }
    if (Object.hasOwn(entry, 'ref') && !text(entry.ref)) fail(context, 'invalid ref');
    if (text(entry.source)) result.inventory.push({ name, source: entry.source });
  }
  function policyNames(field) {
    const names = new Set();
    for (const [name, reason] of Object.entries(policy[field])) {
      if (!skillName(name)) {
        fail(`${policyPath}/${field}`, `invalid skill name: ${JSON.stringify(name)}`);
        continue;
      }
      names.add(name);
      if (!text(reason)) fail(`${policyPath}/${field}/${name}`, 'expected a nonempty reason');
    }
    return names;
  }
  const local = policyNames('localSkills');
  const excluded = policyNames('excludedSkills');
  for (const name of local) {
    if (locked.has(name)) fail(policyPath, `${name} is local but also has an upstream lock entry`);
    else result.inventory.push({ name, source: 'local' });
    if (excluded.has(name)) fail(policyPath, `${name} is both local and excluded`);
  }
  for (const name of excluded) {
    if (locked.has(name)) fail(lockPath, `${name} is excluded but remains in the lock`);
  }
  result.counts.locked = Object.keys(lock.skills).length;
  result.counts.local = Object.keys(policy.localSkills).length;
  result.inventory.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  result.excluded = [...excluded].sort();
  const expected = new Set([...locked, ...local]);

  function storage(directory) {
    const full = join(root, directory);
    try {
      if (!lstatSync(full).isDirectory() || realpathSync(full) !== full) {
        fail(directory, 'expected a real directory without symbolic links');
        return [];
      }
      return readdirSync(full, { withFileTypes: true })
        .filter((entry) => !(entry.name === '.DS_Store' && entry.isFile()))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    } catch (error) {
      fail(directory, `missing or unreadable directory (${error.message})`);
      return [];
    }
  }
  const entities = storage(entityRoot);
  const links = storage(claudeRoot);
  result.counts.entities = entities.filter((entry) => entry.isDirectory()).length;
  result.counts.claude = links.filter((entry) => entry.isSymbolicLink()).length;
  const entityNames = new Set(entities.map((entry) => entry.name));
  const linkNames = new Set(links.map((entry) => entry.name));
  for (const name of expected) {
    if (!entityNames.has(name)) fail(join(entityRoot, name), 'missing skill entity');
    if (!linkNames.has(name)) fail(join(claudeRoot, name), 'missing Claude link');
  }

  const declared = new Map();
  for (const entry of entities) {
    const name = entry.name;
    const context = join(entityRoot, name);
    if (!skillName(name)) fail(context, 'invalid skill name');
    if (!expected.has(name))
      fail(context, 'unregistered skill entity; register its actual provenance');
    if (excluded.has(name)) fail(context, 'excluded skill entity remains installed');
    if (!entry.isDirectory()) {
      fail(context, 'expected a real entity directory, not a file or symbolic link');
      continue;
    }
    const file = join(context, 'SKILL.md');
    try {
      if (!lstatSync(join(root, file)).isFile()) {
        fail(file, 'expected a readable regular file, not a directory or symbolic link');
        continue;
      }
      const skill = declaredName(readFileSync(join(root, file), 'utf8'));
      if (skill !== name) fail(file, `frontmatter name ${skill} does not match directory ${name}`);
      if (declared.has(skill))
        fail(file, `duplicate skill name ${skill}; also in ${declared.get(skill)}`);
      else declared.set(skill, file);
    } catch (error) {
      fail(file, `missing, unreadable or invalid SKILL.md (${error.message})`);
    }
  }

  for (const entry of links) {
    const name = entry.name;
    const context = join(claudeRoot, name);
    const full = join(root, context);
    if (!skillName(name)) fail(context, 'invalid skill name');
    if (!expected.has(name))
      fail(context, 'orphan Claude entry; no locked or registered local skill');
    if (excluded.has(name)) fail(context, 'excluded skill Claude entry remains installed');
    if (!entry.isSymbolicLink()) {
      fail(context, 'expected a symbolic link; independent copies are not allowed');
      continue;
    }
    try {
      const target = `../../.agents/skills/${name}`;
      if (readlinkSync(full) !== target) fail(context, `link target must be exactly ${target}`);
      const actual = realpathSync(full);
      if (actual !== join(root, entityRoot, name)) {
        fail(context, `resolves to wrong entity: ${relative(root, actual)}`);
      }
      if (!statSync(actual).isDirectory())
        fail(context, 'Claude link must resolve to an entity directory');
    } catch (error) {
      fail(context, `broken Claude link or unreadable target (${error.message})`);
    }
  }
  return result;
}

const usage = [
  'Usage: node scripts/check-skills.mjs [--root <directory>] [--list]',
  'Read-only offline inventory check; --list groups installed names by locked source and local policy.',
  'No network access, upstream freshness verification, writes, or deletions.',
].join('\n');

function main(args) {
  let root = repositoryRoot;
  let list = false;
  let suppliedRoot = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') {
      console.log(usage);
      return;
    }
    if (arg === '--list') list = true;
    else if (
      arg === '--root' &&
      !suppliedRoot &&
      args[index + 1] &&
      !args[index + 1].startsWith('-')
    ) {
      root = resolve(args[++index]);
      suppliedRoot = true;
    } else {
      console.error(`Invalid argument or missing option value: ${arg}\n${usage}`);
      process.exitCode = 2;
      return;
    }
  }
  const result = checkSkills(root);
  if (list) {
    const sources = new Map();
    for (const { name, source } of result.inventory) {
      if (!sources.has(source)) sources.set(source, []);
      sources.get(source).push(name);
    }
    for (const source of [...sources.keys()].sort()) {
      const names = sources.get(source);
      console.log(`${source} (${names.length}): ${names.join(', ')}`);
    }
    console.log(`excluded (${result.excluded.length}): ${result.excluded.join(', ') || '(none)'}`);
  }
  const { locked, local, entities, claude } = result.counts;
  console.log(
    `Skill checks ${result.errors.length ? 'failed' : 'passed'}: ${locked} locked, ${local} local, ${entities} entities, ${claude} Claude links.`,
  );
  if (result.errors.length) {
    console.error(result.errors.join('\n'));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
