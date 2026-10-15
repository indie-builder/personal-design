import { createFileRoute } from '@tanstack/react-router';
import { MUSE_BATCH, musePage } from '@/lib/muse-catalog';

/** 灵感网格滚动追加的分片接口：按当前筛选返回一个窗口。 */
export const Route = createFileRoute('/products/muse/api/posts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams;
        const { total, items } = musePage({
          q: params.get('q') ?? '',
          category: params.get('cat') ?? '全部',
          offset: Math.max(0, Number(params.get('offset')) || 0),
          limit: Math.min(240, Math.max(1, Number(params.get('limit')) || MUSE_BATCH)),
        });
        return Response.json(
          { total, items },
          { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
        );
      },
    },
  },
});
