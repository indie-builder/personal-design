import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = 'indie-builder/dictionary-of-ai-coding';
const catalogPath = join(root, 'catalog.json');
const sourcePath = join(root, 'source.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const previous = JSON.parse(await readFile(catalogPath, 'utf8'));
const headers = { 'User-Agent': 'personal-design-dictionary-sync' };

function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

function getText(path, revision) {
  return gh(
    'api',
    `repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${revision}`,
    '-H',
    'Accept: application/vnd.github.raw+json',
  );
}

function curriculum(text) {
  const sections = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('## Section ')) sections.push({ en: line.split(' — ')[1], terms: [] });
    else if (line.startsWith('- ')) sections.at(-1)?.terms.push(line.slice(2));
  }
  if (!sections.length || sections.some((item) => !item.en || !item.terms.length))
    throw new Error('Invalid curriculum');
  return sections;
}

function clean(text) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(?<!\w)[*_]([^*_]+)[*_](?!\w)/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replaceAll('`', '')
    .trim();
}

function parseEntry(name, section, text, names) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Missing frontmatter: ${name}`);
  const description = match[1]
    .split('\n')
    .find((line) => line.startsWith('description: '))
    ?.slice(13)
    .replace(/^"|"$/g, '');
  if (!description) throw new Error(`Missing description: ${name}`);
  const related = [...match[2].matchAll(/\[[^\]]+\]\(\.\/([^)]+)\.md\)/g)]
    .map((item) => decodeURIComponent(item[1]))
    .filter((term, index, all) => names.has(term) && term !== name && all.indexOf(term) === index);
  return {
    term: name,
    section,
    description: { en: description, zh: '' },
    body: {
      en: clean(match[2])
        .split(/\n\s*\n/)
        .filter(Boolean),
      zh: [],
    },
    related,
  };
}

function chunks(text) {
  const parts = [];
  while (text.length > 400) {
    let cut = Math.max(
      text.lastIndexOf('. ', 400),
      text.lastIndexOf('! ', 400),
      text.lastIndexOf('? ', 400),
      text.lastIndexOf(' ', 400),
    );
    if (cut < 200) cut = 400;
    parts.push(text.slice(0, cut + 1));
    text = text.slice(cut + 1);
  }
  if (text) parts.push(text);
  return parts;
}

async function translate(text, terms) {
  const pattern = new RegExp(
    `(?<![A-Za-z])(?:${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z])`,
    'gi',
  );
  const saved = [];
  const protectedText = text.replace(pattern, (term) => {
    const key = `ZXQ${String(saved.length).padStart(3, '0')}QXZ`;
    saved.push([key, term]);
    return key;
  });
  const translated = [];
  for (const chunk of chunks(protectedText)) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', chunk);
    url.searchParams.set('langpair', 'en|zh-CN');
    const result = await getJson(url);
    if (
      result.responseStatus !== 200 ||
      result.quotaFinished ||
      !result.responseData?.translatedText
    )
      throw new Error('Translation service unavailable or quota exhausted; catalog preserved');
    translated.push(result.responseData.translatedText);
  }
  let result = translated.join('');
  for (const [key, term] of saved) {
    if (!result.includes(key))
      throw new Error(`Translation lost protected term ${term}; catalog preserved`);
    result = result.replaceAll(key, term);
  }
  return result;
}

const revision = gh('api', `repos/${repo}/commits/main`, '--jq', '.sha').trim();
const tree = JSON.parse(gh('api', `repos/${repo}/git/trees/${revision}?recursive=1`));
if (tree.truncated) throw new Error('GitHub tree truncated; catalog preserved');
const files = Object.fromEntries(
  tree.tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        (item.path === 'internal/Curriculum.md' || item.path.startsWith('dictionary/')),
    )
    .map((item) => [item.path, item.sha]),
);
const changed = [...new Set([...Object.keys(files), ...Object.keys(source.files)])].filter(
  (path) => files[path] !== source.files[path],
);
if (!changed.length) {
  console.log('AI Coding 词典已是最新');
  process.exit(0);
}
const curriculumText =
  files['internal/Curriculum.md'] === source.files['internal/Curriculum.md']
    ? null
    : getText('internal/Curriculum.md', revision);
const sectionData = curriculumText
  ? curriculum(curriculumText)
  : previous.sections.map((section, index) => ({
      ...section,
      terms: previous.entries.filter((entry) => entry.section === index).map((entry) => entry.term),
    }));
const sectionNames = [
  '模型',
  '会话、上下文窗口与轮次',
  '工具与环境',
  '常见失效',
  '上下文交接',
  '记忆与引导',
  '工作模式',
];
const names = new Set(sectionData.flatMap((section) => section.terms));
const terms = [...names].sort((a, b) => b.length - a.length);
const oldEntries = new Map(previous.entries.map((entry) => [entry.term, entry]));
const entries = [];
let translatedCount = 0;
for (const [section, group] of sectionData.entries()) {
  for (const term of group.terms) {
    const path = `dictionary/${term}.md`;
    if (!files[path]) throw new Error(`Missing source file: ${path}`);
    let entry = oldEntries.get(term);
    if (!entry || files[path] !== source.files[path]) {
      entry = parseEntry(term, section, getText(path, revision), names);
      entry.description.zh = await translate(entry.description.en, terms);
      entry.body.zh = [];
      for (const paragraph of entry.body.en) entry.body.zh.push(await translate(paragraph, terms));
      translatedCount++;
      console.log(`已更新 ${term}`);
    } else entry = { ...entry, section };
    entries.push(entry);
  }
}
const nextCatalog = {
  sections: sectionData.map((section, index) => ({
    en: section.en,
    zh:
      previous.sections[index]?.en === section.en
        ? previous.sections[index].zh
        : (sectionNames[index] ?? section.en),
  })),
  entries,
};
const nextSource = { repository: repo, revision, files };
await writeFile(`${catalogPath}.tmp`, `${JSON.stringify(nextCatalog, null, 2)}\n`);
await writeFile(`${sourcePath}.tmp`, `${JSON.stringify(nextSource, null, 2)}\n`);
await rename(`${catalogPath}.tmp`, catalogPath);
await rename(`${sourcePath}.tmp`, sourcePath);
console.log(`同步完成：${translatedCount} 个变更词条，${entries.length} 个词条`);
