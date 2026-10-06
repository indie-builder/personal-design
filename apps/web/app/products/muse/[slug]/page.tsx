import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { getPostBySlug } from '@personal-design/inspora';
import { museBrowseEntries, museMediaOf } from '@/lib/muse-catalog';
import { BrowseNavigation } from '@/components/browse-navigation';
import { categoryLabel } from '@/lib/category-label';
import { MuseMediaCarousel } from '@/components/inspora-media-carousel';
import styles from './page.module.css';

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

export default function MuseDetailPage({ params }: PageProps) {
  return (
    <main className={styles.page}>
      {/* params 属请求时数据，转发进 Suspense 内的子组件再 await：外壳可预渲染，内容照旧服务端输出 */}
      <Suspense fallback={null}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const navigation = museBrowseEntries(post);
  const media = museMediaOf(post);

  const listHref = post.category
    ? `/products/muse?cat=${encodeURIComponent(post.category)}`
    : '/products/muse';

  const description = post.description?.trim();
  const hasDescription = description && description !== post.title.trim();

  // main 地标由外壳的 Suspense 之外提供；此处若再渲染会产生嵌套重复地标。
  return (
    <>
      <BrowseNavigation
        listPath="/products/muse"
        returnLabel="返回灵感集"
        fallbackHref={listHref}
        {...navigation}
      />
      <header className={styles.heading}>
        <h1 className={styles.title}>{post.title || '未命名灵感'}</h1>
        <div className={styles.byline}>
          {post.creatorName ? (
            <p className={styles.author}>
              {post.creatorAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- Local author thumbnail.
                <img src={post.creatorAvatar} alt="" />
              ) : null}
              {post.creatorUrl ? (
                <a href={post.creatorUrl} target="_blank" rel="noreferrer">
                  {post.creatorName}
                </a>
              ) : (
                <span>{post.creatorName}</span>
              )}
            </p>
          ) : null}
          {post.category ? (
            <Link href={listHref} className={styles.category}>
              {categoryLabel(post.category)}
            </Link>
          ) : null}
          {post.sourceUrl ? (
            <a href={post.sourceUrl} target="_blank" rel="noreferrer" className={styles.source}>
              查看原作
              <ArrowUpRight size={18} strokeWidth={1.6} aria-hidden />
            </a>
          ) : null}
        </div>
      </header>
      {media.length ? (
        <MuseMediaCarousel key={post.slug} media={media} />
      ) : (
        <div className={styles.empty}>
          <p>作品暂时无法显示</p>
        </div>
      )}
      {hasDescription ? (
        <div className={styles.information}>
          <p className={styles.description}>{description}</p>
        </div>
      ) : null}
    </>
  );
}
