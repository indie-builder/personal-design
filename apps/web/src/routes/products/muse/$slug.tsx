import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { ArrowUpRight } from 'lucide-react';
import { z } from 'zod';
import type { listPostRefs } from '@personal-design/inspora';
import { BrowseNavigation } from '@/components/browse-navigation';
import { MuseMediaCarousel } from '@/components/inspora-media-carousel';
import { Img } from '@/components/img';
import { categoryLabel } from '@/lib/category-label';
import { museDetailOf } from '@/lib/muse-detail';
import { createProductError } from '@/lib/product-error';
import { siteTitle } from '@/lib/site-url';
import styles from './$slug.module.css';

// O5：listPostRefs 全量扫描是详情页冷启动 TTFB 的主因（DB 打开 + 全表索引查询）。
// inspora.db 每部署不可变（由 sync 脚本在独立进程中生成后随部署携带，运行期只读，
// 不存在同进程内被改写的脏读风险），因此模块级 memo 在 lambda 生命周期内缓存一次
// 扫描结果即可；sync 重新生成的是下一次部署的新 DB，与本进程缓存天然隔离。
let postRefsCache: ReturnType<typeof listPostRefs> | undefined;

// getPostBySlug/listPostRefs 读 inspora.db（node:sqlite），只能在服务端执行
const getMuseDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ slug: z.string(), query: z.string() }))
  .handler(async ({ data }) => {
    const { getPostBySlug, listPostRefs } = await import('@personal-design/inspora');
    const post = getPostBySlug(data.slug);
    if (!post) return null;
    // 浏览导航用轻量索引（不含媒体行），与 Next 时代的模块级 listPostRefs() 等价
    postRefsCache ??= listPostRefs();
    return museDetailOf(post, postRefsCache, data.query);
  });

export const Route = createFileRoute('/products/muse/$slug')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { q?: string; cat?: string; browse?: string } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    cat: typeof search.cat === 'string' ? search.cat : undefined,
    browse: typeof search.browse === 'string' ? search.browse : undefined,
  }),
  loaderDeps: ({ search }) => {
    const query = new URLSearchParams();
    for (const name of ['q', 'cat', 'browse'] as const) {
      if (search[name] !== undefined) query.set(name, search[name]);
    }
    return { query: query.toString() };
  },
  loader: async ({ params, deps }) => {
    const detail = await getMuseDetail({ data: { slug: params.slug, query: deps.query } });
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
      <BrowseNavigation returnLabel="返回灵感集" fallbackHref={listHref} {...navigation} />
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
