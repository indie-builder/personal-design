import type { Metadata } from 'next';
import { WorkspaceShell } from '@/components/workspace-shell';
import './globals.css';

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
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        {/* 主题初始化必须在首帧前同步执行，防 FOUC */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <WorkspaceShell>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
