import type { PlateWallItem } from '@/components/plate-wall';
import { listPostCards } from '@personal-design/inspora';
import { matchesSearch } from '@/lib/browse-context';
import { categoryLabel } from '@/lib/category-label';
import { museThumbnailOf, museKeywords } from '@/lib/muse-detail';

export const MUSE_BATCH = 24;

// 只把客户端需要的字段传下去，控制 RSC 负载。
export const museItems: PlateWallItem[] = listPostCards().map((post) => {
  const first = post.media[0];
  const src = first?.type === 'video' ? first.previewSrc : (first?.thumb ?? first?.src);
  return {
    key: post.slug,
    category: post.category ?? '未分类',
    lead: post.creatorName ?? undefined,
    name: post.title,
    sub: post.createdAt.slice(0, 10),
    href: `/products/muse/${post.slug}`,
    kind: first?.type ?? 'image',
    src: src ?? '',
    poster: museThumbnailOf(post),
    fullSrc: first?.type === 'image' ? (first.src ?? first.thumb ?? undefined) : undefined,
    width: first?.width ?? 4,
    height: first?.height ?? 3,
    mediaCount: post.mediaCount,
    keywords: museKeywords(post),
  };
});

export const museTabs = (() => {
  const counts = new Map<string, number>();
  for (const item of museItems) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const uncategorized = counts.get('未分类');
  counts.delete('未分类');
  // 稳定排序让同数分类保持作品列表首次出现的顺序。
  const tabs = Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count,
  );
  if (uncategorized) tabs.push({ name: '未分类', count: uncategorized });
  return tabs;
})();

type MuseFilter = { q?: string; category?: string };
export function museMatches(item: PlateWallItem, { q = '', category }: MuseFilter) {
  return (
    (!category || category === '全部' || item.category === category) &&
    matchesSearch(q, [item.name, item.lead, item.keywords, categoryLabel(item.category)])
  );
}
export const filterMuseItems = (filters: MuseFilter) =>
  museItems.filter((item) => museMatches(item, filters));

export function musePage({
  offset = 0,
  limit = MUSE_BATCH,
  ...filters
}: MuseFilter & { offset?: number; limit?: number }) {
  const matched = filterMuseItems(filters);
  return {
    total: matched.length,
    hasMore: offset + limit < matched.length,
    items: matched.slice(offset, offset + limit),
  };
}

export function musePreviewOf(
  item: PlateWallItem,
  absolute: (value: string | null | undefined) => string,
) {
  return {
    id: item.key,
    title: item.name,
    category: categoryLabel(item.category),
    topic: '',
    author: item.lead ?? '',
    text: '',
    sourceURL: '',
    thumbnail: absolute(item.poster || item.src),
    media: item.src
      ? [
          {
            id: item.key,
            kind: item.kind,
            url: absolute(item.kind === 'image' ? item.fullSrc || item.src : item.src),
            poster: absolute(item.poster),
            width: item.width,
            height: item.height,
          },
        ]
      : [],
  };
}
