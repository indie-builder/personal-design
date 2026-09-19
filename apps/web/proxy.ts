import { NextResponse, type NextRequest } from 'next/server';
import { catalog } from '@personal-design/layout-compositions';

// 未知图鉴编号在流式开始前判定：cacheComponents 下页面内 notFound() 只能
// 给 200＋noindex（响应头已发出），这里是 Next 文档推荐的 proxy 前置检查。
// rewrite 到无路由路径以保留应用样式化 404 UI 与 404 状态码。
const knownIds = new Set(catalog.map((item) => item.id));

export function proxy(request: NextRequest) {
  const match = /^\/products\/layout-compositions\/([^/]+)$/.exec(request.nextUrl.pathname);
  const id = match?.[1];
  if (!id) return NextResponse.next();
  // 编号固定三位数字；非法编码或未知编号都按 404 处理（decode 失败不抛 500）。
  let decoded = '';
  try {
    decoded = decodeURIComponent(id);
  } catch {}
  if (!/^\d{3}$/.test(decoded) || !knownIds.has(decoded)) {
    return NextResponse.rewrite(new URL('/__unknown_layout__', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/products/layout-compositions/:id',
};
