import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { text, relativePath } from './lib/doc-utils.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registry = 'scripts/design-checks/current-checks.json';
const confined = (root, file) =>
  !relative(root, file).split(/[\\/]/).includes('..') && !isAbsolute(relative(root, file));
const withoutComments = (source) =>
  source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (token) => (token.startsWith('//') || token.startsWith('/*') ? ' ' : token),
  );

export function checkNavigation(root = repositoryRoot) {
  root = realpathSync(root);
  const errors = [];
  const fail = (context, message) => errors.push(`${context}: ${message}`);
  function target(file, context, base = root, regular = true, strict = false) {
    if (!relativePath(file, strict)) {
      fail(context, `invalid repository-relative path ${JSON.stringify(file)}`);
      return null;
    }
    const full = resolve(base, file);
    try {
      if (!confined(root, full) || !confined(root, realpathSync(full))) {
        fail(context, `path escapes repository: ${file}`);
        return null;
      }
      const stat = statSync(full);
      if (regular ? !stat.isFile() : !stat.isFile() && !stat.isDirectory()) {
        fail(context, `expected ${regular ? 'regular file' : 'file or directory'}: ${file}`);
        return null;
      }
      return full;
    } catch {
      fail(context, `missing or unreadable target: ${file}`);
      return null;
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(root, registry), 'utf8'));
  } catch (error) {
    return [`${registry}: cannot read manifest JSON (${error.message})`];
  }
  if (!manifest || !['documents', 'http', 'browser', 'utilities'].every((key) => Array.isArray(manifest[key]))) {
    return [`${registry}: manifest requires documents, http, browser and utilities arrays`];
  }
  const documents = [],
    checks = [],
    ids = new Set();
  for (const file of manifest.documents) {
    const full = target(file, 'documents', root, true, true);
    if (full && !/\.md$/i.test(file)) fail('documents', `expected Markdown file: ${file}`);
    else if (full) documents.push(full);
  }
  for (const lane of ['http', 'browser'])
    for (const entry of manifest[lane]) {
      if (
        !entry ||
        !text(entry.id) ||
        !text(entry.file) ||
        (lane === 'browser' &&
          (!Array.isArray(entry.exports) ||
            !entry.exports.every((name) => text(name) && /^[\w$]+$/.test(name))))
      ) {
        fail(lane, 'invalid check entry; expected id, file and browser exports');
        continue;
      }
      if (ids.has(entry.id)) fail(lane, `duplicate check id: ${entry.id}`);
      ids.add(entry.id);
      const full = target(entry.file, entry.id, root, true, true);
      if (full) checks.push({ ...entry, full, lane });
    }
  const utilities = manifest.utilities.filter((file) => relativePath(file, true));
  if (utilities.length !== manifest.utilities.length) fail('utilities', 'invalid repository-relative path');
  const allowed = new Set([
    registry,
    ...utilities,
    ...checks.map((check) => relative(root, check.full)),
  ]);
  function scriptReference(file, context) {
    if (/^scripts\/design-checks\/.*\.(?:[cm]?js|sh)$/.test(file) && !allowed.has(file)) {
      fail(context, `unregistered legacy driver: ${file}`);
    }
  }
  for (const full of documents) {
    const source = readFileSync(full, 'utf8'),
      context = relative(root, full);
    for (const match of source.matchAll(
      /\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+[^)]*)?\)/g,
    )) {
      const href = match[1] ?? match[2];
      if (/^(?:[A-Za-z][\w+.-]*:|\/\/|#)/.test(href)) continue;
      let file;
      try {
        file = decodeURIComponent(href.split(/[?#]/)[0]);
      } catch {
        fail(context, `invalid URL encoding: ${href}`);
        continue;
      }
      const linked = target(file, context, dirname(full), false);
      if (linked) scriptReference(relative(root, linked), context);
    }
    for (const match of source.matchAll(/(?<![\w/.-])scripts\/(?:[\w.-]+\/)*[\w.-]+\.[\w]+/g)) {
      const file = match[0];
      target(file, context);
      scriptReference(file, context);
    }
  }
  const visited = new Set();
  function inspect(full) {
    if (visited.has(full)) return;
    visited.add(full);
    const context = relative(root, full),
      source = withoutComments(readFileSync(full, 'utf8'));
    const imports =
      /(?:\b(?:import|export)\b\s*(?:[^;\x27"`]*?\bfrom\s*)?|\b(?:import|require)\s*\(\s*)['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(imports)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const dependency = target(specifier, context, dirname(full));
      if (dependency && !/(?:^|\/)(?:node_modules|vendor)(?:\/|$)/.test(relative(root, dependency)))
        inspect(dependency);
    }
  }
  for (const file of utilities) {
    if (!existsSync(resolve(root, file))) continue;
    const full = target(file, file);
    if (full) inspect(full);
  }
  for (const check of checks) {
    inspect(check.full);
    if (check.lane !== 'browser') continue;
    const source = withoutComments(readFileSync(check.full, 'utf8'));
    const exports = new Set(
      [...source.matchAll(/\bexport\s+(?:async\s+)?function\s+([\w$]+)\s*\(/g)].map(
        (match) => match[1],
      ),
    );
    for (const name of check.exports)
      if (!exports.has(name)) fail(check.file, `missing exported function: ${name}`);
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkNavigation();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('Navigation checks passed.');
}
