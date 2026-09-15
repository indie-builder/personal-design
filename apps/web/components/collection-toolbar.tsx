import type { ReactNode } from 'react';
import styles from './collection-toolbar.module.css';

export function CollectionToolbar({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.categories}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
