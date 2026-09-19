import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { getPostBySlug, listPostRefs } from '@personal-design/inspora';
import { BrowseNavigation } from '@/components/browse-navigation';
import { categoryLabel } from '@/lib/category-label';
import { MuseMediaCarousel } from '@/components/inspora-media-carousel';
import styles from './page.module.css';

// 灵感集两条数据源合计条目较多：详情页按需渲染（不预生成全站），
// 浏览列表只携带当前位置附近的窗口，控制每页 RSC 负载；小集合不受影响。
const BROWSE_WINDOW = 240;

// 浏览上下文只依赖轻量字段：模块级一次载入索引（与网格页惯例一致），
// 详情数据仍按需单条查询；窗口只携带当前位置附近，控制每页 RSC 负载。
const postRefs = listPostRefs();

function windowed<T extends { href: string }>(entries: T[], currentHref: string): T[] {
  const index = entries.findIndex((entry) => entry.href === currentHref);
  // 索引快照落后于数据库（运行期间同步且未重启）时，当前条目可能不在索引里：
  // 回退为有界切片，避免把全量列表塞进单次 RSC 负载。
  if (index < 0) return entries.slice(0, BROWSE_WINDOW);
  if (entries.length <= BROWSE_WINDOW * 2 + 1) return entries;
  const start = Math.max(
    0,
    Math.min(index - BROWSE_WINDOW, entries.length - (BROWSE_WINDOW * 2 + 1)),
  );
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

  const group = postRefs.filter((entry) => !post.category || entry.category === post.category);
  const browseEntries = postRefs.map((entry) => ({
    href: `/products/muse/${entry.slug}`,
    title: entry.title,
    category: entry.category ?? '未分类',
    search: [
      entry.creatorName ?? '',
      [entry.category, ...entry.industries, ...entry.styles].filter(Boolean).join(' '),
      categoryLabel(entry.category ?? '未分类'),
    ],
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
      <BrowseNavigation
        appearance="text"
        listPath="/products/muse"
        storageKey="muse-return"
        returnLabel="返回灵感集"
        fallbackHref={listHref}
        browseEntries={windowed(browseEntries, currentHref)}
        currentHref={currentHref}
        entries={windowed(
          group.map((entry) => ({ href: `/products/muse/${entry.slug}`, title: entry.title })),
          currentHref,
        )}
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
    </main>
  );
}
