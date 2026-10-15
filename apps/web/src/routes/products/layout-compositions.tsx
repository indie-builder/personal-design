import { Await, createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { LayoutBookshelf } from '@/components/layout-bookshelf';
import { LightboxProvider } from '@/components/lifeline/lightbox';
import { createProductError } from '@/lib/product-error';
import { pageHead } from '@/lib/site-url';
import styles from './layout-compositions.module.css';

// catalog 的图片地址探测（hasImage→node:fs）只能在服务端执行；客户端只拿映射好的图鉴条目
const getLayoutCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  const { catalog, categories, hasImage, imageUrl, thumbnailUrl } =
    await import('@personal-design/layout-compositions');
  // 只把客户端需要的字段传下去，控制负载（原 RSC 时代的注释约定保持不变）
  const items = catalog.map((item) => ({
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
  return { items, tabs };
});

export const Route = createFileRoute('/products/layout-compositions')({
  // 外壳先行的流式分叉，对齐原 PPR「外壳预渲染 + searchParams 请求时分叉」语义：
  // loader 立即返回，图鉴数据以 deferred promise 交给 <Await> 流式补齐
  loader: () => ({ catalog: getLayoutCatalog() }),
  head: pageHead(
    '布局参考 · 350 种排版构图图鉴',
    '排版构图图鉴：按分类和主题浏览，查看图鉴与高清资源。',
  ),
  errorComponent: createProductError({
    title: '布局参考暂时无法打开',
    href: '/products/layout-compositions',
    returnLabel: '返回布局参考',
  }),
  component: LayoutCompositionsPage,
});

function LayoutCompositionsPage() {
  const { catalog } = Route.useLoaderData();
  return (
    <main>
      {/* 目标跨页的图片仍由服务端渲染输出（LayoutBookshelf 自己读 location 里的 theme/q/cat），
          灯箱过渡语义保持不变 */}
      <Await
        promise={catalog}
        fallback={
          <p role="status" className={`p-6 text-ink-soft ${styles.fade}`}>
            正在加载布局图鉴…
          </p>
        }
      >
        {(data) => (
          <LightboxProvider>
            <LayoutBookshelf categories={data.tabs} items={data.items} />
          </LightboxProvider>
        )}
      </Await>
    </main>
  );
}
