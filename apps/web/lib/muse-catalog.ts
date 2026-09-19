import type { PlateWallItem } from '@/components/plate-wall';
import { listCategories, listPosts, videoPreviewUrl } from '@personal-design/inspora';
import { matchesSearch } from '@/lib/browse-context';
import { categoryLabel } from '@/lib/category-label';

/** 首屏与滚动追加的批大小 */
export const MUSE_BATCH = 24;

const posts = listPosts();

// 只把客户端需要的字段传下去，控制 RSC 负载
export const museItems: PlateWallItem[] = posts.flatMap((post) => {
  const first = post.media[0];
  const src = first?.type === 'video' ? videoPreviewUrl(post, first) : (first?.thumb ?? first?.src);
  return [
    {
      key: post.slug,
      category: post.category ?? '未分类',
      lead: post.creatorName ?? undefined,
      name: post.title,
      sub: post.createdAt.slice(0, 10),
      href: `/products/muse/${post.slug}`,
      kind: first?.type ?? 'image',
      src: src ?? '',
      poster: first?.poster ?? first?.thumb,
      fullSrc: first?.type === 'image' ? (first.src ?? first.thumb ?? undefined) : undefined,
      width: first?.width ?? 4,
      height: first?.height ?? 3,
      mediaCount: post.media.length,
      keywords: [post.category, ...post.industries, ...post.styles].filter(Boolean).join(' '),
    },
  ];
});

export const museTabs = (() => {
  const tabs = listCategories()
    .map((category) => ({
      ...category,
      count: museItems.filter((item) => item.category === category.name).length,
    }))
    .filter((category) => category.count > 0);
  const uncategorized = museItems.filter((item) => item.category === '未分类').length;
  if (uncategorized && !tabs.some((category) => category.name === '未分类'))
    tabs.push({ name: '未分类', count: uncategorized });
  return tabs;
})();

/** 与 PlateWall 客户端过滤同语义的服务端过滤（分类 tab + 搜索串）。 */
export function filterMuseItems({ q, category }: { q?: string; category?: string }) {
  const query = q ?? '';
  return museItems.filter(
    (item) =>
      (!category || category === '全部' || item.category === category) &&
      matchesSearch(query, [item.name, item.lead, item.keywords, categoryLabel(item.category)]),
  );
}
