import { createFileRoute } from '@tanstack/react-router';
import { portfolioResponse } from '@/lib/portfolio-api';

/** /api/portfolio 根列表（原 Next 可选 catch-all 的空段分支）。 */
export const Route = createFileRoute('/api/portfolio')({
  server: {
    handlers: {
      GET: async ({ request }) => portfolioResponse(request, []),
    },
  },
});
