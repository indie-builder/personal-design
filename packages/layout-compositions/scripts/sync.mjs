#!/usr/bin/env node
/**
 * 同步上游 350-layout-compositions 的图片资产。
 *
 * 1. 下载上游仓库 tarball 到 .upstream/（已存在则复用，幂等）
 * 2. 解压并按 catalog.json 逐条 sha256 校验 PNG
 * 3. sharp 转 WebP 输出到 apps/web/public/layout-compositions/
 *    - thumbnails/<category_slug>/<id>.webp 缩略图 q82，宽 720（从 PNG 原图缩放）
 *    - images/<category_slug>/<id>.webp    高清无损图（仅 --with-images 时生成；
 *      缺省不生成——线上热链上游 jsDelivr 原图，本地存在时包 API 自动优先用本地）
 * 4. 已存在的输出跳过，可重复运行
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { readFile, rename } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const pkgDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const upstreamDir = path.join(pkgDir, '.upstream');
const tarballPath = path.join(upstreamDir, 'repo.tar.gz');
const extractDir = path.join(upstreamDir, 'extracted');
const outBase = path.resolve(pkgDir, '../../apps/web/public/layout-compositions');

const TARBALL_URL =
  'https://codeload.github.com/nevertoday/350-layout-compositions/tar.gz/refs/heads/main';
const CONCURRENCY = 8;
/** 默认只出缩略图（线上热链上游原图）；--with-images 才生成无损高清图 */
const WITH_IMAGES = process.argv.includes('--with-images');

const catalog = JSON.parse(await readFile(path.join(pkgDir, 'catalog.json'), 'utf8'));
const corrections = JSON.parse(await readFile(path.join(pkgDir, 'corrections.json'), 'utf8'));
const catalogById = new Map(catalog.map((item) => [item.id, item]));

/**
 * 上游 v2 图片存在系统性图文错位（详见 corrections.json）。
 * 每个内容条目解析出实际的源文件：
 * - 默认：与条目同名的文件
 * - { v2 }：v2 里的另一个文件 id（文件名与内容不符，以 corrections 为准）
 * - { v1 }：旧版 100 种排版里的等价图（v2 丢失，v1 补齐）
 * - { missing: true }：上游不存在该图，跳过
 */
function resolveSource(item) {
  const correction = corrections[item.id];
  if (!correction) {
    return { image: item.image, thumbnail: item.thumbnail, sha256: item.sha256 };
  }
  if (correction.missing) return null;
  if (correction.v1) {
    return {
      image: path.join('images', `layout-${correction.v1}.png`),
      thumbnail: path.join('thumbnails', `layout-${correction.v1}.jpg`),
      sha256: null,
    };
  }
  const source = catalogById.get(correction.v2);
  if (!source) throw new Error(`corrections.json: ${item.id} 引用了不存在的文件 ${correction.v2}`);
  return { image: source.image, thumbnail: source.thumbnail, sha256: source.sha256 };
}

async function downloadTarball() {
  if (existsSync(tarballPath) && statSync(tarballPath).size > 1024 * 1024) {
    console.log(`[sync] 复用已下载的 tarball (${(statSync(tarballPath).size / 1e6).toFixed(0)}MB)`);
    return;
  }
  mkdirSync(upstreamDir, { recursive: true });
  console.log('[sync] 下载上游 tarball (~700MB) ...');
  const res = await fetch(TARBALL_URL, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`下载失败: HTTP ${res.status}`);
  }
  const tmp = `${tarballPath}.part`;
  await pipeline(res.body, (await import('node:fs')).createWriteStream(tmp));
  await rename(tmp, tarballPath);
  console.log('[sync] 下载完成');
}

async function extractTarball() {
  if (existsSync(extractDir) && readdirSync(extractDir).length > 0) {
    console.log('[sync] 复用已解压的上游仓库');
    return;
  }
  mkdirSync(extractDir, { recursive: true });
  console.log('[sync] 解压 tarball ...');
  await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractDir]);
  console.log('[sync] 解压完成');
}

function repoRoot() {
  const entries = readdirSync(extractDir);
  if (entries.length !== 1) {
    throw new Error(`解压目录结构异常: ${entries.join(', ')}`);
  }
  return path.join(extractDir, entries[0]);
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function convertOne(root, item) {
  const source = resolveSource(item);
  if (!source) return 'missing';

  const imageOut = path.join(outBase, 'images', item.category_slug, `${item.id}.webp`);
  const thumbOut = path.join(outBase, 'thumbnails', item.category_slug, `${item.id}.webp`);
  const imageDone = !WITH_IMAGES || (existsSync(imageOut) && statSync(imageOut).size > 0);
  const thumbDone = existsSync(thumbOut) && statSync(thumbOut).size > 0;
  if (imageDone && thumbDone) return 'skipped';

  const srcImage = path.join(root, source.image);

  // 校验高清图源文件完整性（catalog 里的 sha256 即 PNG 的哈希；v1 无哈希可校）
  if (source.sha256) {
    const digest = await sha256(srcImage);
    if (digest !== source.sha256) {
      throw new Error(`sha256 校验失败: ${item.id} ${item.name} (${digest} != ${source.sha256})`);
    }
  }

  mkdirSync(path.dirname(imageOut), { recursive: true });
  mkdirSync(path.dirname(thumbOut), { recursive: true });

  const jobs = [];
  if (!imageDone) {
    jobs.push(sharp(srcImage).webp({ lossless: true }).toFile(imageOut));
  }
  if (!thumbDone) {
    // 缩略图也从 PNG 原图缩放（上游 JPG 缩略图本身已压缩，再压会糊）；
    // 720 宽覆盖灵感墙卡片 3x DPR（208px CSS ≈ 624px）
    jobs.push(sharp(srcImage).resize({ width: 720 }).webp({ quality: 82 }).toFile(thumbOut));
  }
  await Promise.all(jobs);
  return 'converted';
}

async function main() {
  await downloadTarball();
  await extractTarball();
  const root = repoRoot();
  console.log(`[sync] 共 ${catalog.length} 条，开始转换 (并发 ${CONCURRENCY})`);

  let converted = 0;
  let skipped = 0;
  let missing = 0;
  for (let i = 0; i < catalog.length; i += CONCURRENCY) {
    const batch = catalog.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((item) => convertOne(root, item)));
    for (const r of results) {
      if (r === 'converted') converted += 1;
      else if (r === 'missing') missing += 1;
      else skipped += 1;
    }
    const done = Math.min(i + CONCURRENCY, catalog.length);
    if (done % 40 < CONCURRENCY || done === catalog.length) {
      console.log(`[sync] 进度 ${done}/${catalog.length}`);
    }
  }

  console.log(`[sync] 完成: 新转换 ${converted}，跳过 ${skipped}，上游缺失 ${missing}`);
  if (converted + skipped + missing !== catalog.length) {
    throw new Error('条目数不匹配');
  }
}

main().catch((err) => {
  console.error('[sync] 失败:', err.message);
  process.exit(1);
});
