import type { ErrorComponentProps } from '@tanstack/react-router';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { NotFoundView } from '@/components/not-found-view';
import { PageError } from '@/components/page-error';
import { WorkspaceShell } from '@/components/workspace-shell';
import { siteTitle } from '@/lib/site-url';
import './globals.css';

// 主题初始化：首帧前读 localStorage('theme')，缺省跟系统；同步脚本防 FOUC
const THEME_INIT = `(function(){var t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})()`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      // 默认标题即首页标题（原 metadata.title.default；模板后缀见 lib/site-url.ts 的 siteTitle）
      { title: siteTitle() },
      { name: 'description', content: '设计工具与参考产品集。' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: '作品时间轴' },
      { property: 'og:locale', content: 'zh_CN' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      { rel: 'icon', href: '/icon.png', type: 'image/png' },
      {
        rel: 'preload',
        href: '/fonts/AlbertSans-VariableFont_wght.woff2',
        as: 'font',
        type: 'font/woff2',
        // 字体按规范要求 anonymous CORS，保证与缓存键一致
        crossOrigin: 'anonymous',
      },
    ],
    scripts: [
      {
        // 放在 head 内同步执行（先于首帧渲染），防止主题闪烁
        children: THEME_INIT,
      },
    ],
  }),
  // 根级错误与 404：对应原 app/error.tsx 与 app/not-found.tsx
  errorComponent: RootError,
  notFoundComponent: NotFoundView,
  component: RootDocument,
});

function RootError({ reset }: ErrorComponentProps) {
  return <PageError reset={reset} />;
}

function RootDocument() {
  return (
    // suppressHydrationWarning：THEME_INIT 在水合前改写 dataset.theme，属预期差异
    <html lang="zh-CN" suppressHydrationWarning>
      {/* TanStack Start 要求根文档显式提供 head，HeadContent 渲染路由 head 声明 */}
      {/* eslint-disable-next-line @next/next/no-head-element -- 框架要求的显式 head */}
      <head>
        <HeadContent />
      </head>
      <body>
        {/* TanStack SSR 时 pathname 已知，不再需要 Next 的 Suspense 圈定 usePathname 分叉 */}
        <WorkspaceShell>
          <Outlet />
        </WorkspaceShell>
        <Scripts />
      </body>
    </html>
  );
}
