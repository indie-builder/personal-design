'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionVideo } from './motion-video';
import type { PlateWallItem } from './plate-wall';
import styles from './plate-wall.module.css';

export function PlateCell({
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
