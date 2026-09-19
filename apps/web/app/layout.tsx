import type { Metadata } from 'next';
import { Suspense } from 'react';
import localFont from 'next/font/local';
import { WorkspaceShell } from '@/components/workspace-shell';
import './globals.css';

// next/font 自动预加载并生成 size-adjust 回退度量，避免 swap 时布局抖动
const albertSans = localFont({
  src: './fonts/AlbertSans-VariableFont_wght.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-albert-sans',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: {
    default: '作品时间轴',
    template: '%s · 作品时间轴',
  },
  description: '设计工具与参考产品集。',
};

// 主题初始化：首帧前读 localStorage('theme')，缺省跟系统；同步脚本防 FOUC
const THEME_INIT = `(function(){var t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';try{var s=localStorage.getItem('theme');if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={albertSans.variable} suppressHydrationWarning>
      <body>
        {/* 主题初始化必须在首帧前同步执行，防 FOUC */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* Shell 内的 usePathname 在动态段预渲染时未知，用 Suspense 圈定分叉；
            静态路由 pathname 预渲染期已知，外壳内容不受影响 */}
        <Suspense fallback={null}>
          <WorkspaceShell>{children}</WorkspaceShell>
        </Suspense>
      </body>
    </html>
  );
}
