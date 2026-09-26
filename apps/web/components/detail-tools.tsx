'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import Image from 'next/image';
import { Button } from './button';
import styles from './detail-tools.module.css';
import { usePathname, useRouter } from 'next/navigation';
import { useMediaStatus } from '@/lib/use-media-status';
import { LightboxProvider, useLightbox, type LightboxItem } from './lifeline/lightbox';

// 常驻单例翻页监听：page 组件只把翻页目标写进 <html> dataset（useLayoutEffect，
// paint 前就绪），keydown 在模块级只注册一次——详情→详情导航的过渡窗口内监听不卸，
// 消除提交边界丢键。HMR 重载模块时用 window 标记防重复注册。
const NAV_LISTENER_FLAG = '__detailNavListener__';

let navRouter: ReturnType<typeof useRouter> | null = null;

function ensureNavListener() {
  const w = window as unknown as Record<string, boolean>;
  if (w[NAV_LISTENER_FLAG]) return;
  w[NAV_LISTENER_FLAG] = true;
  window.addEventListener('keydown', (event) => {
    // 灯箱打开时让灯箱消费方向键（灯箱翻图），不跳详情页
    if (document.body.dataset.lightboxOpen === 'true') return;
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.repeat
    )
      return;
    // 焦点在输入控件或局部滚动区（媒体轮播）内时，方向键留给局部
    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.(
        'input, textarea, select, button, a, [role=tab], [role=slider], [contenteditable], [data-detail-keys-ignore]',
      )
    ) {
      return;
    }
    const { detailPrev, detailNext } = document.documentElement.dataset;
    if (event.key === 'ArrowLeft' && detailPrev) {
      event.preventDefault();
      try {
        sessionStorage.setItem('detail-nav', detailPrev);
      } catch {}
      navRouter?.push(detailPrev);
    } else if (event.key === 'ArrowRight' && detailNext) {
      event.preventDefault();
      try {
        sessionStorage.setItem('detail-nav', detailNext);
      } catch {}
      navRouter?.push(detailNext);
    }
  });
}

/** 详情主图支持同主题图鉴的灯箱浏览。 */
export function DetailMainImage(props: {
  src: string;
  thumb: string;
  alt: string;
  serial: string;
  siblings: LightboxItem[];
  index: number;
}) {
  return (
    <LightboxProvider>
      <MainImageButton {...props} />
    </LightboxProvider>
  );
}

function MainImageButton({
  src,
  thumb,
  alt,
  serial,
  siblings,
  index,
}: {
  src: string;
  thumb: string;
  alt: string;
  serial: string;
  siblings: LightboxItem[];
  index: number;
}) {
  const lightbox = useLightbox();
  // 'error' 即「回退预览图」状态；载入看门狗 12 秒。
  const { status: state, attempt, setStatus, retry } = useMediaStatus(true, 12000);
  return (
    <div className={styles.imageWrap}>
      <button
        type="button"
        aria-label={`放大查看 ${alt}`}
        className={styles.imageButton}
        onClick={(event) =>
          lightbox?.open(
            { src, thumb, alt, serial },
            {
              rect: event.currentTarget.getBoundingClientRect(),
              sourceEl: event.currentTarget,
              siblings,
              index,
            },
          )
        }
      >
        <Image
          src={thumb}
          alt={alt}
          fill
          priority
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-contain"
        />
        {state !== 'error' && (
          <Image
            key={attempt}
            src={src}
            alt=""
            fill
            priority
            unoptimized
            sizes="(min-width: 1024px) 60vw, 100vw"
            className={styles.fullImage}
            style={{ opacity: state === 'ready' ? 1 : 0 }}
            onLoad={() => setStatus('ready')}
            onError={() => setStatus('error')}
          />
        )}
        <span className={styles.zoomHint}>点击放大</span>
      </button>
      {state !== 'ready' && (
        <div className={styles.status} role="status">
          <span>
            {state === 'loading' ? '正在载入高清图，先显示预览' : '高清图暂不可用，已显示预览'}
          </span>
          {state === 'error' && (
            <Button variant="ghost" onClick={retry}>
              重新加载
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** 详情页键盘 ←/→ 翻页（与灯箱翻图心智一致）；并负责 detail-in 翻页跳过标记 */
export function DetailKeyboardNav({
  prevHref,
  nextHref,
  hrefPattern = '^/products/layout-compositions/\\d+',
}: {
  prevHref?: string;
  nextHref?: string;
  /** 判定「详情→详情」链接的正则（用于翻页跳过入场动画） */
  hrefPattern?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // 详情→详情导航后跳过一次入场动画：离开前记下目标路径，
  // 路径真正到达后才消费（导航过渡期间旧树也会跑 effect，不能提前消费；
  // StrictMode 双跑 effect，已消费过的实例不能走 else 删除分支）
  const consumedNavRef = useRef(false);
  useEffect(() => {
    let target: string | null = null;
    try {
      target = sessionStorage.getItem('detail-nav');
    } catch {}
    if (target && target.split('?')[0] === pathname) {
      try {
        sessionStorage.removeItem('detail-nav');
      } catch {}
      consumedNavRef.current = true;
      document.documentElement.dataset.detailNav = 'true';
    } else if (!target && !consumedNavRef.current) {
      delete document.documentElement.dataset.detailNav;
    }
  }, [pathname]);

  useEffect(() => {
    const pattern = new RegExp(hrefPattern);
    const onClickCapture = (event: MouseEvent) => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const anchor = (event.target as Element).closest?.('a[href]');
      const href = anchor?.getAttribute('href') ?? '';
      if (pattern.test(href)) {
        try {
          sessionStorage.setItem('detail-nav', href);
        } catch {}
      }
    };
    document.addEventListener('click', onClickCapture, true);
    return () => document.removeEventListener('click', onClickCapture, true);
  }, [hrefPattern]);

  // 翻页目标写进 <html> dataset（paint 前就绪），常驻单例监听读它导航；
  // 卸载时清理，避免离开详情页后误导航
  useLayoutEffect(() => {
    navRouter = router;
    ensureNavListener();
    const root = document.documentElement;
    if (prevHref) root.dataset.detailPrev = prevHref;
    else delete root.dataset.detailPrev;
    if (nextHref) root.dataset.detailNext = nextHref;
    else delete root.dataset.detailNext;
    return () => {
      delete root.dataset.detailPrev;
      delete root.dataset.detailNext;
    };
  }, [router, prevHref, nextHref]);
  return null;
}
