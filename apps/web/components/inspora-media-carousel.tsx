import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, RotateCcw } from 'lucide-react';
import { Button, buttonClassName } from './button';
import styles from './inspora-media-carousel.module.css';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';
import { useMediaStatus } from '@/lib/use-media-status';
import { MotionVideo } from './motion-video';
import { LightboxProvider, useLightbox } from './lifeline/lightbox';

interface CarouselMedia {
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
  const [destination, setDestination] = useState(0);
  const move = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(media.length - 1, index));
    setDestination(next);
    if (instantMotion()) setCurrent(next);
    track.scrollTo({
      left: next * track.clientWidth,
      behavior: instantMotion() ? 'instant' : 'smooth',
    });
  };
  // Keep one coordinate system for the entire native scroll. Commit the new
  // media geometry only at scrollend, then align it before the next paint.
  useLayoutEffect(() => {
    const track = trackRef.current;
    track?.scrollTo({ left: current * track.clientWidth, behavior: 'instant' });
  }, [current]);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let width = track.clientWidth;
    const finish = () => {
      setCurrent(destination);
      track.scrollTo({ left: destination * track.clientWidth, behavior: 'instant' });
    };
    const resize = new ResizeObserver(() => {
      if (width === track.clientWidth) return;
      width = track.clientWidth;
      finish();
    });
    resize.observe(track);
    const stop = observeMotionPolicy(() => {
      if (instantMotion() || document.hidden) finish();
    });
    return () => {
      resize.disconnect();
      stop();
    };
  }, [destination]);
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
          onScrollEnd={() => {
            const track = trackRef.current;
            if (!track?.clientWidth) return;
            const next = Math.max(
              0,
              Math.min(media.length - 1, Math.round(track.scrollLeft / track.clientWidth)),
            );
            setCurrent(next);
            setDestination(next);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              move(destination + (event.key === 'ArrowLeft' ? -1 : 1));
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
              disabled={destination === 0}
              onClick={() => move(destination - 1)}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <Button
              icon
              data-direction="next"
              aria-label="下一张媒体"
              disabled={destination === media.length - 1}
              onClick={() => move(destination + 1)}
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
  const { status, attempt, setStatus, retry } = useMediaStatus(active, 15000);
  const slideRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLImageElement>(null);
  const leavingRef = useRef<HTMLDivElement>(null);
  const noticeFocus = useRef<string | null>(null);
  const [previewDone, setPreviewDone] = useState<number | null>(null);
  const notice = active && status !== 'ready' ? status : null;
  const [notices, setNotices] = useState({ current: notice, leaving: null as typeof notice });
  if (notices.current !== notice) {
    setNotices({ current: notice, leaving: notices.current });
  }

  useLayoutEffect(() => {
    const leaving = leavingRef.current;
    if (noticeFocus.current === notices.leaving && notices.leaving) {
      noticeFocus.current = null;
      if (leaving?.contains(document.activeElement) || document.activeElement === document.body) {
        slideRef.current?.closest<HTMLElement>('[role="region"]')?.focus({ preventScroll: true });
      }
    }
    if (!leaving) return;
    let disposed = false;
    let animation: Animation | undefined;
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      stop();
      animation?.cancel();
      setNotices((value) => ({ ...value, leaving: null }));
    };
    if (!active || instantMotion() || document.hidden) {
      finish();
      return;
    }
    try {
      animation = leaving.animate(
        [{ opacity: getComputedStyle(leaving).opacity }, { opacity: 0 }],
        { duration: 140, easing: 'ease', fill: 'forwards' },
      );
      void animation.finished.then(finish, finish);
    } catch {
      finish();
      return;
    }
    timer = setTimeout(finish, 260);
    stop = observeMotionPolicy(() => {
      if (instantMotion() || document.hidden) finish();
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      stop();
      animation?.cancel();
    };
  }, [notices.current, notices.leaving, active]);

  useLayoutEffect(() => {
    if (item.type !== 'image' || status !== 'ready') return;
    const image = imageRef.current;
    const preview = previewRef.current;
    if (!image || !preview) return;
    let disposed = false;
    let fading = false;
    let animation: Animation | undefined;
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      stop();
      // Cancelling a CSS transition exposes its ready-state target immediately.
      for (const transition of image.getAnimations()) transition.cancel();
      animation?.cancel();
      setPreviewDone(attempt);
    };
    const fadePreview = () => {
      if (disposed || fading) return;
      fading = true;
      clearTimeout(timer);
      for (const transition of image.getAnimations()) transition.cancel();
      if (!active || instantMotion() || document.hidden) return finish();
      try {
        animation = preview.animate([{ opacity: 0.85 }, { opacity: 0 }], {
          duration: 140,
          easing: 'ease',
          fill: 'forwards',
        });
        void animation.finished.then(finish, finish);
      } catch {
        finish();
        return;
      }
      timer = setTimeout(finish, 260);
    };
    if (!active || instantMotion() || document.hidden) {
      finish();
      return;
    }
    // Flush the existing 160ms CSS reveal before waiting for its final opacity.
    const opacity = getComputedStyle(image).opacity;
    const reveals = opacity === '1' ? [] : image.getAnimations();
    timer = setTimeout(fadePreview, 280);
    void Promise.allSettled(reveals.map((reveal) => reveal.finished)).then(fadePreview);
    stop = observeMotionPolicy(() => {
      if (instantMotion() || document.hidden) finish();
    });
    return () => {
      disposed = true;
      clearTimeout(timer);
      stop();
      animation?.cancel();
    };
  }, [status, active, attempt, item.type]);

  return (
    <figure
      ref={slideRef}
      className={styles.slide}
      data-ready={status === 'ready'}
      role="group"
      aria-roledescription="幻灯片"
      aria-label={`${index + 1} / ${total}`}
      inert={!active}
    >
      {item.type === 'image' &&
      item.poster &&
      item.poster !== item.src &&
      previewDone !== attempt ? (
        // eslint-disable-next-line @next/next/no-img-element -- Local thumbnail remains visible while original loads.
        <img ref={previewRef} src={item.poster} alt="" aria-hidden className={styles.preview} />
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
          ref={imageRef}
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
              images.map((image) => ({
                src: image.src,
                thumb: image.poster ?? image.src,
                alt: image.alt,
                width: image.width ?? undefined,
                height: image.height ?? undefined,
              })),
              images.findIndex((image) => image.id === item.id),
              event.currentTarget,
            );
          }}
        />
      ) : null}
      {[notices.leaving, notice].map((value, position) =>
        value ? (
          <div
            key={value}
            ref={position === 0 ? leavingRef : undefined}
            className={value === 'error' ? styles.message : styles.loading}
            role={position === 0 ? undefined : 'status'}
            data-leaving={position === 0 ? '' : undefined}
            aria-hidden={position === 0 ? true : undefined}
            inert={position === 0}
            onFocusCapture={() => {
              noticeFocus.current = value;
            }}
            onBlurCapture={(event) => {
              if (
                event.relatedTarget &&
                !event.currentTarget.contains(event.relatedTarget as Node)
              ) {
                noticeFocus.current = null;
              }
            }}
          >
            <p>{value === 'error' ? '媒体暂时无法加载' : '正在加载媒体…'}</p>
            {value === 'error' ? (
              <>
                <p>可以重试，或在新窗口打开原媒体。</p>
                <div className={styles.actions}>
                  <Button onClick={retry}>
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
        ) : null,
      )}
    </figure>
  );
}
