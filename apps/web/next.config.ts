import type { NextConfig } from 'next';
import path from 'node:path';

// 媒体热链的上游域名（inspora 原站 CDN + 布局参考上游仓库的 jsDelivr + Best Designs on X 的媒体镜像）
const UPSTREAM_HOSTS = ['media.inspora.design', 'cdn.jsdelivr.net', 'cdn.bestdesignsonx.com'];

// 媒体迁到对象存储后（NEXT_PUBLIC_MEDIA_BASE_URL），允许 next/image 从该域名拉取
const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
const mediaHost = mediaBase ? new URL(mediaBase).hostname : null;
const mediaVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.MEDIA_VERSION ?? '';
const mediaDirectories = ['inspora', 'layout-compositions', 'personal-sites'];

// 全站安全基线；CSP 需要给主题初始化内联脚本与 Next flight 脚本配 nonce，
// 属中间件级改造，暂不纳入
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai'],
  cacheComponents: true,
  reactCompiler: true,
  // 预取只拉静态外壳，动态分叉在导航时流式到达（配合 cacheComponents 的官方推荐档）
  partialPrefetching: true,
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  outputFileTracingIncludes: {
    '/products/muse': ['../../packages/inspora/inspora.db', './public/inspora/**/*'],
  },
  // A new deployment gets new media URLs; unversioned URLs keep revalidation.
  env: { NEXT_PUBLIC_MEDIA_VERSION: mediaVersion },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/ai-coding-atlas/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      ...mediaDirectories.map((directory) => ({
        source: `/${directory}/:path*`,
        has: [{ type: 'query' as const, key: 'v', value: '[a-f0-9]{40}' }],
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      })),
    ];
  },
  transpilePackages: [
    '@personal-design/layout-compositions',
    '@personal-design/inspora',
    '@personal-design/design-engineer-tools',
  ],
  allowedDevOrigins: ['personal-design.localhost', '*.personal-design.localhost'],
  // dev 指示器默认在右上，恰好压住主题切换钮；挪到左下（仅 dev 有效）
  devIndicators: { position: 'bottom-left' },
  images: {
    localPatterns: [
      { pathname: '/**', search: '' },
      ...(mediaVersion
        ? mediaDirectories.map((directory) => ({
            pathname: `/${directory}/**`,
            search: `?v=${mediaVersion}`,
          }))
        : []),
    ],
    remotePatterns: [...UPSTREAM_HOSTS, ...(mediaHost ? [mediaHost] : [])].map((hostname) => ({
      protocol: 'https' as const,
      hostname,
    })),
    // 本地开发走 fake-ip 代理时上游域名会解析到 198.18.x.x（私有段），
    // Next 的 SSRF 防护会拒绝优化器拉取；remotePatterns 已限制域名白名单，风险可控
    dangerouslyAllowLocalIP: true,
  },
};

export default nextConfig;
