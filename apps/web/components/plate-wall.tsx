'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { browseHref, browseMemoryKey, matchesSearch } from '@/lib/browse-context';
import { paramsHref } from '@/lib/site-url';
import { categoryLabel } from '@/lib/category-label';
import { CollectionSearch } from './collection-search';
import { CollectionToolbar } from './collection-toolbar';
import { Button } from './button';
import styles from './plate-wall.module.css';
import { PlateCell } from './plate-cell';
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

async function loadPosts(
  query: string,
  category: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (query) params.set('q', query);
  if (category !== '全部') params.set('cat', category);
  const response = await fetch(`/products/muse/api/posts?${params}`, {
    signal: signal ?? AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Load failed: ${response.status}`);
  const data = (await response.json()) as { items: PlateWallItem[]; total: number };
  if (
    !Array.isArray(data?.items) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    (data.items.length === 0 && offset < data.total)
  )
    throw new Error('Invalid posts page');
  return data;
}

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
    if (post)
      router.replace(
        browseHref(
          `${pathname}/${encodeURIComponent(post)}`,
          paramsHref(pathname, params, { post: '' }),
        ),
      );
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
      window.history.replaceState(
        null,
        '',
        paramsHref(pathname, new URLSearchParams(window.location.search), { q: value }),
      );
    }, SEARCH_DEBOUNCE);
  };
  const returnHref = `${pathname}${searchParams.size ? `?${searchParams}` : ''}`;
  const filterKey = `${active}|${query}`;

  // 与筛选同步的数据窗口；key 落后于 filterKey 时为待同步，先用已载入窗口本地过滤回显
  const [synced, setSynced] = useState({ key: filterKey, items, total: initialTotal });
  const [shown, setShown] = useState(batchSize);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const observedRetryRef = useRef(0);
  const currentFilterRef = useRef(filterKey);
  currentFilterRef.current = filterKey;
  const moreRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const restoreAbortRef = useRef<AbortController | null>(null);
  const [restoration, setRestoration] = useState<{
    y: number;
    key: string;
    height: number;
    ready: boolean;
  } | null>(null);

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
        JSON.stringify({
          href: returnHref,
          shown,
          y: window.scrollY,
          key,
          height: sectionRef.current?.offsetHeight,
        }),
      );
    } catch {}
  };

  // 切筛选时重置分批（render 期间调整 state，避免 effect 级联）
  const [prevKey, setPrevKey] = useState(filterKey);
  if (prevKey !== filterKey) {
    setPrevKey(filterKey);
    setShown(batchSize);
    setLoadError(false);
  }

  // 筛选变化：防抖拉取当前筛选的完整首窗
  useEffect(() => {
    if (!stale || restoration || loadError) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const data = await loadPosts(query, active, 0, Math.max(batchSize, shown));
          if (cancelled) return;
          setSynced({
            key: `${active}|${query}`,
            items: data.items,
            total: Number(data.total) || data.items.length,
          });
        } catch {
          if (!cancelled) setLoadError(true);
        }
      })();
    }, SEARCH_DEBOUNCE);
    return () => {
      clearTimeout(timer);
      cancelled = true;
    };
  }, [stale, active, query, batchSize, shown, restoration, loadError, retry]);

  // Changing filters must cancel a pending return without moving focus or
  // allowing the old request to write into the newly selected list.
  useLayoutEffect(() => {
    restoreAbortRef.current?.abort();
    setRestoration(null);
  }, [filterKey]);

  // Activity reconnects this effect when a preserved list becomes visible.
  // Reuse that loaded window; only an evicted/reloaded list needs more data.
  useLayoutEffect(() => {
    const controller = new AbortController();
    restoreAbortRef.current = controller;
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
        const target = Number.isFinite(saved.shown)
          ? Math.max(batchSize, Math.trunc(saved.shown))
          : batchSize;
        const y = Number.isFinite(saved.y) ? Math.max(0, saved.y) : 0;
        let loaded = synced.key === filterKey ? synced.items : [];
        let total = synced.key === filterKey ? synced.total : initialTotal;
        setShown(target);
        setRestoration({
          y,
          key: typeof saved.key === 'string' ? saved.key : '',
          height: Math.max(
            Number.isFinite(saved.height) ? saved.height : 0,
            y + window.innerHeight,
          ),
          ready: loaded.length >= Math.min(target, total),
        });
        if (loaded.length < Math.min(target, total)) {
          void (async () => {
            try {
              const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
              while (loaded.length < Math.min(target, total)) {
                const data = await loadPosts(
                  query,
                  active,
                  loaded.length,
                  target - loaded.length,
                  signal,
                );
                if (typeof data?.total === 'number' && Number.isFinite(data.total))
                  total = Math.max(0, data.total);
                if (!Array.isArray(data?.items) || !data.items.length) break;
                loaded = [...loaded, ...data.items];
              }
            } catch {
              if (!controller.signal.aborted) setLoadError(true);
            }
            if (controller.signal.aborted) return;
            setSynced({ key: filterKey, items: loaded, total });
            setShown(Math.min(target, loaded.length));
            setRestoration((value) => value && { ...value, ready: true });
          })();
        }
      }
    } catch {}
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Mount / Activity re-show, not ordinary filter or batch updates.
  }, [batchSize]);

  useLayoutEffect(() => {
    if (!restoration) return;
    window.scrollTo({ top: restoration.y, behavior: 'instant' });
    if (!restoration.ready) return;
    const target =
      sectionRef.current?.querySelector<HTMLElement>(`#${CSS.escape(`muse-${restoration.key}`)}`) ??
      sectionRef.current;
    target?.focus({ preventScroll: true });
    setRestoration(null);
  }, [restoration]);

  // 滚动追加：本地还有未展示批次则直接扩显示数，否则向分片接口取下一片
  useEffect(() => {
    const requestedRetry = observedRetryRef.current !== retry;
    observedRetryRef.current = retry;
    const sentinel = moreRef.current;
    if (!sentinel || restoration || loadError || visible.length >= moreTotal) return;
    let cancelled = false;
    let loading = false;
    const append = () => {
      if (loading) return;
      loading = true;
      observer.disconnect();
      if (shown < listed.length) {
        setShown((count) => Math.min(count + batchSize, listed.length));
      } else if (!stale && synced.items.length < synced.total) {
        const offset = synced.items.length;
        const key = `${active}|${query}`;
        void (async () => {
          try {
            const data = await loadPosts(query, active, offset, batchSize);
            const slice = data?.items;
            if (cancelled) return;
            if (!slice.length) {
              setSynced((prev) => (prev.key === key ? { ...prev, total: data.total } : prev));
              return;
            }
            setSynced((prev) => {
              if (prev.key !== key || prev.items.length !== offset) return prev;
              return {
                key: prev.key,
                items: [...prev.items, ...slice],
                total: Number(data?.total) || prev.total,
              };
            });
            setShown(offset + slice.length);
          } catch {
            if (!cancelled && currentFilterRef.current === key) setLoadError(true);
          }
        })();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) append();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(sentinel);
    if (requestedRetry && !stale) append();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [
    shown,
    listed.length,
    visible.length,
    stale,
    synced,
    moreTotal,
    batchSize,
    active,
    query,
    restoration,
    loadError,
    retry,
  ]);

  const clear = () => window.history.replaceState(null, '', pathname);
  return (
    <section
      ref={sectionRef}
      aria-label="灵感浏览"
      aria-busy={!!restoration && !restoration.ready}
      tabIndex={-1}
      className={styles.wall}
      style={restoration ? { minHeight: restoration.height } : undefined}
    >
      {restoration && !restoration.ready ? (
        <p className={styles.restoring} role="status">
          正在恢复浏览位置…
        </p>
      ) : null}
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
        <p role="status">
          {stale ? (loadError ? '暂时无法更新结果' : '正在更新灵感…') : `${moreTotal} 件灵感`}
        </p>
        {query || active !== '全部' ? (
          <Button variant="ghost" onClick={clear}>
            清除筛选
          </Button>
        ) : null}
      </div>
      {loadError ? (
        <div className={styles.results} role="alert">
          <p>灵感加载失败，请重试。</p>
          <Button
            variant="ghost"
            onClick={() => {
              setLoadError(false);
              setRetry((value) => value + 1);
            }}
          >
            重试加载
          </Button>
        </div>
      ) : null}
      {listed.length === 0 && !loadError && !stale ? (
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
