import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowUpRight } from 'lucide-react';
import { BrowseNavigation } from '@/components/browse-navigation';
import { MuseMediaCarousel } from '@/components/inspora-media-carousel';
import { Img } from '@/components/img';
import { categoryLabel } from '@/lib/category-label';
import { museBrowseEntries, museMediaOf } from '@/lib/muse-detail';
import { createProductError } from '@/lib/product-error';
import { siteTitle } from '@/lib/site-url';
import styles from './$slug.module.css';

// getPostBySlug/listPostRefs 读 inspora.db（node:sqlite），只能在服务端执行
const getMuseDetail = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const { getPostBySlug, listPostRefs } = await import('@personal-design/inspora');
    const post = getPostBySlug(data.slug);
    if (!post) return null;
    // 浏览导航用轻量索引（不含媒体行），与 Next 时代的模块级 listPostRefs() 等价
    return {
      post,
      navigation: museBrowseEntries(post, listPostRefs()),
      media: museMediaOf(post),
    };
  });

export const Route = createFileRoute('/products/muse/$slug')({
  loader: async ({ params }) => {
    const detail = await getMuseDetail({ data: { slug: params.slug } });
    // 未命中交给根路由 notFoundComponent（对应原 notFound()）
    if (!detail) throw notFound();
    return detail;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { post } = loaderData;
    const description =
      post.description ??
      `${post.title} —— ${post.category ?? '设计灵感'}，${post.creatorName ?? ''}。`;
    return {
      meta: [
        { title: siteTitle(`${post.title} · 灵感集`) },
        { name: 'description', content: description },
        { property: 'og:title', content: siteTitle(`${post.title} · 灵感集`) },
        { property: 'og:description', content: description },
      ],
    };
  },
  errorComponent: createProductError({
    title: '灵感暂时无法打开',
    href: '/products/muse',
    returnLabel: '返回灵感集',
  }),
  component: MuseDetailPage,
});

function MuseDetailPage() {
  const { post, navigation, media } = Route.useLoaderData();

  const listHref = post.category
    ? `/products/muse?cat=${encodeURIComponent(post.category)}`
    : '/products/muse';
  const listSearch = post.category ? { cat: post.category } : undefined;
  const description = post.description?.trim();
  const hasDescription = description && description !== post.title.trim();

  // main 地标在本页渲染（外壳不提供 main）；loader 已 await 数据，无需原 Suspense 包裹
  return (
    <main className={styles.page}>
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
                // Local author thumbnail.
                <Img src={post.creatorAvatar} alt="" width={28} height={28} />
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
            <Link to="/products/muse" search={listSearch} className={styles.category}>
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
