import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LightboxProvider } from '@/components/lifeline/lightbox';
import {
  catalog,
  categories,
  hasImage,
  imageUrl,
  thumbnailUrl,
} from '@personal-design/layout-compositions';
import { LayoutBookshelf, type BookPage } from '@/components/layout-bookshelf';

export const metadata: Metadata = {
  title: '布局参考 · 350 种排版构图图鉴',
  description: '排版构图图鉴：按分类和主题浏览，查看图鉴与高清资源。',
};

// 只把客户端需要的字段传下去，控制 RSC 负载
const items: BookPage[] = catalog.map((item) => ({
  id: item.id,
  name: item.name,
  category: item.category,
  theme: item.subcategory,
  themeSlug: item.subcategory_slug,
  src: hasImage(item) ? imageUrl(item) : null,
  thumb: hasImage(item) ? thumbnailUrl(item) : null,
}));

const tabs = categories.map((category) => ({
  name: category.name,
  count: items.filter((item) => item.category === category.name).length,
}));

export default function LayoutCompositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <main>
      {/* Keep navigation transitions within the existing Suspense boundary.
          searchParams 在 Suspense 内 await：预渲染期必然挂起，首屏只由请求时分叉
          按当前筛选输出跨页图片，不会在预渲染外壳里重复一份空参数渲染。 */}
      <Suspense
        fallback={
          <p className="p-6 text-ink-soft" role="status">
            正在加载布局图鉴…
          </p>
        }
      >
        <Bookshelf searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Bookshelf({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await searchParams;
  // Render the requested spread on the server so its images do not wait for hydration.
  return (
    <LightboxProvider>
      <LayoutBookshelf categories={tabs} items={items} />
    </LightboxProvider>
  );
}
