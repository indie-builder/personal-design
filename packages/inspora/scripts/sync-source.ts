import { Data, Effect } from 'effect';

export class FeedError extends Data.TaggedError('Feed')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface FeedPage<A extends { id: string }> {
  items: A[];
  nextCursor: string | null;
}

export interface InsporaMedia {
  id: string;
  position?: number;
  type: string;
  url: string;
  posterUrl?: string | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  alt?: string | null;
  variants?: { bytes: number; url: string }[];
}

export interface InsporaPost {
  id: string;
  slug: string;
  title: string;
  createdAt: string;
  creator?: { name?: string; url?: string; avatarUrl?: string };
  description?: string | null;
  category?: string | null;
  industries?: string[];
  colors?: string[];
  styles?: string[];
  sourceUrl?: string | null;
  publishedAt?: string | null;
  isFeatured?: boolean;
  media?: InsporaMedia[];
}

export function extractInitialPage<A extends { id: string } = { id: string }>(
  html: string,
): FeedPage<A> {
  const text = rscText(html);
  const marker = '"initialPage":';
  const index = text.indexOf(marker);
  const page =
    index < 0 ? null : JSON.parse(extractBalancedObject(text, index + marker.length) ?? 'null');
  if (
    !Array.isArray(page?.items) ||
    !(page.nextCursor === null || typeof page.nextCursor === 'string')
  ) {
    throw new FeedError({ message: '页面缺少有效 initialPage，可能是校验页或上游结构变化' });
  }
  return page;
}

// 完整发现后才交给调用方写库，分页失败不会留下会截断下次增量的半页数据。
export function collectFeed<A extends { id: string }, E, R>(
  categories: string[],
  knownIds: ReadonlySet<string>,
  fetchPage: (category: string, cursor: string | null) => Effect.Effect<FeedPage<A>, E, R>,
  { full = false, maxPages = Infinity }: { full?: boolean; maxPages?: number } = {},
) {
  return Effect.gen(function* () {
    const items = new Map<string, A>();
    for (const category of categories) {
      let cursor: string | null = null;
      let complete = false;
      for (let page = 0; page < maxPages; page++) {
        const data: FeedPage<A> = yield* fetchPage(category, cursor);
        if (!Array.isArray(data.items))
          return yield* Effect.fail(new FeedError({ message: `${category}: 列表数据无效` }));
        for (const item of data.items) {
          if (!full && knownIds.has(item.id)) {
            complete = true;
            break;
          }
          items.set(item.id, item);
        }
        cursor = data.nextCursor;
        if (!cursor) complete = true;
        if (complete) break;
      }
      if (!complete)
        return yield* Effect.fail(
          new FeedError({
            message: `${category}: 未覆盖到已入库作品或列表末尾，请提高 --max-pages`,
          }),
        );
    }
    return [...items.values()];
  });
}

function rscText(html: string) {
  const payloads: string[] = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m;
  while ((m = re.exec(html))) payloads.push(JSON.parse(m[1]!));
  return payloads.join('');
}

/** 从详情页 HTML 的 __next_f payload 中提取含 sourceUrl 的帖子对象 */
export function extractDetailPost(html: string, postId: string): InsporaPost | null {
  const text = rscText(html);

  // 帖子对象可能出现多次（详情 + 相关推荐），取含 sourceUrl 的那个
  const marker = `{"id":"${postId}"`;
  let idx = text.indexOf(marker);
  while (idx >= 0) {
    const obj = extractBalancedObject(text, idx);
    if (obj) {
      try {
        const parsed = JSON.parse(obj);
        if (parsed.sourceUrl || parsed.description) return parsed;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        // 不是纯 JSON（含 RSC 引用），继续找下一个
      }
    }
    idx = text.indexOf(marker, idx + 1);
  }
  return null;
}

/** 从 start（必须是 '{' 前一个字符的位置）开始提取配平的大括号串，字符串感知 */
function extractBalancedObject(text: string, start: number) {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
