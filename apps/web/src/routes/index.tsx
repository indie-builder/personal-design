import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { toolPreview } from '@personal-design/design-engineer-tools';
import { HomeView } from '@/components/home-view';
import { products } from '@/lib/products';

// inspora（node:sqlite）与 layout-compositions（node:fs 探测本地媒体）只能在服务端执行，
// 收进 server function 后客户端 bundle 只拿到可序列化的结果
const getHomeData = createServerFn({ method: 'GET' }).handler(async () => {
  const { categories } = await import('@personal-design/layout-compositions');
  const { listPostPreviews } = await import('@personal-design/inspora');
  return {
    layoutCategories: categories.map(({ name, count }) => ({ name, count })),
    musePreviews: listPostPreviews(),
  };
});

export const Route = createFileRoute('/')({
  loader: () => getHomeData(),
  component: HomePage,
});

function HomePage() {
  const { layoutCategories, musePreviews } = Route.useLoaderData();
  return (
    <HomeView
      layoutCategories={layoutCategories}
      products={products}
      musePreviews={musePreviews}
      // toolCategories 来自纯 JSON 包，可安全进入客户端
      toolsPreview={toolPreview}
    />
  );
}
