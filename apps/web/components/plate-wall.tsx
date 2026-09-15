'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { browseHref, browseMemoryKey, matchesSearch } from '@/lib/browse-context';
import { MotionVideo } from './motion-video';
import { categoryLabel } from '@/lib/category-label';
import { CollectionSearch } from './collection-search';
import { CollectionToolbar } from './collection-toolbar';
import { Button } from './button';
import styles from './plate-wall.module.css';
import { CategoryTabs, useCatParam } from './category-tabs';

export interface PlateWallItem {
  key: string;
  /** 所属分类（tab 过滤依据） */
  category: string;
  /** 桩号（有编号体系时显示的编号，墨色） */
  no?: string;
  /** caption 前缀（如作者名） */
  lead?: string;
  name: string;
  /** 右侧 mono 辅助信息（主题 / 日期） */
  sub?: string;
  href: string;
  kind: 'image' | 'video';
  /** image: 缩略图；video: mp4 */
  src: string;
  poster?: string | null;
  /** 灯箱大图（缺省用 src） */
  fullSrc?: string;
  width: number;
  height: number;
  mediaCount?: number;
  keywords?: string;
}

interface PlateWallProps {
  categories: { name: string; count: number }[];
  items: PlateWallItem[];
  /** 首屏与每批数量 */
  batchSize?: number;
}

const DEFAULT_BATCH = 48;

/** Stable gallery: one native link per work, visible motion previews, scroll-triggered batching. */
export function PlateWall({ categories, items, batchSize = DEFAULT_BATCH }: PlateWallProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [active, select] = useCatParam(categories.map((category) => category.name));
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const post = params.get('post');
    params.delete('post');
    const listHref = `${pathname}${params.size ? `?${params}` : ''}`;
    if (post) router.replace(browseHref(`${pathname}/${encodeURIComponent(post)}`, listHref));
  }, [searchParams, pathname, router]);
  const query = searchParams.get('q') ?? '';
  const setQuery = (q: string) => {
    const params = new URLSearchParams(window.location.search);
    if (q) params.set('q', q);
    else params.delete('q');
    window.history.replaceState(null, '', `${pathname}${params.size ? `?${params}` : ''}`);
  };
  const returnHref = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`;
  const [shown, setShown] = useState(batchSize);
  const moreRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (active === '全部' || item.category === active) &&
          matchesSearch(query, [item.name, item.lead, item.keywords, categoryLabel(item.category)]),
      ),
    [active, items, query],
  );

  const visible = filtered.slice(0, shown);
  const remember = (key: string) => {
    try {
      sessionStorage.setItem(
        browseMemoryKey('muse-return', returnHref),
        JSON.stringify({ href: returnHref, shown, y: window.scrollY, key }),
      );
    } catch {}
  };

  // 切分类时重置分批（render 期间调整 state，避免 effect 级联）
  const filterKey = `${active}|${query}`;
  const [prevKey, setPrevKey] = useState(filterKey);
  if (prevKey !== filterKey) {
    setPrevKey(filterKey);
    setShown(batchSize);
  }

  // URL is the query source of truth, including browser back/forward.
  useEffect(() => {
    let frame = 0;
    try {
      const memoryKey = browseMemoryKey(
        'muse-return',
        window.location.pathname + window.location.search,
      );
      const saved = JSON.parse(
        sessionStorage.getItem(memoryKey) ?? sessionStorage.getItem('muse-return') ?? 'null',
      );
      if (
        typeof saved?.href === 'string' &&
        browseMemoryKey('muse-return', saved.href) === memoryKey
      ) {
        frame = requestAnimationFrame(() => {
          setShown(Math.max(batchSize, Number(saved.shown) || batchSize));
          frame = requestAnimationFrame(() => {
            window.scrollTo(0, Number(saved.y) || 0);
            if (typeof saved.key === 'string')
              document.getElementById(`muse-${saved.key}`)?.focus({ preventScroll: true });
          });
        });
      }
    } catch {}
    return () => cancelAnimationFrame(frame);
  }, [batchSize]);

  useEffect(() => {
    const sentinel = moreRef.current;
    if (!sentinel || shown >= filtered.length) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setShown((count) => Math.min(count + batchSize, filtered.length));
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shown, filtered.length, filterKey, batchSize]);

  const clear = () => window.history.replaceState(null, '', pathname);
  return (
    <section aria-label="灵感浏览">
      <CollectionToolbar
        actions={
          <CollectionSearch
            value={query}
            onChange={setQuery}
            placeholder="搜索灵感"
            label="搜索标题、作者或标签"
          />
        }
      >
        <CategoryTabs categories={categories} active={active} onSelect={select} />
      </CollectionToolbar>
      <div className={styles.results}>
        <p role="status">{filtered.length} 件灵感</p>
        {query || active !== '全部' ? (
          <Button variant="ghost" onClick={clear}>
            清除筛选
          </Button>
        ) : null}
      </div>
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <h2>{items.length ? '没有找到匹配的灵感' : '还没有收录内容'}</h2>
          <p>{items.length ? '试试其他关键词或分类，或清除筛选。' : '内容收录后会出现在这里。'}</p>
          {items.length ? <Button onClick={clear}>查看全部灵感</Button> : null}
        </div>
      ) : (
        <div className={styles.grid}>
          {visible.map((item, index) => (
            <PlateCell
              key={item.key}
              item={item}
              priority={index < 8}
              href={browseHref(item.href, returnHref)}
              onNavigate={remember}
            />
          ))}
        </div>
      )}
      {visible.length < filtered.length ? (
        <div ref={moreRef} className={styles.more} aria-hidden="true" />
      ) : null}
    </section>
  );
}

function PlateCell({
  item,
  href,
  onNavigate,
  priority,
}: {
  item: PlateWallItem;
  href: string;
  onNavigate: (key: string) => void;
  priority: boolean;
}) {
  const router = useRouter();
  const prefetch = () => router.prefetch(href);
  const preview = item.kind === 'video' ? item.poster : item.src;
  const [failed, setFailed] = useState(!preview);
  const [ready, setReady] = useState(false);
  const cellRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (item.kind !== 'video' || !preview) return;
    const poster = new window.Image();
    poster.onload = () => {
      setReady(true);
      setFailed(false);
    };
    poster.src = preview;
    return () => {
      poster.onload = null;
    };
  }, [item.kind, preview]);
  useEffect(() => {
    const cell = cellRef.current;
    if (!cell || ready || failed) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !timer) timer = setTimeout(() => setFailed(true), 15000);
      else if (!entry?.isIntersecting && timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    });
    observer.observe(cell);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [ready, failed]);
  return (
    <Link
      ref={cellRef}
      id={`muse-${item.key}`}
      href={href}
      prefetch={false}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      className={styles.cell}
      onClick={() => onNavigate(item.key)}
    >
      <figure>
        <div className={styles.media}>
          {item.kind === 'video' && item.src ? (
            <MotionVideo
              src={item.src}
              poster={preview ?? undefined}
              aria-label={item.name}
              onLoadedMetadata={() => {
                setReady(true);
                setFailed(false);
              }}
              onLoadedData={() => {
                setReady(true);
                setFailed(false);
              }}
              onError={() => setFailed(true)}
            />
          ) : preview ? (
            <Image
              src={preview}
              alt=""
              fill
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : undefined}
              sizes="(min-width: 1200px) 25vw, (min-width: 760px) 33vw, (min-width: 360px) 50vw, 100vw"
              onLoad={() => {
                setReady(true);
                setFailed(false);
              }}
              onError={() => setFailed(true)}
            />
          ) : null}
          {failed ? (
            <span className={styles.failure}>
              预览暂不可用<span>查看作品与出处</span>
            </span>
          ) : null}
          {(item.mediaCount ?? 0) > 1 ? (
            <span className={styles.badge}>{item.mediaCount} 项</span>
          ) : null}
        </div>
        <figcaption className={styles.caption}>
          <h2 className={styles.title}>{item.name || '未命名灵感'}</h2>
          {item.lead ? <span className={styles.meta}>{item.lead}</span> : null}
        </figcaption>
      </figure>
    </Link>
  );
}
