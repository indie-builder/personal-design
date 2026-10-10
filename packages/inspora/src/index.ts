/**
 * inspora 数据包查询 API —— web 端只通过这里取数，不直接读 DB、不手拼路径。
 * 数据由 `scripts/sync.ts` 生成：inspora.db（SQLite）+ apps/web/public/inspora/（海报/缩略图/头像）。
 * 大图与视频热链原站（media.inspora.design），本地文件存在时优先用本地副本。
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_DIR = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(PKG_DIR, '../inspora.db');
const PUBLIC_DIR = path.resolve(PKG_DIR, '../../../apps/web/public');

/** 媒体 base：缺省为空（本地 public 路径）；设 NEXT_PUBLIC_MEDIA_BASE_URL（对象存储公开域名）后返回绝对 URL */
const MEDIA_BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, '');
const MEDIA_VERSION = process.env.NEXT_PUBLIC_MEDIA_VERSION;

/** 本地副本存在用本地（含外置 base），否则回退热链原站 */
function mediaUrl(localPath: string | null, upstream: string | null): string | null {
  if (localPath && existsSync(path.join(PUBLIC_DIR, localPath))) {
    return `${MEDIA_BASE}${localPath}${MEDIA_VERSION ? `?v=${MEDIA_VERSION}` : ''}`;
  }
  return upstream;
}

let db: DatabaseSync | undefined;
function conn(): DatabaseSync {
  db ??= new DatabaseSync(DB_PATH, { readOnly: true });
  return db;
}

export interface InsporaMedia {
  id: string;
  postId: string;
  position: number;
  type: 'image' | 'video';
  /** 上游原始 URL（media.inspora.design） */
  url: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  alt: string | null;
  /** 媒体地址：本地副本存在时为本地路径（或外置 base URL），否则为原站热链 URL */
  src: string | null;
  /** 轻量视频预览；没有合适预览或为图片时保留完整媒体地址。 */
  previewSrc: string | null;
  /** 视频封面（本地优先，缺省原站） */
  poster: string | null;
  /** 缩略图（本地优先，缺省原站）：图片为最小 variant，视频为封面 */
  thumb: string | null;
}

export interface InsporaPost {
  id: string;
  slug: string;
  title: string;
  creatorName: string | null;
  /** 作者主页（多为 x.com） */
  creatorUrl: string | null;
  /** 作者头像（inspora 为本地路径，公开 REST 源为热链） */
  creatorAvatar: string | null;
  description: string | null;
  category: string | null;
  industries: string[];
  colors: string[];
  styles: string[];
  /** 原始出处（多为 X 原帖）——「查看原信息」的核心字段 */
  sourceUrl: string | null;
  createdAt: string;
  publishedAt: string | null;
  isFeatured: boolean;
  media: InsporaMedia[];
  /** 内部数据来源 */
  source: 'inspora' | 'bestx' | 'collectui';
  /** 归一化后的原作推文 id，跨源去重键（详情补全前 inspora 行可能为空） */
  tweetId: string | null;
}

/** Use the provider's existing lightweight clip for simultaneous previews; full playback keeps src. */
function videoPreviewUrl(row: MediaRow, src: string | null): string | null {
  if (row.type !== 'video' || !row.raw_json) return src;
  let record;
  try {
    record = JSON.parse(row.raw_json);
  } catch {
    return src;
  }
  if (!record || typeof record !== 'object' || record.id !== row.id) return src;
  const preview = record.videoPreview;
  if (
    !preview ||
    typeof preview !== 'object' ||
    typeof preview.url !== 'string' ||
    !preview.url.startsWith('https://')
  )
    return src;
  const smallerResolution =
    preview.width > 0 &&
    preview.height > 0 &&
    record.width > 0 &&
    record.height > 0 &&
    preview.width * preview.height < record.width * record.height;
  if (
    preview.bytes > 0 &&
    record.sizeBytes > 0 &&
    preview.bytes >= record.sizeBytes &&
    !smallerResolution
  )
    return src;
  return preview.url;
}

interface PostRow {
  id: string;
  slug: string;
  title: string;
  creator_name: string | null;
  creator_url: string | null;
  creator_avatar: string | null;
  description: string | null;
  category: string | null;
  industries: string | null;
  colors: string | null;
  styles: string | null;
  source_url: string | null;
  created_at: string;
  published_at: string | null;
  is_featured: number;
  source: string;
  tweet_id: string | null;
}

interface MediaRow {
  id: string;
  post_id: string;
  position: number;
  type: string;
  url: string;
  poster_url: string | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  alt: string | null;
  local_path: string | null;
  local_poster_path: string | null;
  local_thumb_path: string | null;
  raw_json: string | null;
}

const POST_COLUMNS = `id, slug, title, creator_name, creator_url, creator_avatar,
  description, category, industries, colors, styles, source_url, created_at,
  published_at, is_featured, source, tweet_id`;

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function toMedia(row: MediaRow): InsporaMedia {
  const src = mediaUrl(row.local_path, row.url);
  return {
    id: row.id,
    postId: row.post_id,
    position: row.position,
    type: row.type === 'video' ? 'video' : 'image',
    url: row.url,
    posterUrl: row.poster_url,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    alt: row.alt,
    src,
    previewSrc: videoPreviewUrl(row, src),
    poster: mediaUrl(row.local_poster_path, row.poster_url),
    thumb: mediaUrl(row.local_thumb_path, row.poster_url ?? row.url),
  };
}

function toPost(row: PostRow, media: InsporaMedia[]): InsporaPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    creatorName: row.creator_name,
    creatorUrl: row.creator_url,
    // inspora 头像是本地 public 路径；bestx 头像是 https 直链，本地不存在时按原链返回
    creatorAvatar: mediaUrl(
      row.creator_avatar,
      row.creator_avatar?.startsWith('https://') ? row.creator_avatar : null,
    ),
    description: row.description,
    category: row.category,
    industries: parseJsonArray(row.industries),
    colors: parseJsonArray(row.colors),
    styles: parseJsonArray(row.styles),
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    publishedAt: row.published_at,
    isFeatured: row.is_featured === 1,
    media,
    source: row.source as InsporaPost['source'],
    tweetId: row.tweet_id,
  };
}

/**
 * 同一原作只展示一份，依次优先 inspora、bestx、collectui；同源用 id 决定唯一版本。
 * 无 tweet_id 的行保留。列表、详情、导航与分类计数共用这一个条件。
 */
const VISIBLE_POSTS = `(
  tweet_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM posts AS twin
    WHERE twin.tweet_id = posts.tweet_id AND (
      (CASE twin.source WHEN 'inspora' THEN 0 WHEN 'bestx' THEN 1 ELSE 2 END)
        < (CASE posts.source WHEN 'inspora' THEN 0 WHEN 'bestx' THEN 1 ELSE 2 END)
      OR (twin.source = posts.source AND twin.id < posts.id)
    )
  )
)`;

const MEDIA_CHUNK = 900; // SQLite 变量数上限以内，分批查媒体

function mediaForPosts(postIds: string[]): Map<string, InsporaMedia[]> {
  const map = new Map<string, InsporaMedia[]>();
  for (let offset = 0; offset < postIds.length; offset += MEDIA_CHUNK) {
    const chunk = postIds.slice(offset, offset + MEDIA_CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = conn()
      .prepare(`SELECT * FROM media WHERE post_id IN (${placeholders}) ORDER BY position`)
      .all(...chunk) as unknown as MediaRow[];
    for (const row of rows) {
      const list = map.get(row.post_id) ?? [];
      list.push(toMedia(row));
      map.set(row.post_id, list);
    }
  }
  return map;
}

/** 全部帖子，按发布时间倒序 */
export function listPosts(): InsporaPost[] {
  const rows = conn()
    .prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE ${VISIBLE_POSTS} ORDER BY created_at DESC`)
    .all() as unknown as PostRow[];
  const mediaMap = mediaForPosts(rows.map((r) => r.id));
  return rows.map((r) => toPost(r, mediaMap.get(r.id) ?? []));
}

export interface InsporaPostPreview {
  src: string;
  alt: string;
  videoSrc?: string;
}

/** 前 limit 个首媒体封面，另将第一个可播放的首媒体视频置前（允许重复）。 */
export function listPostPreviews(limit = 3): InsporaPostPreview[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('Invalid preview limit');
  // 与 listPosts 的帖子及媒体排序相同；只读首媒体，不加载整帖或后续媒体。
  // iterate 在够用时停止，文件存在性与空字符串回退仍由原媒体解析决定。
  const query = `SELECT posts.title, media.* FROM posts
    JOIN media ON media.rowid = (
      SELECT rowid FROM media WHERE post_id = posts.id ORDER BY position LIMIT 1
    )
    WHERE ${VISIBLE_POSTS}`;
  const previews: InsporaPostPreview[] = [];
  if (limit > 0) {
    for (const row of conn().prepare(`${query} ORDER BY posts.created_at DESC`).iterate()) {
      const media = toMedia(row as unknown as MediaRow);
      const src = media.thumb ?? media.poster;
      if (src) previews.push({ src, alt: row.title as string });
      if (previews.length === limit) break;
    }
  }
  for (const row of conn()
    .prepare(`${query} AND media.type = 'video' ORDER BY posts.created_at DESC`)
    .iterate()) {
    const media = toMedia(row as unknown as MediaRow);
    if (!media.src) continue;
    previews.unshift({
      src: media.thumb ?? media.poster ?? '',
      alt: row.title as string,
      videoSrc: media.previewSrc ?? media.src,
    });
    break;
  }
  return previews;
}

/** 浏览导航用的轻量条目：不含媒体，避免每次请求全量加载万级媒体行 */
export interface InsporaPostRef {
  slug: string;
  title: string;
  creatorName: string | null;
  category: string | null;
  industries: string[];
  styles: string[];
}

/** 全部可见帖子的轻量索引，按发布时间倒序（与 listPosts 同序），只取浏览导航所需字段 */
export function listPostRefs(): InsporaPostRef[] {
  const rows = conn()
    .prepare(
      `SELECT slug, title, creator_name, category, industries, styles FROM posts WHERE ${VISIBLE_POSTS} ORDER BY created_at DESC`,
    )
    .all() as unknown as {
    slug: string;
    title: string;
    creator_name: string | null;
    category: string | null;
    industries: string | null;
    styles: string | null;
  }[];
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    creatorName: row.creator_name,
    category: row.category,
    industries: parseJsonArray(row.industries),
    styles: parseJsonArray(row.styles),
  }));
}

export interface InsporaPostCard extends InsporaPostRef {
  createdAt: string;
  media: InsporaMedia[];
  mediaCount: number;
}

/** 网格只转换首媒体，计数仍包含全部媒体；无媒体的作品也保留。 */
export function listPostCards(): InsporaPostCard[] {
  const rows = conn()
    .prepare(
      `SELECT posts.slug, posts.title, posts.creator_name, posts.category,
        posts.industries, posts.styles, posts.created_at, media.*,
        (SELECT COUNT(*) FROM media WHERE post_id = posts.id) AS media_count
      FROM posts LEFT JOIN media ON media.rowid = (
        SELECT rowid FROM media WHERE post_id = posts.id ORDER BY position LIMIT 1
      )
      WHERE ${VISIBLE_POSTS} ORDER BY posts.created_at DESC`,
    )
    .all() as unknown as (MediaRow & {
    slug: string;
    title: string;
    creator_name: string | null;
    category: string | null;
    industries: string | null;
    styles: string | null;
    created_at: string;
    media_count: number;
  })[];
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    creatorName: row.creator_name,
    category: row.category,
    industries: parseJsonArray(row.industries),
    styles: parseJsonArray(row.styles),
    createdAt: row.created_at,
    media: row.media_count ? [toMedia(row)] : [],
    mediaCount: row.media_count,
  }));
}

export function getPostBySlug(slug: string): InsporaPost | undefined {
  const row = conn()
    .prepare(`SELECT ${POST_COLUMNS} FROM posts WHERE slug = ? AND ${VISIBLE_POSTS}`)
    .get(slug) as PostRow | undefined;
  if (!row) return undefined;
  const mediaMap = mediaForPosts([row.id]);
  return toPost(row, mediaMap.get(row.id) ?? []);
}
