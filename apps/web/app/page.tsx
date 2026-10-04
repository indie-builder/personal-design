import type { Metadata } from 'next';
import { categories } from '@personal-design/layout-compositions';
import { listPosts } from '@personal-design/inspora';
import { toolPreview } from '@personal-design/design-engineer-tools';
import { products } from '@/lib/products';
import { HomeView } from '@/components/home-view';

export const metadata: Metadata = { title: { absolute: '作品时间轴' } };

export default function HomePage() {
  const posts = listPosts();
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
      videoSrc: motionMedia.previewSrc ?? motionMedia.src,
    });
  return (
    <HomeView
      layoutCategories={categories.map(({ name, count }) => ({ name, count }))}
      products={products}
      musePreviews={musePreviews}
      toolsPreview={toolPreview}
    />
  );
}
