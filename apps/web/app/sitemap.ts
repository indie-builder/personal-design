import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-url';

// 只收产品入口页：灵感集详情页近万条且随同步增长，进入 sitemap 会拖慢收录配额，
// 详情页可经网格与分类链接被正常发现。
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    '',
    '/products/design-engineer-tools',
    '/products/layout-compositions',
    '/products/muse',
    '/products/personal-sites',
  ];
  return paths.map((path) => ({
    url: new URL(path, siteUrl).href,
    lastModified: new Date(),
  }));
}
