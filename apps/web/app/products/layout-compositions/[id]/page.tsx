import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { catalog, getLayoutById, hasImage } from '@personal-design/layout-compositions';

export function generateStaticParams() {
  return catalog.map((item) => ({ id: item.id }));
}
interface PageProps {
  params: Promise<{ id: string }>;
}
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const item = getLayoutById(id);
  return item ? { title: `${item.name} · 布局参考` } : {};
}

/** Saved image URLs enter the same book and magnification flow as the shelf. */
export default async function LayoutDetailPage({ params }: PageProps) {
  const { id } = await params;
  const item = getLayoutById(id);
  if (!item) notFound();
  const query = new URLSearchParams({ cat: item.category, page: item.id });
  if (hasImage(item)) query.set('zoom', item.id);
  redirect(`/products/layout-compositions?${query}`);
}
