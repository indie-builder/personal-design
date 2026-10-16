import type { SitePath } from '@/lib/navigation';
import { WorkspaceLink } from './workspace-shell';
import { Button, buttonClassName } from './button';
import styles from './page-error.module.css';

export function PageError({
  reset,
  title = '页面暂时无法打开',
  href = '/',
  returnLabel = '回到首页',
  hint = '加载时遇到了问题。重新加载会保留当前地址中的分类条件。',
}: {
  reset: () => void;
  title?: string;
  /** 错误恢复的返回目标；限定为 routeTree 已知路径，路由文件里写错即编译红 */
  href?: SitePath;
  returnLabel?: string;
  /** 覆盖默认提示语；默认文案假设地址中带有可保留的筛选条件 */
  hint?: string;
}) {
  return (
    <main className={styles.page}>
      <h1>{title}</h1>
      <p>{hint}</p>
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
