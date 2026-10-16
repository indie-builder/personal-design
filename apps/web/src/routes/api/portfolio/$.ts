import { createFileRoute } from '@tanstack/react-router';
import { portfolioResponse } from '@/lib/portfolio-api';

/** /api/portfolio/<segments> catch-all（splat 参数在 `_splat`，等价原 Next 的 path 数组）。 */
export const Route = createFileRoute('/api/portfolio/$')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        portfolioResponse(request, (params._splat ?? '').split('/').filter(Boolean)),
    },
  },
});
