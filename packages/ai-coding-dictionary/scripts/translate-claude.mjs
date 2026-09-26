import { execFileSync } from 'node:child_process';

const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text, term) =>
  new RegExp(`(?<![A-Za-z])${escapePattern(term)}(?![A-Za-z])`, 'i').test(text);
const requiresEnglishTerm = (text, term) =>
  term.includes(' ') || term === term.toUpperCase()
    ? mentions(text, term)
    : new RegExp(`(?<![A-Za-z])${escapePattern(term)}(?![A-Za-z])`).test(text);

function readArray(output) {
  const text = output
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const array = JSON.parse(text);
  if (!Array.isArray(array) || array.some((item) => typeof item !== 'string'))
    throw new Error('Claude Code CLI did not return a JSON string array');
  return array.map((item) => item.trim());
}

function translateBatch(paragraphs, terms, termName, retry = false) {
  const glossary = terms.filter((term) =>
    paragraphs.some((paragraph) => mentions(paragraph, term)),
  );
  const prompt = [
    '你是 AI coding 专业词典的英译中译者。将输入 JSON 数组逐段完整译成简体中文。',
    '只输出合法的 JSON 字符串数组，长度和顺序必须与输入完全相同；不要使用 Markdown 代码块。',
    '不能摘要、删减、合并、编造；保留事实、数字、引号、例子及原文中的观点。',
    `词条：${termName}。以下专业术语在译文中必须保留英文原名（大小写可随句子调整）：${glossary.join('、') || '无'}。其他 AI coding 专业术语也保留英文。`,
    retry
      ? '上一轮有遗漏或术语被翻译。请逐句检查完整性，确保所有英文专业术语都出现在对应译文中。'
      : '',
    `输入：${JSON.stringify(paragraphs)}`,
  ]
    .filter(Boolean)
    .join('\n');
  const output = execFileSync('claude', ['-p'], {
    input: prompt,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return readArray(output);
}

function validTranslation(source, target, terms) {
  if (!target || (source.length > 160 && target.length < source.length * 0.16)) return false;
  if (source.length > 80 && !/\p{Script=Han}/u.test(target)) return false;
  return terms.every(
    (term) =>
      !requiresEnglishTerm(source, term) || target.toLowerCase().includes(term.toLowerCase()),
  );
}

export function translateSegments(paragraphs, terms, termName) {
  if (!paragraphs.length) return [];
  let translated = translateBatch(paragraphs, terms, termName);
  if (translated.length !== paragraphs.length) translated = Array(paragraphs.length).fill('');
  for (const [index, paragraph] of paragraphs.entries()) {
    if (validTranslation(paragraph, translated[index], terms)) continue;
    const retry = translateBatch([paragraph], terms, termName, true);
    if (retry.length !== 1 || !validTranslation(paragraph, retry[0], terms)) {
      const missing = terms.filter(
        (term) =>
          requiresEnglishTerm(paragraph, term) &&
          !retry[0]?.toLowerCase().includes(term.toLowerCase()),
      );
      throw new Error(
        `Claude Code CLI returned an incomplete translation: ${termName} paragraph ${index + 1}; missing: ${missing.join(', ') || 'content'}`,
      );
    }
    translated[index] = retry[0];
  }
  return translated;
}

function tableCells(line) {
  return line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function translateTable(text, terms, termName) {
  const lines = text.trim().split('\n');
  const rows = lines.map(tableCells);
  const positions = [];
  const cells = [];
  for (const [rowIndex, row] of rows.entries()) {
    if (rowIndex === 1) continue;
    for (const [column, cell] of row.entries()) {
      if (!cell || !/[A-Za-z]/.test(cell)) continue;
      positions.push([rowIndex, column]);
      cells.push(cell);
    }
  }
  const translated = translateSegments(cells, terms, termName);
  for (const [index, [row, column]] of positions.entries()) rows[row][column] = translated[index];
  return rows
    .map((row, index) => (index === 1 ? lines[index] : `| ${row.join(' | ')} |`))
    .join('\n');
}

export function translateEntry(entry, terms, { translateDescription = false } = {}) {
  const summary =
    entry.summary?.zh ??
    (entry.body.zh.length === 1 && entry.body.en.length > 1 ? entry.body.zh[0] : '');
  const inputs = translateDescription ? [entry.description.en] : [];
  const proseIndices = [];
  for (const [index, paragraph] of entry.body.en.entries()) {
    const lines = paragraph.trim().split('\n');
    if (/^Usage:?$/.test(paragraph.trim())) continue;
    if (lines.length > 2 && lines[0].startsWith('|') && /^\|[\s:|-]+\|$/.test(lines[1])) continue;
    proseIndices.push(index);
    inputs.push(paragraph);
  }
  const translated = translateSegments(inputs, terms, entry.term);
  const descriptionZh = translateDescription ? translated.shift() : entry.description.zh;
  const bodyZh = Array(entry.body.en.length);
  for (const index of proseIndices) bodyZh[index] = translated.shift();
  for (const [index, paragraph] of entry.body.en.entries()) {
    if (bodyZh[index]) continue;
    if (/^Usage:?$/.test(paragraph.trim())) bodyZh[index] = '用法';
    else bodyZh[index] = translateTable(paragraph, terms, entry.term);
  }
  return {
    ...entry,
    summary: { zh: summary },
    description: { ...entry.description, zh: descriptionZh },
    body: { ...entry.body, zh: bodyZh },
  };
}
