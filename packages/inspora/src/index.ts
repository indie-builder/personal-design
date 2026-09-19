/**
 * inspora 数据包查询 API —— web 端只通过这里取数，不直接读 DB、不手拼路径。
 * 数据由 `scripts/sync.mjs` 生成：inspora.db（SQLite）+ apps/web/public/inspora/（海报/缩略图/头像）。
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
  /** 作者头像（inspora 为本地路径，bestx 为 CDN 热链） */
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
  /** 上游原始 JSON（详情页 RSC 里提取的完整帖子对象） */
  raw: unknown;
  /** 数据来源：inspora（灵感站）或 bestx（Best Designs on X） */
  source: 'inspora' | 'bestx';
  /** 归一化后的原作推文 id，跨源去重键（详情补全前 inspora 行可能为空） */
  tweetId: string | null;
}

export interface InsporaCategory {
  name: string;
  count: number;
}

/** Use the provider's existing lightweight clip for simultaneous previews; full playback keeps src. */
export function videoPreviewUrl(
  post: Pick<InsporaPost, 'raw'>,
  media: Pick<InsporaMedia, 'id' | 'type' | 'src'>,
): string | null {
  if (
    media.type !== 'video' ||
    !post.raw ||
    typeof post.raw !== 'object' ||
    !('media' in post.raw) ||
    !Array.isArray(post.raw.media)
  )
    return media.src;
  const record = post.raw.media.find(
    (entry) => entry && typeof entry === 'object' && entry.id === media.id,
  );
  const preview = record?.videoPreview;
  if (
    !preview ||
    typeof preview !== 'object' ||
    typeof preview.url !== 'string' ||
    !preview.url.startsWith('https://')
  )
    return media.src;
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
    return media.src;
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
  raw_json: string | null;
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
}

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
    src: mediaUrl(row.local_path, row.url),
    poster: mediaUrl(row.local_poster_path, row.poster_url),
    thumb: mediaUrl(row.local_thumb_path, row.poster_url ?? row.url),
  };
}

function toPost(row: PostRow, media: InsporaMedia[]): InsporaPost {
  let raw: unknown = null;
  if (row.raw_json) {
    try {
      raw = JSON.parse(row.raw_json);
    } catch {
      raw = null;
    }
  }
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
    raw,
    source: row.source === 'bestx' ? 'bestx' : 'inspora',
    tweetId: row.tweet_id,
  };
}

/**
 * 跨源去重：同一原作推文被两个源都收录时，只展示 inspora 版本（数据更全）。
 * inspora 行、无 tweet_id 的行始终可见。整体括号包裹，便于与其他条件 AND 连用。
 */
const VISIBLE_POSTS = `(
  source = 'inspora' OR tweet_id IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM posts AS twin
    WHERE twin.source = 'inspora' AND twin.tweet_id = posts.tweet_id
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
    .prepare(`SELECT * FROM posts WHERE ${VISIBLE_POSTS} ORDER BY created_at DESC`)
    .all() as unknown as PostRow[];
  const mediaMap = mediaForPosts(rows.map((r) => r.id));
  return rows.map((r) => toPost(r, mediaMap.get(r.id) ?? []));
}

/** 浏览导航用的轻量条目：不含媒体与 raw，避免每次请求全量加载万级媒体行和大 JSON */
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

export function getPostBySlug(slug: string): InsporaPost | undefined {
  const row = conn()
    .prepare(`SELECT * FROM posts WHERE slug = ? AND ${VISIBLE_POSTS}`)
    .get(slug) as PostRow | undefined;
  if (!row) return undefined;
  const mediaMap = mediaForPosts([row.id]);
  return toPost(row, mediaMap.get(row.id) ?? []);
}

export function listCategories(): InsporaCategory[] {
  const rows = conn()
    .prepare(
      'SELECT category AS name, COUNT(*) AS count FROM posts WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC',
    )
    .all() as unknown as { name: string; count: number }[];
  // node:sqlite 返回 null 原型对象，RSC 序列化只认普通对象
  return rows.map((row) => ({ name: row.name, count: row.count }));
}
