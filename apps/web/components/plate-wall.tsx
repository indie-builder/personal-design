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
  /** 服务端按当前筛选下发的首屏窗口；完整列表留在服务端，随滚动经分片接口追加 */
  items: PlateWallItem[];
  /** 当前筛选命中总数（服务端统计） */
  total: number;
  /** 首屏与每批数量 */
  batchSize?: number;
}

const DEFAULT_BATCH = 48;
const SEARCH_DEBOUNCE = 200;

/** Stable gallery: one native link per work, visible motion previews, scroll-triggered batching. */
export function PlateWall({
  categories,
  items,
  total: initialTotal,
  batchSize = DEFAULT_BATCH,
}: PlateWallProps) {
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
  // 输入即时回显在本地，停顿后写入 URL（URL 是筛选的唯一事实源）
  const [input, setInput] = useState(query);
  useEffect(() => setInput(query), [query]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setQuery = (value: string) => {
    setInput(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (value) params.set('q', value);
      else params.delete('q');
      window.history.replaceState(null, '', `${pathname}${params.size ? `?${params}` : ''}`);
    }, SEARCH_DEBOUNCE);
  };
  const returnHref = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`;
  const filterKey = `${active}|${query}`;

  // 与筛选同步的数据窗口；key 落后于 filterKey 时为待同步，先用已载入窗口本地过滤回显
  const [synced, setSynced] = useState({ key: filterKey, items, total: initialTotal });
  const [shown, setShown] = useState(batchSize);
  const moreRef = useRef<HTMLDivElement>(null);

  const stale = synced.key !== filterKey;
  const listed = useMemo(
    () =>
      stale
        ? synced.items.filter(
            (item) =>
              (active === '全部' || item.category === active) &&
              matchesSearch(query, [
                item.name,
                item.lead,
                item.keywords,
                categoryLabel(item.category),
              ]),
          )
        : synced.items,
    [stale, synced.items, active, query],
  );
  const moreTotal = stale ? listed.length : synced.total;
  const visible = listed.slice(0, shown);

  const remember = (key: string) => {
    try {
      sessionStorage.setItem(
        browseMemoryKey('muse-return', returnHref),
        JSON.stringify({ href: returnHref, shown, y: window.scrollY, key }),
      );
    } catch {}
  };

  // 切筛选时重置分批（render 期间调整 state，避免 effect 级联）
  const [prevKey, setPrevKey] = useState(filterKey);
  if (prevKey !== filterKey) {
    setPrevKey(filterKey);
    setShown(batchSize);
  }

  // 筛选变化：防抖拉取当前筛选的完整首窗
  const fetchIdRef = useRef(0);
  useEffect(() => {
    if (!stale) return;
    const fetchId = ++fetchIdRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (active !== '全部') params.set('cat', active);
        params.set('offset', '0');
        params.set('limit', String(Math.max(batchSize, shown)));
        try {
          const res = await fetch(`/products/muse/api/posts?${params}`);
          if (!res.ok) return;
          const data = (await res.json()) as { items?: PlateWallItem[]; total?: number };
          if (fetchIdRef.current !== fetchId || !Array.isArray(data.items)) return;
          setSynced({
            key: `${active}|${query}`,
            items: data.items,
            total: Number(data.total) || data.items.length,
          });
        } catch {}
      })();
    }, SEARCH_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [stale, active, query, batchSize, shown]);

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
        const target = Math.max(batchSize, Number(saved.shown) || batchSize);
        const restore = () => {
          frame = requestAnimationFrame(() => {
            setShown(target);
            frame = requestAnimationFrame(() => {
              window.scrollTo(0, Number(saved.y) || 0);
              if (typeof saved.key === 'string')
                document.getElementById(`muse-${saved.key}`)?.focus({ preventScroll: true });
            });
          });
        };
        if (target <= items.length) {
          restore();
          return () => cancelAnimationFrame(frame);
        }
        // 保存的分批超出首窗：先补齐窗口再恢复位置，保证恢复的滚动高度有效
        const params = new URLSearchParams(window.location.search);
        if (query) params.set('q', query);
        if (active !== '全部') params.set('cat', active);
        params.set('offset', String(items.length));
        params.set('limit', String(target - items.length));
        fetch(`/products/muse/api/posts?${params}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { items?: PlateWallItem[]; total?: number } | null) => {
            const slice = Array.isArray(data?.items) ? data.items : [];
            if (slice.length) {
              setSynced((prev) =>
                prev.key === filterKey
                  ? {
                      key: prev.key,
                      items: [...prev.items, ...slice],
                      total: Number(data?.total) || prev.total,
                    }
                  : prev,
              );
            }
          })
          .catch(() => {})
          .finally(restore);
      }
    } catch {}
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时按存储恢复一次
  }, [batchSize]);

  // 滚动追加：本地还有未展示批次则直接扩显示数，否则向分片接口取下一片
  useEffect(() => {
    const sentinel = moreRef.current;
    if (!sentinel || visible.length >= moreTotal) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        if (shown < listed.length) {
          setShown((count) => Math.min(count + batchSize, listed.length));
        } else if (!stale && synced.items.length < synced.total) {
          const offset = synced.items.length;
          const key = `${active}|${query}`;
          void (async () => {
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (active !== '全部') params.set('cat', active);
            params.set('offset', String(offset));
            params.set('limit', String(batchSize));
            try {
              const res = await fetch(`/products/muse/api/posts?${params}`);
              if (!res.ok) return;
              const data = (await res.json()) as { items?: PlateWallItem[]; total?: number };
              const slice = data.items;
              if (!Array.isArray(slice) || !slice.length) return;
              setSynced((prev) => {
                if (prev.key !== key || prev.items.length !== offset) return prev;
                return {
                  key: prev.key,
                  items: [...prev.items, ...slice],
                  total: Number(data.total) || prev.total,
                };
              });
            } catch {}
          })();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shown, listed.length, visible.length, stale, synced, moreTotal, batchSize, active, query]);

  const clear = () => window.history.replaceState(null, '', pathname);
  return (
    <section aria-label="灵感浏览">
      <CollectionToolbar
        actions={
          <CollectionSearch
            value={input}
            onChange={setQuery}
            placeholder="搜索灵感"
            label="搜索标题、作者或标签"
          />
        }
      >
        <CategoryTabs categories={categories} active={active} onSelect={select} />
      </CollectionToolbar>
      <div className={styles.results}>
        <p role="status">{moreTotal} 件灵感</p>
        {query || active !== '全部' ? (
          <Button variant="ghost" onClick={clear}>
            清除筛选
          </Button>
        ) : null}
      </div>
      {listed.length === 0 ? (
        <div className={styles.empty}>
          <h2>{query || active !== '全部' ? '没有找到匹配的灵感' : '还没有收录内容'}</h2>
          <p>
            {query || active !== '全部'
              ? '试试其他关键词或分类，或清除筛选。'
              : '内容收录后会出现在这里。'}
          </p>
          {query || active !== '全部' ? <Button onClick={clear}>查看全部灵感</Button> : null}
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
      {visible.length < moreTotal ? (
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
