// NEXT_PUBLIC_* 经 vite define 构建期内联，未设置时是空字符串（不是 undefined），
// 因此用 || 而非 ??，保证空串回落到默认值
const envUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  // VERCEL_URL 在 Next 里是服务端运行时读取；迁移后 lib 会被客户端组件引用
  // （workspace-shell → paramsHref），加 typeof 守卫避免浏览器无 process 时崩溃
  ((typeof process !== 'undefined' && process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : undefined) as string | undefined);

/** 规范站点地址：生产在 Vercel 环境变量里设 NEXT_PUBLIC_SITE_URL 为正式域名。 */
export const siteUrl = new URL(envUrl ?? 'http://localhost:3000');

/** Set/delete params in place ('' deletes) and return `path` or `path?query`. */
export function paramsHref(path: string, params: URLSearchParams, updates: Record<string, string>) {
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return `${path}${params.size ? `?${params}` : ''}`;
}

/** Next metadata.title.template（'%s · 作品时间轴'）的等价物，各路由 head 统一使用。 */
export const siteTitle = (title?: string) => (title ? `${title} · 作品时间轴` : '作品时间轴');

/** 静态页面的 head 工厂：与原 metadata 导出（title/description + OpenGraph 继承）对齐。 */
export function pageHead(title: string, description: string) {
  return () => ({
    meta: [
      { title: siteTitle(title) },
      { name: 'description', content: description },
      { property: 'og:title', content: siteTitle(title) },
      { property: 'og:description', content: description },
    ],
  });
}
