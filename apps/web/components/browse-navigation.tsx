'use client';

import { Suspense, useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, MoveLeft, MoveRight } from 'lucide-react';
import { buttonClassName } from './button';
import { DetailKeyboardNav } from './detail-tools';
import {
  browseHref,
  resolveBrowseContext,
  resolveUrlBrowseContext,
  type BrowseEntry,
  type FilterableBrowseEntry,
} from '@/lib/browse-context';
import styles from './browse-navigation.module.css';
import { WorkspaceLink } from './workspace-shell';

type Props = {
  appearance?: 'button' | 'text';
  listPath: string;
  storageKey: string;
  returnLabel: string;
  fallbackHref: string;
  currentHref: string;
  entries: BrowseEntry[];
  browseEntries: FilterableBrowseEntry[];
};
const subscribe = () => () => {};

export function BrowseNavigation(props: Props) {
  return (
    <Suspense fallback={<Navigation {...props} />}>
      <ContextNavigation {...props} />
    </Suspense>
  );
}

function ContextNavigation(props: Props) {
  const params = useSearchParams();
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(props.storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const context = useMemo(
    () =>
      params.get('browse') === '1'
        ? resolveBrowseContext(raw, props.listPath, props.currentHref)
        : resolveUrlBrowseContext(
            params.toString(),
            props.listPath,
            props.currentHref,
            props.browseEntries,
          ),
    [raw, props.listPath, props.currentHref, props.browseEntries, params],
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
  appearance = 'button',
  returnLabel,
  fallbackHref,
  currentHref,
  entries,
  listPath,
  fromList = false,
}: Props & { fromList?: boolean }) {
  const index = entries.findIndex((entry) => entry.href === currentHref);
  const prev = entries[index - 1];
  const next = entries[index + 1];
  const textNavigation = appearance === 'text';
  const controlClass = textNavigation ? styles.textControl : buttonClassName();
  const PreviousIcon = textNavigation ? MoveLeft : ArrowLeft;
  const NextIcon = textNavigation ? MoveRight : ArrowRight;
  const href = (entry: BrowseEntry) =>
    fromList ? browseHref(entry.href, fallbackHref) : entry.href;
  return (
    <>
      <nav
        className={`${styles.navigation} ${textNavigation ? styles.textNavigation : ''}`}
        aria-label="作品导航"
      >
        <WorkspaceLink
          href={fallbackHref}
          scroll={false}
          data-direction="previous"
          className={
            textNavigation
              ? `${styles.textControl} ${styles.returnLink}`
              : buttonClassName({ variant: 'ghost' })
          }
        >
          <ArrowLeft size={16} aria-hidden />
          {returnLabel}
        </WorkspaceLink>
        <div className={styles.adjacent}>
          {prev ? (
            <Link
              href={href(prev)}
              data-direction="previous"
              title={prev.title}
              aria-label={`上一件：${prev.title}`}
              className={controlClass}
            >
              <PreviousIcon size={24} strokeWidth={1.5} aria-hidden />
              <span>上一件</span>
            </Link>
          ) : (
            <button type="button" className={controlClass} disabled aria-label="已是第一件">
              <PreviousIcon size={24} strokeWidth={1.5} aria-hidden />
              <span>上一件</span>
            </button>
          )}
          {next ? (
            <Link
              href={href(next)}
              data-direction="next"
              title={next.title}
              aria-label={`下一件：${next.title}`}
              className={controlClass}
            >
              <span>下一件</span>
              <NextIcon size={24} strokeWidth={1.5} aria-hidden />
            </Link>
          ) : (
            <button type="button" className={controlClass} disabled aria-label="已是最后一件">
              <span>下一件</span>
              <NextIcon size={24} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      </nav>
      <DetailKeyboardNav
        prevHref={prev ? href(prev) : undefined}
        nextHref={next ? href(next) : undefined}
        hrefPattern={`^${listPath}/`}
      />
    </>
  );
}
