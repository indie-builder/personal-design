import { ArrowLeft, MoveLeft, MoveRight } from 'lucide-react';
import { DetailKeyboardNav } from './detail-tools';
import { browseHref, type BrowseEntry } from '@/lib/browse-context';
import styles from './browse-navigation.module.css';
import { WorkspaceLink } from './workspace-shell';

type Props = {
  returnLabel: string;
  fallbackHref: string;
  currentHref: string;
  entries: BrowseEntry[];
  contextHref: string | null;
};

export function BrowseNavigation({
  returnLabel,
  fallbackHref,
  currentHref,
  entries,
  contextHref,
}: Props) {
  fallbackHref = contextHref ?? fallbackHref;
  const index = entries.findIndex((entry) => entry.href === currentHref);
  const prev = entries[index - 1];
  const next = entries[index + 1];
  const href = (entry: BrowseEntry) =>
    contextHref ? browseHref(entry.href, fallbackHref) : entry.href;
  return (
    <>
      <nav className={styles.navigation} aria-label="作品导航">
        <WorkspaceLink
          href={fallbackHref}
          resetScroll={false}
          data-direction="previous"
          className={`${styles.textControl} ${styles.returnLink}`}
        >
          <ArrowLeft size={16} aria-hidden />
          {returnLabel}
        </WorkspaceLink>
        <div className={styles.adjacent}>
          {prev ? (
            <WorkspaceLink
              href={href(prev)}
              data-direction="previous"
              title={prev.title}
              aria-label={`上一件：${prev.title}`}
              className={styles.textControl}
            >
              <MoveLeft size={24} strokeWidth={1.5} aria-hidden />
              <span>上一件</span>
            </WorkspaceLink>
          ) : (
            <button type="button" className={styles.textControl} disabled aria-label="已是第一件">
              <MoveLeft size={24} strokeWidth={1.5} aria-hidden />
              <span>上一件</span>
            </button>
          )}
          {next ? (
            <WorkspaceLink
              href={href(next)}
              data-direction="next"
              title={next.title}
              aria-label={`下一件：${next.title}`}
              className={styles.textControl}
            >
              <span>下一件</span>
              <MoveRight size={24} strokeWidth={1.5} aria-hidden />
            </WorkspaceLink>
          ) : (
            <button type="button" className={styles.textControl} disabled aria-label="已是最后一件">
              <span>下一件</span>
              <MoveRight size={24} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      </nav>
      <DetailKeyboardNav
        prevHref={prev ? href(prev) : undefined}
        nextHref={next ? href(next) : undefined}
      />
    </>
  );
}
