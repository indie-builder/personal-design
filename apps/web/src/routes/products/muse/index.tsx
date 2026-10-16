import { Await, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { PlateWall } from '@/components/plate-wall';
import { createProductError } from '@/lib/product-error';
import { pageHead } from '@/lib/site-url';
import styles from './index.module.css';

export const Route = createFileRoute('/products/muse/')({
  // q/cat 是筛选的唯一事实源；声明为基本字符串参数，loader 据此出首窗
  validateSearch: (search: Record<string, unknown>): { q?: string; cat?: string } => ({
    q: typeof search.q === 'string' ? search.q : undefined,
    cat: typeof search.cat === 'string' ? search.cat : undefined,
  }),
  // loader 只认 loaderDeps：search 变化时按依赖重取首窗
  loaderDeps: ({ search }: { search: { q?: string; cat?: string } }) => ({
    q: search.q,
    cat: search.cat,
  }),
  // 外壳先行的流式分叉，对齐原 PPR「外壳预渲染 + searchParams 请求时分叉」语义：
  // loader 立即返回，网格数据以 deferred promise 交给 <Await>，在服务端流式补齐真实内容
  loader: ({ deps }) => ({
    museWindow: getMuseWindow({ data: { q: deps.q, category: deps.cat } }),
  }),
  head: pageHead(
    '灵感集 · 图像、界面与动效',
    '浏览图像、界面与动效，发现值得参考的设计与创作者，直接访问作品出处。',
  ),
  errorComponent: createProductError({
    title: '灵感暂时无法打开',
    href: '/products/muse',
    returnLabel: '返回灵感集',
  }),
  component: MusePage,
});

// muse-catalog 模块顶层会读 inspora.db（node:sqlite），只能在服务端执行；
// 全量列表留在服务端，只下发当前筛选的首窗，追加仍走 /products/muse/api/posts 分片
const getMuseWindow = createServerFn({ method: 'GET' })
  .validator((data: { q?: string; category?: string }) => data)
  .handler(async ({ data }) => {
    const { MUSE_BATCH, filterMuseItems, museTabs } = await import('@/lib/muse-catalog');
    const matched = filterMuseItems({ q: data.q ?? '', category: data.category ?? '全部' });
    return {
      tabs: museTabs,
      items: matched.slice(0, MUSE_BATCH),
      total: matched.length,
      batchSize: MUSE_BATCH,
    };
  });

function MusePage() {
  const { museWindow } = Route.useLoaderData();
  return (
    <main className={styles.page}>
      <div>
        <Await
          promise={museWindow}
          fallback={
            <p role="status" className={`py-8 text-ink-soft ${styles.fade}`}>
              正在准备灵感列表…
            </p>
          }
        >
          {(muse) => (
            <PlateWall
              categories={muse.tabs}
              items={muse.items}
              total={muse.total}
              batchSize={muse.batchSize}
            />
          )}
        </Await>
      </div>
    </main>
  );
}
