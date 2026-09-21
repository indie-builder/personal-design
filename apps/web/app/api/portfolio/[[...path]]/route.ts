import { products } from '@/lib/products';
import { categoryLabel } from '@/lib/category-label';
import { matchesSearch } from '@/lib/browse-context';
import { filterMuseItems, museTabs } from '@/lib/muse-catalog';
import {
  catalog,
  categories,
  getLayoutById,
  imageUrl,
  thumbnailUrl,
  hasImage,
  upstream,
} from '@personal-design/layout-compositions';
import { getPostBySlug } from '@personal-design/inspora';
import { toolCategories } from '@personal-design/design-engineer-tools';
import { promoUrl, promoPosterUrl, websiteUrl } from '@personal-design/personal-sites';

/** Public read projection only. Never serialize provider records or raw payloads. */
export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const absolute = (value: string | null | undefined) =>
    value ? new URL(value, url.origin).href : '';
  const ok = (body: unknown) =>
    Response.json(body, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  const missing = () => Response.json({ error: '未找到内容' }, { status: 404 });
  const integer = (key: string, fallback: number, max: number) => {
    const raw = url.searchParams.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
  };
  const offset = integer('offset', 0, 1_000_000);
  const limit = integer('limit', 24, 60);
  if (offset === null || limit === null || limit < 1)
    return Response.json({ error: 'offset/limit 无效' }, { status: 400 });
  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length > 200) return Response.json({ error: '搜索词过长' }, { status: 400 });
  const cat = url.searchParams.get('cat') ?? '';
  const theme = url.searchParams.get('theme') ?? '';
  const page = <T>(items: T[]) => ({
    total: items.length,
    hasMore: offset + limit < items.length,
    items: items.slice(offset, offset + limit),
  });
  const layout = (item: (typeof catalog)[number]) => ({
    id: item.id,
    title: item.name,
    category: item.category,
    topic: item.subcategory,
    author: '',
    text: '',
    sourceURL: upstream.url,
    thumbnail: hasImage(item) ? absolute(thumbnailUrl(item)) : '',
    media: hasImage(item)
      ? [
          {
            id: item.id,
            kind: 'image',
            url: absolute(imageUrl(item)),
            poster: absolute(thumbnailUrl(item)),
            width: item.width,
            height: item.height,
          },
        ]
      : [],
  });
  if (path.length === 0)
    return ok({
      items: products.map((product) => ({
        id: product.slug,
        name: product.name,
        summary: product.tagline,
        description: product.description,
        date: product.date,
        dateLabel: product.dateLabel ?? (product.slug === 'personal-sites' ? '收录' : '上线'),
        cover: absolute(product.cover),
      })),
    });
  if (path[0] === 'layouts') {
    if (path.length === 2) {
      const item = getLayoutById(path[1] ?? '');
      return item ? ok({ item: layout(item) }) : missing();
    }
    if (path.length !== 1) return missing();
    const filtered = catalog.filter(
      (item) =>
        (!cat || item.category_slug === cat) &&
        (!theme || item.subcategory_slug === theme) &&
        matchesSearch(q, [item.name, item.category, item.subcategory]),
    );
    return ok({
      ...page(filtered.map(layout)),
      categories: categories.map((c) => ({
        id: c.slug,
        name: categoryLabel(c.name),
        count: c.count,
      })),
      topics: categories
        .filter((c) => !cat || c.slug === cat)
        .flatMap((c) => c.subcategories.map((t) => ({ id: t.slug, name: t.name, count: t.count }))),
      attribution: '图鉴改编自 nevertoday/350-layout-compositions · CC BY 4.0',
    });
  }
  if (path[0] === 'muse') {
    if (path.length === 2) {
      const post = getPostBySlug(path[1] ?? '');
      if (!post) return missing();
      return ok({
        item: {
          id: post.slug,
          title: post.title,
          category: categoryLabel(post.category ?? '未分类'),
          topic: '',
          author: post.creatorName ?? '',
          text: post.description ?? '',
          sourceURL: post.sourceUrl ?? '',
          thumbnail: absolute(post.media[0]?.poster ?? post.media[0]?.thumb),
          media: post.media
            .filter((media) => media.src)
            .map((media) => ({
              id: media.id,
              kind: media.type,
              url: absolute(media.src),
              poster: absolute(media.poster ?? media.thumb),
              width: media.width ?? 4,
              height: media.height ?? 3,
            })),
        },
      });
    }
    if (path.length !== 1) return missing();
    const filtered = filterMuseItems({ q, category: cat || '全部' });
    return ok({
      total: filtered.length,
      hasMore: offset + limit < filtered.length,
      items: filtered.slice(offset, offset + limit).map((item) => ({
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
      })),
      categories: museTabs.map((c) => ({
        id: c.name,
        name: categoryLabel(c.name),
        count: c.count,
      })),
      topics: [],
      attribution: '',
    });
  }
  if (path.length === 1 && path[0] === 'tools')
    return ok({
      categories: toolCategories.map((category) => ({
        id: category.id,
        name: categoryLabel(category.id),
        tools: category.tools.map((tool) => ({
          name: tool.name,
          url: tool.url,
          icon: absolute(tool.icon),
        })),
      })),
    });
  if (path.length === 1 && path[0] === 'site')
    return ok({
      video: absolute(promoUrl),
      poster: absolute(promoPosterUrl),
      website: websiteUrl,
      description:
        '在这里记录工程经历，也整理每天读到的动态、值得回看的内容和持续关注的开源项目。从一条摘要进入完整阅读，再回到原始来源。',
    });
  return missing();
}
