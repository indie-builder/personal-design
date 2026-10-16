import { createFileRoute } from '@tanstack/react-router';
import { siteUrl } from '@/lib/site-url';

// 只收产品入口页：灵感集详情页近万条且随同步增长，进入 sitemap 会拖慢收录配额，
// 详情页可经网格与分类链接被正常发现。输出格式与 Next metadata sitemap 一致。
const paths = [
  '',
  '/products/design-engineer-tools',
  '/products/layout-compositions',
  '/products/muse',
  '/products/personal-sites',
];

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const entries = paths
          .map(
            (path) =>
              `<url><loc>${new URL(path, siteUrl).href}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`,
          )
          .join('\n');
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
        return new Response(xml, {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        });
      },
    },
  },
});
