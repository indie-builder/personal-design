import type { Metadata } from 'next';
import { catalog, categories, hasImage, thumbnailUrl } from '@personal-design/layout-compositions';
import { listPosts, videoPreviewUrl } from '@personal-design/inspora';
import { products } from '@/lib/products';
import { HomeView } from '@/components/home-view';

export const metadata: Metadata = { title: { absolute: '作品时间轴' } };

export default function HomePage() {
  const posts = listPosts();
  const layoutPreviews = categories.slice(0, 3).flatMap((category) => {
    const item = catalog.find((item) => item.category_slug === category.slug && hasImage(item));
    return item ? [{ src: thumbnailUrl(item), alt: item.name }] : [];
  });
  const musePreviews: { src: string; alt: string; videoSrc?: string }[] = posts
    .flatMap((post) => {
      const media = post.media[0];
      const src = media?.thumb ?? media?.poster;
      return src ? [{ src, alt: post.title }] : [];
    })
    .slice(0, 3);
  const motionPost = posts.find((post) => post.media[0]?.type === 'video' && post.media[0]?.src);
  const motionMedia = motionPost?.media[0];
  if (motionPost && motionMedia?.src)
    musePreviews.unshift({
      src: motionMedia.thumb ?? motionMedia.poster ?? '',
      alt: motionPost.title,
      videoSrc: videoPreviewUrl(motionPost, motionMedia) ?? motionMedia.src,
    });
  return (
    <HomeView
      layoutCategories={categories.map(({ name, count }) => ({ name, count }))}
      products={products}
      layoutPreviews={layoutPreviews}
      musePreviews={musePreviews}
    />
  );
}
