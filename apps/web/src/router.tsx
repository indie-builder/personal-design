import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// TanStack 默认把 search 值 JSON 序列化（字符串也会带引号，browse=2 → browse=%222%22），
// 与 Next 时代 URLSearchParams 的纯字符串语义不符：浏览上下文（?browse=2&q=…）、
// 筛选校验和分享 URL 都依赖原样字符串。这里固定为键值原样序列化/解析。
function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  // TanStack 约定序列化结果自带前导 ?（空串表示无查询）
  const query = params.toString();
  return query ? `?${query}` : '';
}

function parseSearch(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    stringifySearch,
    parseSearch,
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
