import type { NitroApp } from 'nitro/types';

// 与 src/start.ts 的 mediaVersionCache 中间件保持同一规则；本插件覆盖 Nitro 静态文件
// （.output/public 下的 /inspora|layout-compositions|personal-sites 媒体），它们不经过
// TanStack 的 requestMiddleware。仅在 ?v=<sha40> 版本化时发 immutable（next.config 的
// 媒体缓存契约），无版本 URL 保持可重新验证。
const MEDIA_IMMUTABLE_PATH = /^\/(inspora|layout-compositions|personal-sites)(\/|$)/;
const MEDIA_VERSION = /^[a-f0-9]{40}$/;

export default (nitroApp: NitroApp) => {
  nitroApp.hooks?.hook('response', (response, event) => {
    const url = new URL(event.req.url);
    if (
      MEDIA_IMMUTABLE_PATH.test(url.pathname) &&
      MEDIA_VERSION.test(url.searchParams.get('v') ?? '')
    ) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  });
};
