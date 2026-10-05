import assert from 'node:assert/strict';
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkSkills } from './check-skills.mjs';
import { testFixture } from './test-fixture.mjs';

const script = fileURLToPath(new URL('./check-skills.mjs', import.meta.url));
const lockPath = 'skills-lock.json';
const policyPath = 'scripts/skills-policy.json';
const entityPath = (name) => `.agents/skills/${name}`;
const linkPath = (name) => `.claude/skills/${name}`;

function fixture(t) {
  const { root, write, remove } = testFixture(t, 'skills-');
  const link = (name, target = `../../.agents/skills/${name}`) => {
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync(target, join(root, linkPath(name)));
  };
  const skill = (name, declared = name) => {
    write(`${entityPath(name)}/SKILL.md`, `---\nname: ${declared}\n---\nFixture only.\n`);
    write(`${entityPath(name)}/references/example.txt`, 'supporting file');
    link(name);
  };
  const entry = {
    source: 'example/skills',
    sourceType: 'github',
    skillPath: 'skills/alpha/SKILL.md',
    computedHash: 'a'.repeat(64),
  };
  const lock = { version: 1, skills: { alpha: { ...entry } } };
  const policy = {
    version: 1,
    localSkills: { 'harness-code-check': 'Project-owned skill without an upstream source.' },
    excludedSkills: { 'next-dev-loop': 'Explicitly removed by the user.' },
  };
  const save = () => {
    write(lockPath, JSON.stringify(lock));
    write(policyPath, JSON.stringify(policy));
  };
  skill('alpha');
  skill('harness-code-check');
  save();
  return {
    root,
    write,
    remove,
    link,
    skill,
    entry,
    lock,
    policy,
    save,
    errors: () => checkSkills(root).errors.join('\n'),
    cli: (...args) =>
      spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' }),
  };
}

function snapshot(root) {
  const files = {};
  function visit(directory) {
    for (const entry of readdirSync(join(root, directory)).sort()) {
      const file = join(directory, entry);
      const full = join(root, file);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) files[file] = ['link', readlinkSync(full)];
      else if (stat.isDirectory()) visit(file);
      else files[file] = ['file', readFileSync(full).toString('base64')];
    }
  }
  visit('');
  return files;
}

test('accepts locked and explicitly local skills, preserves their provenance, and ignores OS files', (t) => {
  const f = fixture(t);
  f.write('.agents/skills/.DS_Store', 'metadata');
  f.write('.claude/skills/.DS_Store', 'metadata');
  const result = checkSkills(f.root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.counts, { locked: 1, local: 1, entities: 2, claude: 2 });
  assert.deepEqual(result.inventory, [
    { name: 'alpha', source: 'example/skills' },
    { name: 'harness-code-check', source: 'local' },
  ]);
  assert.deepEqual(result.excluded, ['next-dev-loop']);
});

test('reports a missing or unreadable root and missing required inventory files', (t) => {
  const f = fixture(t);
  assert.match(checkSkills(join(f.root, 'missing')).errors.join('\n'), /root|directory/i);
  for (const file of [lockPath, policyPath]) {
    f.remove(file);
    assert.match(f.errors(), /cannot read|missing/i);
    f.save();
  }
});

test('rejects malformed JSON and duplicate keys rather than accepting overwritten lock names', (t) => {
  const f = fixture(t);
  for (const file of [lockPath, policyPath]) {
    f.write(file, '{');
    assert.match(f.errors(), /JSON/i);
    f.save();
  }
  const entry = JSON.stringify(f.entry);
  f.write(lockPath, `{"version":1,"skills":{"alpha":${entry},"\\u0061lpha":${entry}}}`);
  assert.match(f.errors(), /duplicate.*alpha/i);
  f.save();
  f.write(policyPath, '{"version":1,"localSkills":{},"localSkills":{},"excludedSkills":{}}');
  assert.match(f.errors(), /duplicate.*localSkills/i);
});

test('validates lock and policy schema before using their paths or exceptions', (t) => {
  const f = fixture(t);
  for (const invalid of [null, [], {}, { version: 2, skills: {} }, { version: 1, skills: [] }]) {
    f.write(lockPath, JSON.stringify(invalid));
    assert.notEqual(f.errors(), '', JSON.stringify(invalid));
  }
  f.save();
  for (const invalid of [
    null,
    [],
    {},
    { version: 2, localSkills: {}, excludedSkills: {} },
    { version: 1, localSkills: [], excludedSkills: {} },
    { version: 1, localSkills: {}, excludedSkills: [] },
    { version: 1, localSkills: { local: '' }, excludedSkills: {} },
    { version: 1, localSkills: {}, excludedSkills: { 'next-dev-loop': 12 } },
  ]) {
    f.write(policyPath, JSON.stringify(invalid));
    assert.notEqual(f.errors(), '', JSON.stringify(invalid));
  }
});

test('requires lock provenance and a confined SKILL.md source path without inventing it for local skills', (t) => {
  const f = fixture(t);
  for (const field of ['source', 'sourceType', 'skillPath', 'computedHash']) {
    delete f.lock.skills.alpha[field];
    f.save();
    assert.match(f.errors(), new RegExp(field));
    f.lock.skills.alpha = { ...f.entry };
  }
  for (const skillPath of [
    '/SKILL.md',
    '../SKILL.md',
    'C:\\SKILL.md',
    'skills/alpha',
    'skills/../SKILL.md',
  ]) {
    f.lock.skills.alpha.skillPath = skillPath;
    f.save();
    assert.match(f.errors(), /skillPath/i);
  }
  f.lock.skills.alpha = { ...f.entry, ref: 12 };
  f.save();
  assert.match(f.errors(), /ref/i);
});

test('rejects invalid skill names from locks, policy, and physical directories', (t) => {
  const f = fixture(t);
  for (const name of ['../outside', 'Alpha', 'two words', '', 'bad_name']) {
    f.lock.skills[name] = { ...f.entry };
    f.save();
    assert.match(f.errors(), /invalid.*name/i, name);
    delete f.lock.skills[name];
    f.policy.localSkills[name] = 'exception';
    f.save();
    assert.match(f.errors(), /invalid.*name/i, name);
    delete f.policy.localSkills[name];
  }
  f.save();
  f.skill('bad_name');
  assert.match(f.errors(), /invalid.*name/i);
});

test('requires disjoint upstream, local, and excluded registrations', (t) => {
  const f = fixture(t);
  f.policy.localSkills.alpha = 'Must not hide an upstream source.';
  f.save();
  assert.match(f.errors(), /alpha.*(?:local|lock)|(?:local|lock).*alpha/i);
  delete f.policy.localSkills.alpha;
  f.policy.excludedSkills['harness-code-check'] = 'conflict';
  f.save();
  assert.match(
    f.errors(),
    /harness-code-check.*(?:local|exclud)|(?:local|exclud).*harness-code-check/i,
  );
});

test('reports missing skill storage roots and refuses symlinked storage roots', (t) => {
  const f = fixture(t);
  for (const directory of ['.agents/skills', '.claude/skills']) {
    f.remove(directory);
    assert.match(f.errors(), /missing|directory/i);
    mkdirSync(join(f.root, directory), { recursive: true });
  }
  f.write('alternate/alpha/SKILL.md', '---\nname: alpha\n---\n');
  f.remove('.agents/skills');
  symlinkSync('../alternate', join(f.root, '.agents/skills'));
  assert.match(f.errors(), /\.agents\/skills.*(?:directory|symbolic)/i);
});

test('requires entities for every locked and registered local skill', (t) => {
  const f = fixture(t);
  for (const name of ['alpha', 'harness-code-check']) {
    f.remove(entityPath(name));
    assert.match(f.errors(), new RegExp(`${name}.*missing.*entity|missing.*entity.*${name}`, 'i'));
    f.write(`${entityPath(name)}/SKILL.md`, `---\nname: ${name}\n---\n`);
  }
});

test('refuses entity copies in unexpected locations and symlinked canonical entities', (t) => {
  const f = fixture(t);
  f.remove(entityPath('alpha'));
  f.write('outside-alpha/SKILL.md', '---\nname: alpha\n---\n');
  symlinkSync('../../outside-alpha', join(f.root, entityPath('alpha')));
  assert.match(f.errors(), /alpha.*(?:directory|symbolic)/i);
  assert.match(f.errors(), /resolves|wrong entity/i);
});

test('requires a readable regular SKILL.md instead of a missing file, directory, or file symlink', (t) => {
  const f = fixture(t);
  const file = `${entityPath('alpha')}/SKILL.md`;
  f.remove(file);
  assert.match(f.errors(), /SKILL\.md.*(?:missing|read)|(?:missing|read).*SKILL\.md/i);
  mkdirSync(join(f.root, file));
  assert.match(f.errors(), /SKILL\.md.*(?:regular|read)|(?:regular|read).*SKILL\.md/i);
  f.remove(file);
  symlinkSync('missing.md', join(f.root, file));
  assert.match(f.errors(), /SKILL\.md.*(?:regular|read|symbolic)/i);
});

test('reports permission-denied skill files', { skip: process.getuid?.() === 0 }, (t) => {
  const f = fixture(t);
  const full = join(f.root, entityPath('alpha'), 'SKILL.md');
  chmodSync(full, 0);
  assert.match(f.errors(), /SKILL\.md.*(?:read|permission)|(?:read|permission).*SKILL\.md/i);
});

test('requires an unambiguous frontmatter name matching the entity and detects globally duplicate names', (t) => {
  const f = fixture(t);
  const file = `${entityPath('alpha')}/SKILL.md`;
  for (const raw of [
    '# No frontmatter\nname: alpha',
    '---\ndescription: no name\n---\n',
    '---\nname: alpha\n',
    '---\nname: alpha\nname: alpha\n---\n',
    '---\nname: [alpha]\n---\n',
    '---\nname: wrong-name\n---\n',
  ]) {
    f.write(file, raw);
    assert.match(f.errors(), /frontmatter|name/i, raw);
  }
  f.write(file, '---\nname: harness-code-check\n---\n');
  assert.match(f.errors(), /duplicate.*harness-code-check/i);
});

test('reads simple quoted YAML names, comments, BOM, and CRLF without inspecting the skill body', (t) => {
  const f = fixture(t);
  for (const name of ['alpha', '"alpha"', "'alpha'"]) {
    f.write(
      `${entityPath('alpha')}/SKILL.md`,
      `\uFEFF---\r\nname: ${name} # comment\r\n---\r\nname: ignored\r\n`,
    );
    assert.deepEqual(checkSkills(f.root).errors, [], name);
  }
});

test('rejects unregistered entities and orphan Claude links, including links with valid targets', (t) => {
  const f = fixture(t);
  f.skill('unregistered');
  assert.match(f.errors(), /unregistered.*entity|entity.*unregistered/i);
  assert.match(f.errors(), /orphan.*unregistered|unregistered.*orphan/i);
  f.remove(entityPath('unregistered'));
  assert.match(f.errors(), /broken|resolve/i);
});

test('requires Claude links for both upstream and explicitly local skills', (t) => {
  const f = fixture(t);
  for (const name of ['alpha', 'harness-code-check']) {
    f.remove(linkPath(name));
    assert.match(f.errors(), new RegExp(`${name}.*missing.*Claude|missing.*Claude.*${name}`, 'i'));
    f.link(name);
  }
});

test('rejects independent Claude copies and ordinary files', (t) => {
  const f = fixture(t);
  f.remove(linkPath('alpha'));
  f.write(`${linkPath('alpha')}/SKILL.md`, '---\nname: alpha\n---\n');
  assert.match(f.errors(), /alpha.*(?:symbolic|independent|copy)/i);
  f.remove(linkPath('alpha'));
  f.write(linkPath('alpha'), 'not a link');
  assert.match(f.errors(), /alpha.*(?:symbolic|independent|copy)/i);
});

test('rejects absolute, redundant, and cross-skill targets even when the link can resolve', (t) => {
  const f = fixture(t);
  for (const target of [
    join(f.root, entityPath('alpha')),
    '../../.agents/skills/./alpha',
    '../../.agents/skills/harness-code-check',
    '../../.agents/skills/alpha/',
  ]) {
    f.remove(linkPath('alpha'));
    f.link('alpha', target);
    assert.match(f.errors(), /target.*\.\.\/\.\.\/\.agents\/skills\/alpha/i, target);
  }
});

test('reports broken relative Claude links and excluded skill residues in each inventory layer', (t) => {
  const f = fixture(t);
  f.remove(linkPath('alpha'));
  f.link('alpha', '../../.agents/skills/missing');
  assert.match(f.errors(), /broken|resolve/i);
  f.remove(linkPath('alpha'));
  f.link('alpha');
  f.lock.skills['next-dev-loop'] = { ...f.entry };
  f.save();
  assert.match(f.errors(), /excluded.*next-dev-loop|next-dev-loop.*excluded/i);
  delete f.lock.skills['next-dev-loop'];
  f.save();
  f.skill('next-dev-loop');
  assert.match(f.errors(), /\.agents\/skills\/next-dev-loop.*excluded/i);
  assert.match(f.errors(), /\.claude\/skills\/next-dev-loop.*excluded/i);
});

test('ignores only regular housekeeping files and reports other unexpected hidden entries', (t) => {
  const f = fixture(t);
  symlinkSync('alpha', join(f.root, '.agents/skills/.DS_Store'));
  f.write('.agents/skills/.unexpected', 'unknown');
  assert.match(f.errors(), /\.DS_Store/);
  assert.match(f.errors(), /\.unexpected/);
});

test('CLI lists a compact source inventory and is read-only', (t) => {
  const f = fixture(t);
  const before = snapshot(f.root);
  const result = f.cli('--list');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /example\/skills \(1\): alpha/);
  assert.match(result.stdout, /local \(1\): harness-code-check/);
  assert.match(result.stdout, /excluded \(1\): next-dev-loop/);
  assert.match(result.stdout, /1 locked, 1 local, 2 entities, 2 Claude links/);
  assert.ok(result.stdout.trim().split('\n').length <= 5);
  assert.deepEqual(snapshot(f.root), before);
});

test('CLI uses stable sorted lists and returns nonzero with errors even when listing', (t) => {
  const f = fixture(t);
  for (const name of ['zulu', 'beta']) {
    f.skill(name);
    f.lock.skills[name] = { ...f.entry, skillPath: `skills/${name}/SKILL.md` };
  }
  f.save();
  f.remove(linkPath('alpha'));
  const result = f.cli('--list');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /alpha.*missing.*Claude/i);
  assert.match(result.stdout, /example\/skills \(3\): alpha, beta, zulu/);
});

test('CLI rejects unknown flags, missing option values, and positionals, and supplies usage', (t) => {
  const f = fixture(t);
  for (const args of [['--unknown'], ['--root'], ['unexpected']]) {
    const result = f.cli(...args);
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /Usage|argument|option/i);
  }
  const help = f.cli('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--list/);
  assert.match(help.stdout, /offline|upstream|network/i);
  f.write(lockPath, '{');
  assert.equal(f.cli().status, 1);
});
