import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowUpRight,
} from 'lucide-react';
import {
  getPostBySlug,
  listPosts,
} from '@personal-design/inspora';
import { BrowseNavigation } from '@/components/browse-navigation';
import { categoryLabel } from '@/lib/category-label';
import { MuseMediaCarousel } from '@/components/inspora-media-carousel';
import styles from './page.module.css';

// 灵感集两条数据源合计条目较多：详情页按需渲染（不预生成全站），
// 浏览列表只携带当前位置附近的窗口，控制每页 RSC 负载；小集合不受影响。
const BROWSE_WINDOW = 240;

function windowed<T extends { href: string }>(entries: T[], currentHref: string): T[] {
  const index = entries.findIndex((entry) => entry.href === currentHref);
  if (index < 0 || entries.length <= BROWSE_WINDOW * 2 + 1) return entries;
  const start = Math.max(0, Math.min(index - BROWSE_WINDOW, entries.length - (BROWSE_WINDOW * 2 + 1)));
  return entries.slice(start, start + BROWSE_WINDOW * 2 + 1);
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} · 灵感集`,
    description:
      post.description ??
      `${post.title} —— ${post.category ?? '设计灵感'}，${post.creatorName ?? ''}。`,
  };
}

export default async function MuseDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const posts = listPosts();
  const group = posts.filter(entry => !post.category || entry.category === post.category);
  const browseEntries = posts.map(entry => ({
    href: `/products/muse/${entry.slug}`,
    title: entry.title,
    category: entry.category ?? '未分类',
    search: [entry.creatorName ?? '', [entry.category, ...entry.industries, ...entry.styles].filter(Boolean).join(' '), categoryLabel(entry.category ?? '未分类')],
  }));
  const currentHref = `/products/muse/${post.slug}`;

  const media = post.media
    .filter((m) => m.src)
    .map((m, i) => ({
      id: m.id,
      type: m.type,
      src: m.src ?? '',
      poster: m.poster ?? m.thumb,
      width: m.width,
      height: m.height,
      alt: post.media.length > 1 ? `${post.title} · 第 ${i + 1} 件` : post.title,
    }));

  const listHref = post.category
    ? `/products/muse?cat=${encodeURIComponent(post.category)}`
    : '/products/muse';

  const description = post.description?.trim();
  const hasDescription = description && description !== post.title.trim();

  return (
    <main className={styles.page}>
      <BrowseNavigation appearance="text" listPath="/products/muse" storageKey="muse-return" returnLabel="返回灵感集" fallbackHref={listHref}
        browseEntries={windowed(browseEntries, currentHref)}
        currentHref={currentHref}
        entries={windowed(group.map(entry => ({ href:`/products/muse/${entry.slug}`, title:entry.title })), currentHref)} />
      <header className={styles.heading}>
        <h1 className={styles.title}>{post.title || '未命名灵感'}</h1>
        <div className={styles.byline}>
          {post.creatorName ? <p className={styles.author}>
            {post.creatorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- Local author thumbnail.
              <img src={post.creatorAvatar} alt="" />
            ) : null}
            {post.creatorUrl ? <a href={post.creatorUrl} target="_blank" rel="noreferrer">{post.creatorName}</a> : <span>{post.creatorName}</span>}
          </p> : null}
          {post.category ? <Link href={listHref} className={styles.category}>{categoryLabel(post.category)}</Link> : null}
          {post.sourceUrl ? <a href={post.sourceUrl} target="_blank" rel="noreferrer" className={styles.source}>查看原作<ArrowUpRight size={18} strokeWidth={1.6} aria-hidden /></a> : null}
        </div>
      </header>
      {media.length ? <MuseMediaCarousel key={post.slug} media={media} /> : <div className={styles.empty}><p>作品暂时无法显示</p></div>}
      {hasDescription ? <div className={styles.information}><p className={styles.description}>{description}</p></div> : null}
    </main>
  );
}
