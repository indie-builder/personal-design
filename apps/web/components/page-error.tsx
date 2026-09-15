'use client';

import { WorkspaceLink } from './workspace-shell';
import { Button, buttonClassName } from './button';
import styles from './page-error.module.css';

export function PageError({
  reset,
  title = '页面暂时无法打开',
  href = '/',
  returnLabel = '回到首页',
}: {
  reset: () => void;
  title?: string;
  href?: string;
  returnLabel?: string;
}) {
  return (
    <main className={styles.page}>
      <h1>{title}</h1>
      <p>加载时遇到了问题。重新加载会保留当前地址中的分类条件。</p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={reset}>
          重新加载
        </Button>
        <WorkspaceLink href={href} className={buttonClassName({ variant: 'ghost' })}>
          {returnLabel}
        </WorkspaceLink>
      </div>
    </main>
  );
}
