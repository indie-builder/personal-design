'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, RotateCcw } from 'lucide-react';
import { Button, buttonClassName } from './button';
import styles from './inspora-media-carousel.module.css';
import { instantMotion } from '@/lib/motion';
import { MotionVideo } from './motion-video';
import { LightboxProvider, useLightbox } from './lifeline/lightbox';

export interface CarouselMedia {
  id: string;
  type: 'image' | 'video';
  src: string;
  poster: string | null;
  width: number | null;
  height: number | null;
  alt: string;
}

/** Native snap with visible, muted looping playback and full playback controls. */
export function MuseMediaCarousel({ media }: { media: CarouselMedia[] }) {
  return (
    <LightboxProvider>
      <Carousel media={media} />
    </LightboxProvider>
  );
}

function Carousel({ media }: { media: CarouselMedia[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const move = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({
      left: Math.max(0, Math.min(media.length - 1, index)) * track.clientWidth,
      behavior: instantMotion() ? 'instant' : 'smooth',
    });
  };
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let width = track.clientWidth;
    const resize = new ResizeObserver(() => {
      if (width === track.clientWidth) return;
      width = track.clientWidth;
      track.scrollTo({ left: current * width, behavior: 'instant' });
    });
    resize.observe(track);
    return () => resize.disconnect();
  }, [current]);
  const selected = media[current];
  const ratio = selected?.width && selected.height ? selected.width / selected.height : 4 / 3;
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || selected?.type !== 'video') return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      // Document position is stable during ordinary scroll. Refit only for
      // viewport or preceding content changes, keeping native controls in view.
      const top = stage.getBoundingClientRect().top + window.scrollY;
      const controls = Math.max(64, (toolbarRef.current?.offsetHeight ?? 0) + 12);
      const height = Math.max(240, window.innerHeight - top - controls);
      stage.style.setProperty('--video-height', `${height}px`);
    };
    fit();
    const resize = new ResizeObserver(fit);
    if (toolbarRef.current) resize.observe(toolbarRef.current);
    let sibling = stage.parentElement?.previousElementSibling;
    while (sibling) {
      resize.observe(sibling);
      sibling = sibling.previousElementSibling;
    }
    window.addEventListener('resize', fit);
    void document.fonts.ready.then(fit);
    return () => {
      disposed = true;
      resize.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [selected?.type, selected?.id]);
  return (
    <div className={styles.carousel} data-detail-keys-ignore>
      <div
        ref={stageRef}
        className={`${styles.stage} ${selected?.type === 'video' ? styles.videoStage : ''}`}
        style={{ '--media-ratio': ratio } as CSSProperties}
      >
        <div
          ref={trackRef}
          className={styles.track}
          tabIndex={0}
          role="region"
          aria-roledescription="轮播"
          aria-label="作品媒体"
          onScroll={() => {
            const track = trackRef.current;
            if (track?.clientWidth)
              setCurrent(
                Math.max(
                  0,
                  Math.min(media.length - 1, Math.round(track.scrollLeft / track.clientWidth)),
                ),
              );
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              move(current + (event.key === 'ArrowLeft' ? -1 : 1));
            }
            if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault();
              move(event.key === 'Home' ? 0 : media.length - 1);
            }
          }}
        >
          {media.map((item, index) => (
            <MediaSlide
              key={item.id}
              item={item}
              active={index === current}
              index={index}
              total={media.length}
              siblings={media}
            />
          ))}
        </div>
        {media.length > 1 ? (
          <nav className={styles.mediaNavigation} aria-label="媒体翻页">
            <Button
              icon
              data-direction="previous"
              aria-label="上一张媒体"
              disabled={current === 0}
              onClick={() => move(current - 1)}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <Button
              icon
              data-direction="next"
              aria-label="下一张媒体"
              disabled={current === media.length - 1}
              onClick={() => move(current + 1)}
            >
              <ArrowRight aria-hidden />
            </Button>
          </nav>
        ) : null}
      </div>
      {selected?.type === 'image' || media.length > 1 ? (
        <div ref={toolbarRef} className={styles.toolbar}>
          <span className={styles.counter} aria-live="polite">
            {media.length > 1 ? `${current + 1} / ${media.length}` : null}
          </span>
          <div className={styles.actions}>
            <a
              className={buttonClassName({ variant: 'ghost' })}
              href={media[current]?.src}
              target="_blank"
              rel="noreferrer"
            >
              {selected?.type === 'image' ? '查看原图' : '打开视频'}
              <ArrowUpRight size={16} aria-hidden />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MediaSlide({
  item,
  active,
  index,
  total,
  siblings,
}: {
  item: CarouselMedia;
  active: boolean;
  index: number;
  total: number;
  siblings: CarouselMedia[];
}) {
  const lightbox = useLightbox();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || status !== 'loading') return;
    const timer = setTimeout(() => setStatus('error'), 15000);
    return () => clearTimeout(timer);
  }, [active, status, attempt]);
  return (
    <figure
      className={styles.slide}
      data-ready={status === 'ready'}
      role="group"
      aria-roledescription="幻灯片"
      aria-label={`${index + 1} / ${total}`}
      inert={!active}
    >
      {item.type === 'image' && item.poster && item.poster !== item.src && status !== 'ready' ? (
        // eslint-disable-next-line @next/next/no-img-element -- Local thumbnail remains visible while original loads.
        <img src={item.poster} alt="" className={styles.preview} />
      ) : null}
      {item.type === 'video' ? (
        <MotionVideo
          key={attempt}
          active={active}
          src={item.src}
          poster={item.poster ?? undefined}
          aria-label={item.alt}
          controls
          onLoadedMetadata={() => setStatus('ready')}
          onLoadedData={() => setStatus('ready')}
          onCanPlay={() => setStatus('ready')}
          onWaiting={() => setStatus((value) => (value === 'error' ? 'error' : 'loading'))}
          onError={() => setStatus('error')}
          className={styles.media}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- Full-size source preserves original media and intrinsic proportions.
        <img
          key={attempt}
          src={item.src}
          alt={item.alt}
          decoding="async"
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : undefined}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          className={styles.media}
        />
      )}
      {item.type === 'image' ? (
        <button
          className={styles.zoomButton}
          aria-label={`放大查看 ${item.alt}`}
          onClick={(event) => {
            const images = siblings.filter((image) => image.type === 'image');
            lightbox?.open(
              {
                src: item.src,
                thumb: item.poster ?? item.src,
                alt: item.alt,
                width: item.width ?? undefined,
                height: item.height ?? undefined,
              },
              {
                sourceEl: event.currentTarget,
                rect: event.currentTarget.getBoundingClientRect(),
                siblings: images.map((image) => ({
                  src: image.src,
                  thumb: image.poster ?? image.src,
                  alt: image.alt,
                  width: image.width ?? undefined,
                  height: image.height ?? undefined,
                })),
                index: images.findIndex((image) => image.id === item.id),
              },
            );
          }}
        />
      ) : null}
      {status !== 'ready' && active ? (
        <div className={status === 'error' ? styles.message : styles.loading} role="status">
          <p>{status === 'error' ? '媒体暂时无法加载' : '正在加载媒体…'}</p>
          {status === 'error' ? (
            <>
              <p>可以重试，或在新窗口打开原媒体。</p>
              <div className={styles.actions}>
                <Button
                  onClick={() => {
                    setStatus('loading');
                    setAttempt((n) => n + 1);
                  }}
                >
                  <RotateCcw size={16} />
                  重试
                </Button>
                <a
                  href={item.src}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClassName({ variant: 'ghost' })}
                >
                  打开原媒体
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </figure>
  );
}
