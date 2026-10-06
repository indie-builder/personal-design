import type { listPostRefs, InsporaPost, InsporaMedia } from '@personal-design/inspora';
import { windowed } from '@/lib/browse-context';
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

export function museBrowseEntries(
  post: Pick<InsporaPost, 'slug' | 'category'>,
  postRefs: ReturnType<typeof listPostRefs>,
) {
  const currentHref = `/products/muse/${post.slug}`;
  const indexed = postRefs.map((entry) => ({
    href: `/products/muse/${entry.slug}`,
    post: entry,
  }));
  return {
    currentHref,
    browseEntries: windowed(indexed, currentHref).map(({ href, post: entry }) => ({
      href,
      title: entry.title,
      category: entry.category ?? '未分类',
      search: [
        entry.creatorName ?? '',
        museKeywords(entry),
        categoryLabel(entry.category ?? '未分类'),
      ],
    })),
    entries: windowed(
      indexed.filter(({ post: entry }) => !post.category || entry.category === post.category),
      currentHref,
    ).map(({ href, post: entry }) => ({ href, title: entry.title })),
  };
}
