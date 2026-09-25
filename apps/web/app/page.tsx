import type { Metadata } from 'next';
import { catalog, categories, hasImage, thumbnailUrl } from '@personal-design/layout-compositions';
import { listPosts, videoPreviewUrl } from '@personal-design/inspora';
import { toolPreview } from '@personal-design/design-engineer-tools';
import { graphEdges, graphNodes } from '@personal-design/ai-coding-dictionary/graph';
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
  const agent = graphNodes.find((node) => node.slug === 'agent');
  const nodeBySlug = new Map(graphNodes.map((node) => [node.slug, node]));
  const fromAgent = (slug: string) => {
    const point = nodeBySlug.get(slug)?.position;
    return point && agent
      ? Math.hypot(...point.map((value, axis) => value - agent.position[axis]!))
      : Infinity;
  };
  const previewSlugs = new Set([
    'agent',
    'model',
    'context',
    'session',
    'harness',
    'turn',
    'token',
    ...(agent?.links
      .slice()
      .sort((a, b) => fromAgent(a) - fromAgent(b))
      .slice(0, 20) ?? []),
  ]);
  return (
    <HomeView
      layoutCategories={categories.map(({ name, count }) => ({ name, count }))}
      products={products}
      layoutPreviews={layoutPreviews}
      musePreviews={musePreviews}
      toolsPreview={toolPreview}
      dictionaryPreview={{
        nodes: graphNodes.filter((node) => previewSlugs.has(node.slug)),
        edges: graphEdges.filter(
          (edge) => previewSlugs.has(edge.source) && previewSlugs.has(edge.target),
        ),
      }}
    />
  );
}
