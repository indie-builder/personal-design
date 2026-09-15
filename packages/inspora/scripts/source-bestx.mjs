/**
 * Best Designs on X（bestdesignsonx.com）同步源。
 *
 * 数据面：站点自用的公开 Supabase REST（anon key 本就随其前端 bundle 分发），
 * 表 bestdesignsonx，`status=eq.Published`，按 published_at 倒序翻页，无需浏览器。
 * - 每行是一条推文收录：post_url 形如 `/handle/status/<tweet_id>`，
 *   media 为站点 CDN（cdn.bestdesignsonx.com，X 媒体镜像）直链数组。
 * - 媒体（图/视频封面/视频）全部热链，不入库下载；头像同样热链。
 * - 去重键 = 归一化推文 id（tweet_id），与 inspora 的 source_url 同源可比对；
 *   两个源指向同一条原作时，读取侧只展示 inspora 版本（见 src/index.ts）。
 * - 增量逻辑：按 published_at 倒序，遇到已入库 tweet_id 即停；完整发现后事务写入。
 *   上游行内字段更新（互动数等）不会回扫，需要刷新时用 `--full`。
 */
import { sleep } from './download.mjs';

const SUPABASE_URL = 'https://tuzpqmdnxvlzwqthgseg.supabase.co/rest/v1/bestdesignsonx';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1enBxbWRueHZsendxdGhnc2VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzUxOTY4MjYsImV4cCI6MjA1MDc3MjgyNn0.rIjO0FCY9rPgsJXCxBho3sCRiepy3s319_BoK6DPZ-U';
const FIELDS =
  'id,author_name,handle,tweet_text,time,post_url,interaction,status,media,created_at,avatar,featured,user_id,published_at,tags';

export function tweetIdOf(postUrl) {
  const match = /\/status\/(\d+)/.exec(postUrl ?? '');
  return match ? match[1] : null;
}

/** 标题取推文首行非链接文本（首行常是作品链接），截断 120 字符；空推文回退 @handle */
export function deriveTitle(tweetText, handle) {
  const lines = (tweetText ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines.find((line) => !/^https?:\/\//i.test(line)) ?? lines[0] ?? '';
  const title = first.length > 120 ? `${first.slice(0, 119)}…` : first;
  return title || `@${handle ?? 'unknown'}`;
}

const intOf = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const isoOf = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function mapMedia(entry, tweetId, position) {
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
export function mapBestxPost(row) {
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
      .filter(Boolean),
  };
}

/**
 * 增量（默认）：published_at 倒序翻到已入库 tweet_id 即停；
 * `--full`：翻完全表并 upsert。两态都是完整发现后事务写入。
 */
export async function syncBestx({ db, stmts, full = false, pageSize = 120, pageSleepMs = 250 }) {
  const known = new Set(stmts.knownTweetIds('bestx'));
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  const items = new Map(); // tweetId → 映射结果（同推文重复行保留先见的）
  let complete = false;
  let page = 0;
  while (!complete) {
    const params = new URLSearchParams({
      select: FIELDS,
      status: 'eq.Published',
      // 不过滤 published_at：站点列表同样展示没有发布时间的存量行，
      // 它们经 nullslast 落在排序尾部，由 --full 收进，日常增量从头部即停
      order: 'published_at.desc.nullslast',
      offset: String(page * pageSize),
      limit: String(pageSize),
    });
    const res = await fetch(`${SUPABASE_URL}?${params}`, { headers });
    if (!res.ok) {
      throw new Error(`bestx 列表 HTTP ${res.status}（第 ${page + 1} 页），未写入新增作品`);
    }
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('bestx 列表数据无效');
    for (const row of rows) {
      const item = mapBestxPost(row);
      if (!item) continue;
      if (!full && known.has(item.tweetId)) {
        complete = true;
        break;
      }
      items.set(item.tweetId, item);
    }
    page++;
    if (rows.length < pageSize) complete = true;
    console.log(`bestx 第 ${page} 页: 累计 ${items.size} 条`);
    if (!complete) await sleep(pageSleepMs);
  }

  let inserted = 0;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
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
        null,
        item.sourceUrl,
        item.createdAt,
        item.publishedAt,
        item.isFeatured ? 1 : 0,
        JSON.stringify(item.raw),
        now, // bestx 无详情补全阶段，入库即视为已补全
        now,
        'bestx',
        item.tweetId,
      );
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
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { discovered: items.size, inserted };
}
