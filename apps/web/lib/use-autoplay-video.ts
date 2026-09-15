import { useEffect, useRef } from 'react';

/** Only visible, foreground videos autoplay; preference changes apply immediately. */
export function useAutoplayVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let disposed = false;
    const allowed = () => !disposed && visible && !document.hidden && !motion.matches;
    const update = () => {
      if (!allowed()) {
        video.pause();
        return;
      }
      void video
        .play()
        .then(() => {
          if (!allowed()) video.pause();
        })
        .catch(() => {});
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry && entry.isIntersecting && entry.intersectionRatio >= 0.25;
        update();
      },
      { threshold: [0, 0.25] },
    );
    observer.observe(video);
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      disposed = true;
      observer.disconnect();
      motion.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      video.pause();
    };
  }, []);
  return ref;
}
