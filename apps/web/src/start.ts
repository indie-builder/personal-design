import { createMiddleware, createStart } from '@tanstack/react-start';

// 媒体版本化缓存：?v=<sha40> 的 /inspora|layout-compositions|personal-sites 响应发 immutable。
// 注意 requestMiddleware 只覆盖经过 TanStack handler 的请求（SSR/server routes/server fns）；
// 生产里这些路径是 Nitro 静态文件，不经过本中间件，同一规则在 vite.config.ts 的
// serverDataHeaders Nitro 插件里对静态响应生效（两处判断保持一致）。
const MEDIA_IMMUTABLE_PATH = /^\/(inspora|layout-compositions|personal-sites)(\/|$)/;
const MEDIA_VERSION = /^[a-f0-9]{40}$/;

const mediaVersionCache = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  if (
    MEDIA_IMMUTABLE_PATH.test(url.pathname) &&
    MEDIA_VERSION.test(url.searchParams.get('v') ?? '')
  ) {
    const result = await next();
    // 不可变 header 直接写回响应；Cache-Control 不在浏览器禁改列表内
    result.response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return result;
  }
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [mediaVersionCache],
}));
