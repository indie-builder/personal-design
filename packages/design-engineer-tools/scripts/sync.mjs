#!/usr/bin/env node
/**
 * 同步公开的 Design Engineer Tools 目录。
 *
 * 只读取公开 HTML 中的分类标题、工具名称和外链；不抓取目标工具站点，
 * 也不复制对方的页面样式或资源。每次成功解析后原子写入 catalog.json。
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceUrl = 'https://designengineer.tools/';
const catalogPath = path.join(pkgDir, 'catalog.json');
const iconDir = path.resolve(pkgDir, '../../apps/web/public/design-engineer-tools/icons');
const categoryPattern = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
const linkPattern = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

function decode(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCatalog(html) {
  const headings = [...html.matchAll(categoryPattern)];
  const categories = headings.map((match, index) => {
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = headings[index + 1]?.index ?? html.indexOf('<footer', bodyStart);
    const body = html.slice(bodyStart, bodyEnd === -1 ? undefined : bodyEnd);
    const tools = [...body.matchAll(linkPattern)]
      .map((link) => ({ name: decode(link[2] ?? ''), url: link[1] ?? '' }))
      .filter(({ name, url }) => name && /^https:\/\//.test(url));
    return { id: decode(match[1] ?? ''), tools };
  });
  const unique = new Set();
  for (const category of categories) {
    category.tools = category.tools.filter((tool) => {
      const key = `${category.id}\u0000${tool.url}`;
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    });
  }
  return categories.filter((category) => category.id && category.tools.length);
}

function iconPath(url) {
  const id = createHash('sha256').update(url).digest('hex').slice(0, 16);
  return {
    file: path.join(iconDir, `${id}.png`),
    publicPath: `/design-engineer-tools/icons/${id}.png`,
  };
}

async function syncIcon(tool) {
  const icon = iconPath(tool.url);
  try {
    const response = await fetch(
      `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(tool.url)}&sz=64`,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('image/') ||
      bytes.length < 100
    )
      throw new Error(`HTTP ${response.status}`);
    await writeFile(icon.file, bytes);
    return { ...tool, icon: icon.publicPath };
  } catch (error) {
    if (existsSync(icon.file)) return { ...tool, icon: icon.publicPath };
    console.warn(`favicon 跳过: ${tool.name} (${error.message})`);
    return { ...tool, icon: null };
  }
}

async function syncIcons(categories) {
  await mkdir(iconDir, { recursive: true });
  const tools = categories.flatMap((category) => category.tools);
  const results = [];
  for (let offset = 0; offset < tools.length; offset += 12) {
    const batch = await Promise.all(tools.slice(offset, offset + 12).map(syncIcon));
    results.push(...batch);
  }
  let index = 0;
  for (const category of categories) {
    category.tools = category.tools.flatMap(() => {
      const result = results[index++];
      return result ? [result] : [];
    });
  }
  const missing = results.filter((result) => !result.icon).length;
  if (missing) console.warn(`${missing} 个工具没有可用 favicon，页面将显示外链图标`);
}

const response = await fetch(sourceUrl, {
  headers: { 'user-agent': 'personal-design-sync/1.0 (+https://designengineer.tools/)' },
});
if (!response.ok) throw new Error(`目录请求失败: HTTP ${response.status}`);
const categories = parseCatalog(await response.text());
const total = categories.reduce((count, category) => count + category.tools.length, 0);
if (categories.length < 10 || total < 100) {
  throw new Error(`目录解析不完整: ${categories.length} 个分类，${total} 个工具`);
}
await syncIcons(categories);

const catalog = { sourceUrl, syncedAt: new Date().toISOString(), categories };
await mkdir(pkgDir, { recursive: true });
const temporary = `${catalogPath}.tmp`;
await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`);
await rename(temporary, catalogPath);
console.log(`已同步 ${categories.length} 个分类、${total} 个工具`);
