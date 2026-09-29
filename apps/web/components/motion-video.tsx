'use client';

import { useEffect, useRef, type VideoHTMLAttributes } from 'react';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, 'src'> & {
  src: string;
  active?: boolean;
  manualControls?: boolean;
};

/** Real motion previews: load near the viewport, play only while visible. */
export function MotionVideo({
  active = true,
  manualControls = false,
  src,
  onPause,
  ...props
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let visible = false;
    let nearby = false;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    let eligible = false;
    let manualPause = false;
    let manualPlay = false;
    let automaticPlayback = false;
    let automaticPlayPending = false;
    let automaticPausePending = false;
    let disposed = false;
    const pauseAutomatically = () => {
      automaticPlayback = false;
      if (video.paused) return;
      automaticPausePending = true;
      video.pause();
    };
    const update = () => {
      if (
        active &&
        nearby &&
        !document.hidden &&
        src &&
        video.getAttribute('src') !== src &&
        (!instantMotion() || props.controls || manualControls)
      ) {
        video.src = src;
        video.load();
      }
      eligible = active && visible && !document.hidden;
      if (!eligible || (instantMotion() && automaticPlayback && !manualPlay)) {
        pauseAutomatically();
      } else if (
        (!instantMotion() || manualPlay) &&
        !manualPause &&
        video.paused &&
        !automaticPlayPending
      ) {
        automaticPlayback = true;
        automaticPlayPending = true;
        void video
          .play()
          .then(() => {
            if (disposed || !eligible || (instantMotion() && !manualPlay)) pauseAutomatically();
          })
          .catch(() => {})
          .finally(() => {
            automaticPlayPending = false;
          });
      }
    };
    const pause = () => {
      if (automaticPausePending) {
        automaticPausePending = false;
        return;
      }
      if (props.controls || manualControls) {
        automaticPlayback = false;
        manualPause = true;
        manualPlay = false;
      }
    };
    const play = () => {
      // Native or custom controls are an explicit choice, even with reduced motion.
      // Keep that choice through buffering/canplay without treating our own
      // automatic play() calls as user input.
      if (!automaticPlayback && (props.controls || manualControls)) {
        manualPlay = true;
        manualPause = false;
      }
      automaticPlayPending = false;
      if (!eligible) pauseAutomatically();
    };
    const near = new IntersectionObserver(
      ([entry]) => {
        nearby = !!entry?.isIntersecting;
        update();
      },
      { rootMargin: '80px' },
    );
    // Decorative previews can restart; native/manual playback keeps its position.
    const distant = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(releaseTimer);
        if (!entry?.isIntersecting && !props.controls && !manualControls) {
          releaseTimer = setTimeout(() => {
            pauseAutomatically();
            video.removeAttribute('src');
            video.load();
          }, 1500);
        }
      },
      { rootMargin: '600px' },
    );
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting && entry.intersectionRatio >= 0.3;
        update();
      },
      { threshold: 0.3 },
    );
    near.observe(video);
    distant.observe(video);
    observer.observe(video);
    const stopPolicy = observeMotionPolicy(update);
    video.addEventListener('canplay', update);
    video.addEventListener('pause', pause);
    video.addEventListener('play', play);
    return () => {
      disposed = true;
      eligible = false;
      near.disconnect();
      observer.disconnect();
      distant.disconnect();
      clearTimeout(releaseTimer);
      stopPolicy();
      video.removeEventListener('canplay', update);
      video.removeEventListener('pause', pause);
      video.removeEventListener('play', play);
      video.pause();
    };
  }, [active, src, props.controls, manualControls]);
  return (
    <video
      {...props}
      ref={ref}
      data-motion-video
      muted
      loop
      playsInline
      preload="metadata"
      onPause={onPause}
    />
  );
}
