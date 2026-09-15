/**
 * 灵感集 SQLite schema 与公共语句。两个同步源（inspora / bestx）共用：
 * - posts.source 区分来源；posts.tweet_id 是归一化后的原作推文 id，
 *   两个源指向同一条原作时读取侧只展示 inspora 版本（见 src/index.ts）。
 * - bestx 的媒体不入库（热链其公开 CDN），local_* 保持 NULL。
 */
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      creator_name TEXT,
      creator_url TEXT,
      creator_avatar TEXT,
      description TEXT,
      category TEXT,
      industries TEXT,
      colors TEXT,
      styles TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL,
      published_at TEXT,
      is_featured INTEGER DEFAULT 0,
      raw_json TEXT,
      enriched_at TEXT,
      synced_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'inspora',
      tweet_id TEXT
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      position INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      poster_url TEXT,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER,
      alt TEXT,
      local_path TEXT,
      local_poster_path TEXT,
      local_thumb_path TEXT,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_media_post ON media(post_id);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
  `);

  // 已存在的库补列（SQLite 没有 ADD COLUMN IF NOT EXISTS）
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(posts)')
      .all()
      .map((column) => column.name),
  );
  if (!columns.has('source'))
    db.exec("ALTER TABLE posts ADD COLUMN source TEXT NOT NULL DEFAULT 'inspora'");
  if (!columns.has('tweet_id')) db.exec('ALTER TABLE posts ADD COLUMN tweet_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_posts_tweet ON posts(tweet_id)');

  const stmts = {
    hasPost: db.prepare('SELECT 1 FROM posts WHERE id = ?'),
    needsEnrich: db.prepare(
      "SELECT slug FROM posts WHERE enriched_at IS NULL AND source = 'inspora'",
    ),
    upsertPost: db.prepare(`
      INSERT INTO posts (id, slug, title, creator_name, creator_url, creator_avatar,
        description, category, industries, colors, styles, source_url,
        created_at, published_at, is_featured, raw_json, enriched_at, synced_at, source, tweet_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug=excluded.slug, title=excluded.title,
        creator_name=excluded.creator_name, creator_url=excluded.creator_url,
        creator_avatar=COALESCE(excluded.creator_avatar, posts.creator_avatar),
        description=COALESCE(excluded.description, posts.description),
        category=COALESCE(excluded.category, posts.category),
        industries=COALESCE(excluded.industries, posts.industries),
        colors=COALESCE(excluded.colors, posts.colors),
        styles=COALESCE(excluded.styles, posts.styles),
        source_url=COALESCE(excluded.source_url, posts.source_url),
        created_at=excluded.created_at,
        published_at=COALESCE(excluded.published_at, posts.published_at),
        is_featured=CASE WHEN posts.enriched_at IS NULL THEN excluded.is_featured ELSE posts.is_featured END,
        raw_json=COALESCE(excluded.raw_json, posts.raw_json),
        enriched_at=COALESCE(excluded.enriched_at, posts.enriched_at),
        synced_at=excluded.synced_at,
        source=excluded.source,
        tweet_id=COALESCE(excluded.tweet_id, posts.tweet_id)
    `),
    upsertMedia: db.prepare(`
      INSERT INTO media (id, post_id, position, type, url, poster_url, width, height,
        size_bytes, alt, local_path, local_poster_path, local_thumb_path, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        post_id=excluded.post_id, position=excluded.position, type=excluded.type,
        url=excluded.url, poster_url=excluded.poster_url,
        width=excluded.width, height=excluded.height,
        size_bytes=COALESCE(excluded.size_bytes, media.size_bytes),
        alt=excluded.alt,
        local_path=COALESCE(media.local_path, excluded.local_path),
        local_poster_path=COALESCE(media.local_poster_path, excluded.local_poster_path),
        local_thumb_path=COALESCE(media.local_thumb_path, excluded.local_thumb_path),
        raw_json=excluded.raw_json
    `),
    // 大图/视频不再下载（热链原站，见包 README/AGENTS.md）；只补本地的海报与缩略图
    mediaNeedingDownload: db.prepare(`
      SELECT media.id, media.type, media.url, media.poster_url, media.local_path,
             media.local_poster_path, media.local_thumb_path, media.raw_json
      FROM media
      JOIN posts ON posts.id = media.post_id
      WHERE posts.source = 'inspora'
        AND ((media.type = 'video' AND media.local_poster_path IS NULL AND media.poster_url IS NOT NULL)
          OR (media.type = 'image' AND media.local_thumb_path IS NULL))
    `),
    updateMediaPaths: db.prepare(
      'UPDATE media SET local_path = ?, local_poster_path = ?, local_thumb_path = ? WHERE id = ?',
    ),
    creatorsNeedingAvatar: db.prepare(`
      SELECT DISTINCT creator_name, json_extract(raw_json, '$.creator.avatarUrl') AS avatar_url
      FROM posts
      WHERE source = 'inspora' AND creator_avatar IS NULL
        AND json_extract(raw_json, '$.creator.avatarUrl') IS NOT NULL
    `),
    // 限定 inspora 行：两个源的展示名可能重名，不能让头像回填跨源覆盖
    updateAvatar: db.prepare(
      "UPDATE posts SET creator_avatar = ? WHERE creator_name = ? AND source = 'inspora'",
    ),
    knownTweetIds: (source) =>
      db
        .prepare('SELECT tweet_id FROM posts WHERE source = ? AND tweet_id IS NOT NULL')
        .all(source)
        .map((row) => row.tweet_id),
  };
  return { db, stmts };
}
