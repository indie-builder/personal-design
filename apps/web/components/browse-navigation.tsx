'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, MoveLeft, MoveRight } from 'lucide-react';
import { DetailKeyboardNav } from './detail-tools';
import {
  browseHref,
  resolveUrlBrowseContext,
  type BrowseEntry,
  type FilterableBrowseEntry,
} from '@/lib/browse-context';
import styles from './browse-navigation.module.css';
import { WorkspaceLink } from './workspace-shell';

type Props = {
  listPath: string;
  returnLabel: string;
  fallbackHref: string;
  currentHref: string;
  entries: BrowseEntry[];
  browseEntries: FilterableBrowseEntry[];
};

export function BrowseNavigation(props: Props) {
  return (
    <Suspense fallback={<Navigation {...props} />}>
      <ContextNavigation {...props} />
    </Suspense>
  );
}

function ContextNavigation(props: Props) {
  const params = useSearchParams();
  const context = useMemo(
    () =>
      resolveUrlBrowseContext(
        params.toString(),
        props.listPath,
        props.currentHref,
        props.browseEntries,
      ),
    [props.listPath, props.currentHref, props.browseEntries, params],
  );
  return (
    <Navigation
      {...props}
      fallbackHref={context?.href ?? props.fallbackHref}
      entries={context?.entries ?? props.entries}
      fromList={!!context}
    />
  );
}

function Navigation({
  returnLabel,
  fallbackHref,
  currentHref,
  entries,
  fromList = false,
}: Props & { fromList?: boolean }) {
  const index = entries.findIndex((entry) => entry.href === currentHref);
  const prev = entries[index - 1];
  const next = entries[index + 1];
  const href = (entry: BrowseEntry) =>
    fromList ? browseHref(entry.href, fallbackHref) : entry.href;
  return (
    <>
      <nav className={styles.navigation} aria-label="作品导航">
        <WorkspaceLink
          href={fallbackHref}
          scroll={false}
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
