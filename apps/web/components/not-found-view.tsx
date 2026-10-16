import { Link } from '@tanstack/react-router';
import { buttonClassName } from '@/components/button';
import styles from './not-found.module.css';

/** 根路由 notFoundComponent：对应原 app/not-found.tsx。 */
export function NotFoundView() {
  return (
    <main className={styles.page}>
      <h1>找不到这个页面</h1>
      <p>这个地址没有对应内容。回到首页，重新选择想浏览的产品。</p>
      <nav aria-label="继续浏览" className={styles.actions}>
        <Link to="/" className={buttonClassName({ variant: 'primary' })}>
          回到首页
        </Link>
      </nav>
    </main>
  );
}
