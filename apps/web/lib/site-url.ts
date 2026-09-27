const envUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

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
