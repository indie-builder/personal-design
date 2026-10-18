import type { listPostRefs, InsporaPost, InsporaMedia } from '@personal-design/inspora';
import { resolveUrlBrowseContext, windowed } from '@/lib/browse-context';
import { categoryLabel } from '@/lib/category-label';

const posterOf = (media: InsporaMedia) => media.poster ?? media.thumb;
export const museThumbnailOf = (post: Pick<InsporaPost, 'media'>) =>
  post.media[0] && posterOf(post.media[0]);
export const museKeywords = (post: Pick<InsporaPost, 'category' | 'industries' | 'styles'>) =>
  [post.category, ...post.industries, ...post.styles].filter(Boolean).join(' ');

export function museMediaOf(post: Pick<InsporaPost, 'title' | 'media'>) {
  return post.media
    .filter((media) => media.src)
    .map((media, index) => ({
      id: media.id,
      type: media.type,
      src: media.src ?? '',
      poster: posterOf(media),
      width: media.width,
      height: media.height,
      alt: post.media.length > 1 ? `${post.title} · 第 ${index + 1} 件` : post.title,
    }));
}

export function museDetailOf(
  post: InsporaPost,
  postRefs: ReturnType<typeof listPostRefs>,
  query = '',
) {
  return {
    post: {
      slug: post.slug,
      title: post.title,
      creatorName: post.creatorName,
      creatorUrl: post.creatorUrl,
      creatorAvatar: post.creatorAvatar,
      description: post.description,
      category: post.category,
      sourceUrl: post.sourceUrl,
    },
    navigation: museBrowseEntries(post, postRefs, query),
    media: museMediaOf(post),
  };
}

export function museBrowseEntries(
  post: Pick<InsporaPost, 'slug' | 'category'>,
  postRefs: ReturnType<typeof listPostRefs>,
  query = '',
) {
  const currentHref = `/products/muse/${post.slug}`;
  const indexed = postRefs.map((entry) => ({
    href: `/products/muse/${entry.slug}`,
    title: entry.title,
    category: entry.category ?? '未分类',
    search: [
      entry.creatorName ?? '',
      museKeywords(entry),
      categoryLabel(entry.category ?? '未分类'),
    ],
  }));
  const context = resolveUrlBrowseContext(query, '/products/muse', currentHref, indexed);
  // Resolve against the full index: a sparse match can be outside the unfiltered window.
  const entries =
    context?.entries ??
    indexed.filter((entry) => !post.category || entry.category === post.category);
  return {
    currentHref,
    contextHref: context?.href ?? null,
    entries: windowed(entries, currentHref).map(({ href, title }) => ({ href, title })),
  };
}
