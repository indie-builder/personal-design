import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from '../scripts/db.mjs';

test('列表与详情直接提供安全的媒体预览，保留完整播放地址及本地回退', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inspora-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = path.join(root, 'packages/inspora');
  await mkdir(path.join(pkg, 'src'), { recursive: true });
  await copyFile(new URL('./index.ts', import.meta.url), path.join(pkg, 'src/index.ts'));
  const localPath = '/inspora/local.mp4';
  await mkdir(path.join(root, 'apps/web/public/inspora'), { recursive: true });
  await writeFile(path.join(root, 'apps/web/public', localPath), 'local video fixture');
  const full = 'https://example.com/full.mp4';
  const preview = 'https://example.com/preview.mp4';
  const cases = [
    { id: 'a', raw: { id: 'a', videoPreview: { url: `${preview}?a` } }, expected: `${preview}?a` },
    { id: 'b', raw: { id: 'b', videoPreview: { url: `${preview}?b` } }, expected: `${preview}?b` },
    { id: 'mismatch', raw: { id: 'a', videoPreview: { url: preview } } },
    { id: 'missing' },
    { id: 'malformed', rawJson: '{broken' },
    { id: 'null', raw: null },
    { id: 'array', raw: [] },
    { id: 'javascript', raw: { id: 'javascript', videoPreview: { url: 'javascript:bad' } } },
    { id: 'http', raw: { id: 'http', videoPreview: { url: 'http://example.com/preview.mp4' } } },
    { id: 'no-url', raw: { id: 'no-url', videoPreview: { bytes: 20 } } },
    { id: 'image', type: 'image', raw: { id: 'image', videoPreview: { url: preview } } },
    {
      id: 'larger',
      raw: {
        id: 'larger',
        sizeBytes: 100,
        width: 1080,
        height: 1080,
        videoPreview: { url: preview, bytes: 130, width: 1080, height: 1080 },
      },
    },
    {
      id: 'lower-resolution',
      raw: {
        id: 'lower-resolution',
        sizeBytes: 100,
        width: 1080,
        height: 1080,
        videoPreview: { url: preview, bytes: 130, width: 540, height: 540 },
      },
      expected: preview,
    },
    {
      id: 'smaller',
      raw: { id: 'smaller', sizeBytes: 100, videoPreview: { url: preview, bytes: 80 } },
      expected: preview,
    },
    { id: 'local', localPath },
    { id: 'missing-local', localPath: '/inspora/missing.mp4' },
  ];
  const { db } = openDatabase(path.join(pkg, 'inspora.db'));
  db.prepare(
    'INSERT INTO posts (id, slug, title, created_at, synced_at, raw_json) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('post', 'post', 'Media previews', '2026-10-04', '2026-10-04', '{unused post raw');
  const insert = db.prepare(
    'INSERT INTO media (id, post_id, position, type, url, local_path, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const [position, item] of cases.entries()) {
    insert.run(
      item.id,
      'post',
      position,
      item.type ?? 'video',
      full,
      item.localPath ?? null,
      item.rawJson ?? (item.raw === undefined ? null : JSON.stringify(item.raw)),
    );
  }
  db.close();

  const api = await import(pathToFileURL(path.join(pkg, 'src/index.ts')).href);
  const [post] = api.listPosts();
  assert.equal('raw' in post, false, '读取结果不得公开原始帖子 JSON');
  assert.deepEqual(api.getPostBySlug('post').media, post.media);
  for (const [index, item] of cases.entries()) {
    const media = post.media[index];
    assert.equal(media.id, item.id);
    assert.equal('raw' in media, false);
    if (item.id === 'local') {
      assert.equal(new URL(media.src, 'https://example.test').pathname, localPath);
      assert.equal(media.previewSrc, media.src, '无预览时保留本地完整视频');
    } else {
      assert.equal(media.src, full, `${item.id}: 预览不能覆盖完整播放地址`);
      assert.equal(media.previewSrc, item.expected ?? full, item.id);
    }
  }
});
