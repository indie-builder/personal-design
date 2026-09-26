'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { categoryLabel } from '@/lib/category-label';
import { paramsHref } from '@/lib/site-url';
import styles from './category-tabs.module.css';
import { cn } from '@/lib/utils';

/** ?cat= 参数读写：active 派生 + select（replace 不产生历史记录） */
export function useCatParam(
  allowed?: readonly string[],
): [active: string, select: (name: string) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const requested = searchParams.get('cat') ?? '全部';
  const active =
    requested === '全部' || !allowed || allowed.includes(requested) ? requested : '全部';
  useEffect(() => {
    if (requested === active) return;
    const href = paramsHref(pathname, new URLSearchParams(searchParams.toString()), { cat: '' });
    window.history.replaceState(null, '', href);
  }, [requested, active, searchParams, pathname]);
  const select = (name: string) => {
    const href = paramsHref(pathname, new URLSearchParams(searchParams.toString()), {
      cat: name === '全部' ? '' : name,
    });
    window.history.replaceState(null, '', href);
  };
  return [active, select];
}

/** 原生分类筛选组：选中状态，单行可滚动，焦点自动进入可见区。 */
export function CategoryTabs({
  categories,
  active,
  onSelect,
  className,
}: {
  categories: { name: string; count: number }[];
  active: string;
  onSelect: (name: string) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="分类" className={cn(styles.tabs, className)}>
      {[{ name: '全部' }, ...categories].map((category) => (
        <button
          key={categoryLabel(category.name)}
          type="button"
          aria-pressed={active === category.name}
          onClick={() => onSelect(category.name)}
          className={styles.tab}
          onFocus={(event) =>
            event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
        >
          {categoryLabel(category.name)}
        </button>
      ))}
    </div>
  );
}
