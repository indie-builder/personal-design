'use client';

import { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from './button';
import { MotionVideo } from './motion-video';
import styles from './site-showcase-media.module.css';

export function SiteShowcaseMedia({ videoSrc, poster }: { videoSrc: string; poster: string }) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const togglePlayback = (video: HTMLVideoElement) => {
    if (video.paused) {
      // The optimistic flag covers the fetch until playback actually starts.
      setLoading(true);
      void video
        .play()
        .catch(() => {})
        .finally(() => setLoading(false));
    } else video.pause();
  };
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <section aria-label="个人网站动态展示">
      <div className={styles.media} data-playing={playing} data-loading={loading || undefined}>
        <MotionVideo
          key={attempt}
          className={styles.video}
          src={videoSrc}
          poster={poster}
          width={1920}
          height={1080}
          manualControls
          disablePictureInPicture
          disableRemotePlayback
          role="button"
          tabIndex={0}
          aria-label={`${loading ? '正在加载' : playing ? '暂停' : '播放'}个人网站宣传片`}
          onClick={(event) => togglePlayback(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === ' ' || event.key === 'Enter') {
              event.preventDefault();
              if (!event.repeat) togglePlayback(event.currentTarget);
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            setLoading(false);
          }}
          onPlaying={() => setLoading(false)}
          onWaiting={() => setLoading(true)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
        <span className={styles.playHint} aria-hidden="true">
          {loading ? (
            <>
              <span className={styles.spinner} />
              正在加载…
            </>
          ) : (
            <>
              {playing ? <Pause size={16} /> : <Play size={16} />}{' '}
              {playing ? '点击暂停' : '点击播放'}
            </>
          )}
        </span>
      </div>
      {failed && (
        <div className={styles.status} role="status">
          宣传片暂时无法播放，请重试或打开原网站。
          <Button
            variant="ghost"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            重新加载
          </Button>
        </div>
      )}
    </section>
  );
}
