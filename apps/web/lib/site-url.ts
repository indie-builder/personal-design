const envUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

/** 规范站点地址：生产在 Vercel 环境变量里设 NEXT_PUBLIC_SITE_URL 为正式域名。 */
export const siteUrl = new URL(envUrl ?? 'http://localhost:3000');
