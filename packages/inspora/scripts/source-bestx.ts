/**
 * Best Designs on X（bestdesignsonx.com）与 Collect UI（collectui.com）公开同步源。
 *
 * 数据面：站点自用的公开 Supabase REST（anon key 本就随其前端 bundle 分发），
 * 表 bestdesignsonx，`status=eq.Published`，按 published_at 倒序翻页，无需浏览器。
 * - 每行是一条推文收录：post_url 形如 `/handle/status/<tweet_id>`，
 *   media 为站点 CDN（cdn.bestdesignsonx.com，X 媒体镜像）直链数组。
 * - 媒体（图/视频封面/视频）全部热链，不入库下载；头像同样热链。
 * - 去重键 = 归一化推文 id（tweet_id），与 inspora 的 source_url 同源可比对；
 *   多源指向同一条原作时，读取侧仅显示一份（见 src/index.ts）。
 * - 增量逻辑：按 published_at 倒序，遇到已入库 tweet_id 即停；完整发现后事务写入。
 *   上游行内字段更新（互动数等）不会回扫，需要刷新时用 `--full`。
 * Collect UI 同服务的 collectui_posts 表按站点 created_at,id 倒序；每行媒体合并到原作。
 */
import { Data, Effect } from 'effect';
import { defaultRetrySchedule } from './download.ts';
import { withTransaction, database, databaseError, type Db } from './db.ts';

export class BestxError extends Data.TaggedError('Bestx')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

interface BestxMedia {
  type?: string;
  image?: string;
  video_url?: string;
  cover?: string | null;
  width?: string | number;
  height?: string | number;
  [key: string]: unknown;
}

export interface BestxRow {
  id?: string | number;
  post_url?: string | null;
  tweet_text?: string | null;
  handle?: string | null;
  time?: string | null;
  published_at?: string | null;
  created_at?: string | null;
  author_name?: string | null;
  avatar?: string | null;
  featured?: boolean;
  user_id?: unknown;
  tags?: unknown;
  interaction?: unknown;
  media?: BestxMedia[] | null;
}

interface CollectuiAuthor {
  name?: string;
  username?: string;
  avatar_url?: string;
  profile_image_url?: string;
}

export interface CollectuiRow {
  id: string;
  source_url: string | null;
  created_at?: string | null;
  published_at?: string | null;
  title?: string | null;
  media_type: string;
  media_url?: string;
  thumbnail?: string | null;
  media_index?: number;
  categories?: string[];
  featured?: boolean;
  designer?: CollectuiAuthor | null;
  designer_username?: string;
  metadata?: {
    author?: CollectuiAuthor;
    entities?: {
      media?: { media_url_https?: string; original_info?: { width?: number; height?: number } }[];
    };
  };
}

interface MappedMedia {
  id: string;
  position?: number;
  type: string;
  url: string;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  raw: BestxMedia | CollectuiRow;
}

interface MappedPost {
  id: string;
  slug: string;
  tweetId: string;
  title: string;
  description: string | null;
  creatorName: string | null;
  creatorUrl: string | null;
  creatorAvatar: string | null;
  sourceUrl: string | null;
  category: null;
  styles?: string[];
  createdAt: string;
  publishedAt: string | null;
  isFeatured: boolean;
  raw: { entries?: CollectuiRow[]; [key: string]: unknown };
  media: MappedMedia[];
}

const SUPABASE_URL = 'https://tuzpqmdnxvlzwqthgseg.supabase.co/rest/v1/';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1enBxbWRueHZsendxdGhnc2VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxOTY4MjYsImV4cCI6MjA1MDc3MjgyNn0.rIjO0FCY9rPgsJXCxBho3sCRiepy3s319_BoK6DPZ-U';
const FIELDS =
  'id,author_name,handle,tweet_text,time,post_url,interaction,status,media,created_at,avatar,featured,user_id,published_at,tags';

export function tweetIdOf(postUrl: string | null | undefined) {
  const match = /\/status\/(\d+)/.exec(postUrl ?? '');
  return match ? match[1] : null;
}

/** 标题取推文首行非链接文本（首行常是作品链接），截断 120 字符；空推文回退 @handle */
export function deriveTitle(
  tweetText: string | null | undefined,
  handle: string | null | undefined,
) {
  const lines = (tweetText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines.find((line) => !/^https?:\/\//i.test(line)) ?? lines[0] ?? '';
  const title = first.length > 120 ? `${first.slice(0, 119)}…` : first;
  return title || `@${handle ?? 'unknown'}`;
}

const intOf = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const isoOf = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function mapMedia(entry: BestxMedia, tweetId: string, position: number): MappedMedia | null {
  const width = intOf(entry.width);
  const height = intOf(entry.height);
  if (entry.type === 'photo' && entry.image) {
    return {
      id: `bestx-${tweetId}-${position}`,
      type: 'image',
      url: entry.image,
      posterUrl: null,
      width,
      height,
      raw: entry,
    };
  }
  // video 与 animated_gif（X 的 gif 实为 mp4）都按视频处理
  if ((entry.type === 'video' || entry.type === 'animated_gif') && entry.video_url) {
    return {
      id: `bestx-${tweetId}-${position}`,
      type: 'video',
      url: entry.video_url,
      posterUrl: entry.cover ?? null,
      width,
      height,
      raw: entry,
    };
  }
  return null;
}

/** 上游行 → 本包 posts/media 结构；无法提取推文 id 或时间的行返回 null */
export function mapBestxPost(row: BestxRow): MappedPost | null {
  const tweetId = tweetIdOf(row.post_url);
  if (!tweetId) return null;
  const title = deriveTitle(row.tweet_text, row.handle);
  const text = (row.tweet_text ?? '').trim();
  // 部分存量行没有 published_at，时间回退到推文时间、收录时间
  const createdAt = isoOf(row.time ?? row.published_at ?? row.created_at);
  if (!createdAt) return null;
  return {
    id: `bestx-${tweetId}`,
    slug: `x-${tweetId}`,
    tweetId,
    title,
    // 说明只在比标题多出内容时保留（详情页不重复展示）
    description: text && text !== title ? text : null,
    creatorName: row.author_name || (row.handle ? `@${row.handle}` : null),
    creatorUrl: row.handle ? `https://x.com/${row.handle}` : null,
    // 头像存 CDN 直链，查询层按 https 前缀识别为热链（见 src/index.ts）
    creatorAvatar: row.avatar ?? null,
    sourceUrl: row.post_url?.startsWith('/')
      ? `https://x.com${row.post_url}`
      : (row.post_url ?? null),
    category: null,
    createdAt,
    publishedAt: isoOf(row.published_at),
    isFeatured: row.featured === true,
    raw: {
      id: row.id,
      handle: row.handle,
      user_id: row.user_id,
      post_url: row.post_url,
      tweet_text: row.tweet_text,
      time: row.time,
      published_at: row.published_at,
      tags: row.tags,
      featured: row.featured,
      interaction: row.interaction,
      media: row.media,
    },
    media: (row.media ?? [])
      .map((entry, position) => mapMedia(entry, tweetId, position))
      .filter(Boolean) as MappedMedia[],
  };
}

/** Collect UI 同一原作的每件媒体占一行，复用推文键与标题规则，媒体保持 CDN 热链。 */
export function mapCollectuiPost(row: CollectuiRow): MappedPost | null {
  const tweetId = tweetIdOf(row.source_url);
  const createdAt = isoOf(row.created_at);
  if (!tweetId || !createdAt || !row.media_url || !['image', 'video'].includes(row.media_type))
    return null;
  const author = row.designer ?? row.metadata?.author ?? {};
  const handle = author.username ?? row.designer_username;
  const title = deriveTitle(row.title, handle);
  const entity = row.metadata?.entities?.media?.[row.media_index ?? 0];
  // 上游 thumbnail 常为 mp4，不能传给图片海报；优先使用原始媒体的静态封面。
  const poster =
    row.thumbnail && !/\.mp4(?:[?#]|$)/i.test(row.thumbnail)
      ? row.thumbnail
      : (entity?.media_url_https ?? null);
  return {
    id: `collectui-${tweetId}`,
    slug: `c-${tweetId}`,
    tweetId,
    title,
    description: row.title?.trim() !== title ? (row.title?.trim() ?? null) : null,
    creatorName: author.name || (handle ? `@${handle}` : null),
    creatorUrl: handle ? `https://x.com/${handle}` : null,
    creatorAvatar: author.avatar_url ?? author.profile_image_url ?? null,
    sourceUrl: row.source_url,
    category: null,
    styles: row.categories ?? [],
    createdAt,
    publishedAt: isoOf(row.published_at),
    isFeatured: row.featured === true,
    raw: { entries: [row] },
    media: [
      {
        id: `collectui-${row.id}`,
        position: row.media_index ?? 0,
        type: row.media_type,
        url: row.media_url,
        posterUrl: row.media_type === 'video' ? poster : null,
        width: intOf(entity?.original_info?.width),
        height: intOf(entity?.original_info?.height),
        raw: row,
      },
    ],
  };
}

/**
 * 增量（默认）：published_at 倒序翻到已入库 tweet_id 即停；
 * `--full`：翻完全表并 upsert。两态都是完整发现后事务写入。
 */
export function syncBestx({
  db,
  stmts,
  full = false,
  source = 'bestx',
  pageSize = 120,
  pageSleepMs = 250,
}: Db & { full?: boolean; source?: string; pageSize?: number; pageSleepMs?: number }) {
  return Effect.gen(function* () {
    if (!['bestx', 'collectui'].includes(source))
      return yield* Effect.fail(new BestxError({ message: `未知公开来源: ${source}` }));
    const collectui = source === 'collectui';
    const known = new Set(yield* database(() => stmts.knownTweetIds(source)));
    const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
    const items = new Map<string, MappedPost>(); // tweetId → 映射结果（同推文重复行保留先见的）
    let complete = false;
    let page = 0;
    while (!complete) {
      const params = new URLSearchParams({
        select: collectui ? '*,designer:designer_x_profile_id(*)' : FIELDS,
        status: 'eq.Published',
        // 不过滤 published_at：站点列表同样展示没有发布时间的存量行，
        // 它们经 nullslast 落在排序尾部，由 --full 收进，日常增量从头部即停
        order: collectui ? 'created_at.desc,id.desc' : 'published_at.desc.nullslast',
        offset: String(page * pageSize),
        limit: String(pageSize),
      });
      const table = collectui ? 'collectui_posts' : 'bestdesignsonx';
      const rows = yield* Effect.tryPromise({
        try: async (signal) => {
          const res = await fetch(`${SUPABASE_URL}${table}?${params}`, {
            headers,
            signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
          });
          if (!res.ok) {
            throw new BestxError({
              message: `${source} 列表 HTTP ${res.status}（第 ${page + 1} 页），未写入新增作品`,
            });
          }
          const rows: unknown = await res.json();
          if (!Array.isArray(rows)) throw new BestxError({ message: `${source} 列表数据无效` });
          return rows as (BestxRow & CollectuiRow)[];
        },
        catch: (cause) => {
          if (cause instanceof BestxError) return cause;
          if (
            !(cause instanceof Error) ||
            cause.name === 'AssertionError' ||
            cause instanceof ReferenceError ||
            cause instanceof RangeError ||
            (cause instanceof TypeError && cause.message !== 'fetch failed')
          )
            throw cause;
          return new BestxError({ message: cause.message, cause });
        },
      }).pipe(Effect.retry(defaultRetrySchedule));
      for (const row of rows) {
        const item = collectui ? mapCollectuiPost(row) : mapBestxPost(row);
        if (!item) continue;
        if (!full && known.has(item.tweetId)) {
          complete = true;
          break;
        }
        const previous = items.get(item.tweetId);
        if (collectui && previous) {
          previous.raw.entries!.push(row);
          if (!previous.media.some((media) => media.url === item.media[0]!.url))
            previous.media.push(...item.media);
          previous.styles = [...new Set([...previous.styles!, ...item.styles!])];
        } else if (!previous) items.set(item.tweetId, item);
      }
      page++;
      if (rows.length < pageSize) complete = true;
      console.log(`${source} 第 ${page} 页: 累计 ${items.size} 条`);
      if (!complete) yield* Effect.sleep(pageSleepMs);
    }

    let inserted = 0;
    const now = new Date().toISOString();
    yield* Effect.tryPromise({
      try: () =>
        withTransaction(db, () => {
          for (const item of items.values()) {
            const isNew = !stmts.hasPost.get(item.id);
            stmts.upsertPost.run(
              item.id,
              item.slug,
              item.title,
              item.creatorName,
              item.creatorUrl,
              item.creatorAvatar,
              item.description,
              item.category,
              null,
              null,
              item.styles ? JSON.stringify(item.styles) : null,
              item.sourceUrl,
              item.createdAt,
              item.publishedAt,
              item.isFeatured ? 1 : 0,
              JSON.stringify(item.raw),
              now, // 公开 REST 源无详情补全阶段，入库即视为已补全
              now,
              source,
              item.tweetId,
            );
            item.media.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            for (const [position, media] of item.media.entries()) {
              stmts.upsertMedia.run(
                media.id,
                item.id,
                position,
                media.type,
                media.url,
                media.posterUrl,
                media.width,
                media.height,
                null,
                null,
                null,
                null,
                null,
                JSON.stringify(media.raw),
              );
            }
            if (isNew) inserted++;
          }
        }),
      catch: (cause) => databaseError(cause),
    });
    return { discovered: items.size, inserted };
  });
}
