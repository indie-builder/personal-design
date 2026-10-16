import { createFileRoute } from '@tanstack/react-router';
import { siteUrl } from '@/lib/site-url';

// 输出格式与 Next metadata robots 一致（User-Agent/Allow + 空行 + Sitemap）。
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const body = `User-Agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', siteUrl).href}`;
        return new Response(body, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
