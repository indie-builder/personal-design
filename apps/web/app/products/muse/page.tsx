import type { Metadata } from 'next';
import { Suspense } from 'react';
import styles from './page.module.css';
import { listCategories, listPosts, videoPreviewUrl } from '@personal-design/inspora';
import { PlateWall, type PlateWallItem } from '@/components/plate-wall';

export const metadata: Metadata = {
  title: '灵感集 · 图像、界面与动效',
  description: '浏览图像、界面与动效，发现值得参考的设计与创作者，直接访问作品出处。',
};

const posts = listPosts();

// 只把客户端需要的字段传下去，控制 RSC 负载
const items: PlateWallItem[] = posts.flatMap((post) => {
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

const tabs = listCategories()
  .map((category) => ({
    ...category,
    count: items.filter((item) => item.category === category.name).length,
  }))
  .filter((category) => category.count > 0);
const uncategorized = items.filter((item) => item.category === '未分类').length;
if (uncategorized && !tabs.some((category) => category.name === '未分类'))
  tabs.push({ name: '未分类', count: uncategorized });

export default function MusePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <main className={styles.page}>
      <div>
        {/* searchParams 转发进 Suspense 内 await：预渲染期必然挂起，外壳不预渲染网格，
            首屏只由请求时分叉输出（服务端按当前筛选，设计契约） */}
        <Suspense
          fallback={
            <p role="status" className="py-8 text-ink-soft">
              正在准备灵感列表…
            </p>
          }
        >
          <MuseGrid searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function MuseGrid({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await searchParams;
  return <PlateWall categories={tabs} items={items} batchSize={24} />;
}
