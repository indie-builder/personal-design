import type { Metadata } from 'next';
import { categories } from '@personal-design/layout-compositions';
import { listPostPreviews } from '@personal-design/inspora';
import { toolPreview } from '@personal-design/design-engineer-tools';
import { products } from '@/lib/products';
import { HomeView } from '@/components/home-view';

export const metadata: Metadata = { title: { absolute: '作品时间轴' } };

export default function HomePage() {
  const musePreviews = listPostPreviews();
  return (
    <HomeView
      layoutCategories={categories.map(({ name, count }) => ({ name, count }))}
      products={products}
      musePreviews={musePreviews}
      toolsPreview={toolPreview}
    />
  );
}
