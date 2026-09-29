'use client';

import Link from 'next/link';
import { buttonClassName } from '../button';
import styles from './lightbox.module.css';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import {
  useLightboxController,
  EASE,
  DURATION,
  type LightboxItem,
  type OpenOptions,
} from './use-lightbox-controller';

export type { LightboxItem } from './use-lightbox-controller';

const LightboxContext = createContext<{
  open: (item: LightboxItem, options: OpenOptions) => void;
} | null>(null);

export function useLightbox() {
  return useContext(LightboxContext);
}

/** Lightbox portal and controls; useLightboxController owns state, focus, and motion. */
export function LightboxProvider({ children }: { children: ReactNode }) {
  const {
    active,
    finishClose,
    expanded,
    frame,
    reducedMotion,
    instant,
    dialogRef,
    closeButtonRef,
    closingRef,
    swipeRef,
    open,
    close,
    go,
    fullReady,
    loadError,
    attempt,
    thumbError,
    setThumbError,
    setMediaStatus,
    setNaturalRatio,
    startTransform,
    transition,
    hasSiblings,
    hasOrigin,
    swipeHandlers,
    consumeClickSuppression,
    onDialogKeyDown,
    retry,
  } = useLightboxController();

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {active && frame
        ? // portal 到 body：摆脱 transformed 祖先（detail-in 等）对 fixed 定位的污染
          createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={active.item.alt}
              tabIndex={-1}
              className={styles.surface}
              onKeyDown={onDialogKeyDown}
            >
              {/* 遮罩：毛玻璃 + 加深，明暗两种背景下都能分离层次。
             灯箱是恒定暗房表面（不随主题翻转），色值取自暗色 palette 原值而非 token */}
              <div
                aria-hidden
                className={styles.backdrop}
                style={{
                  opacity: expanded ? 1 : 0,
                  transition: reducedMotion || instant ? 'none' : `opacity ${DURATION}ms ${EASE}`,
                }}
                onClick={close}
              />

              {/* 图片 + 图注：swipe 容器（移动端滑动翻图） */}
              <div
                ref={swipeRef}
                className="absolute inset-0 touch-pan-y"
                {...swipeHandlers}
                onClick={(event) => {
                  if (consumeClickSuppression()) return;
                  if (event.target === event.currentTarget) close();
                }}
              >
                {/* thumb 打底（首屏/新图未就绪时可见） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`thumb-${active.item.src}`}
                  onError={() => setThumbError(true)}
                  src={active.item.thumb ?? active.item.src}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="absolute object-contain"
                  style={{
                    ...frame,
                    transform: expanded ? 'none' : startTransform,
                    opacity: thumbError ? 0 : expanded ? 1 : hasOrigin ? 0.99 : 0,
                    transition,
                  }}
                />
                {/* 当前高清图 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={`${active.item.src}-${attempt}`}
                  src={active.item.src}
                  alt={active.item.alt}
                  draggable={false}
                  className="absolute object-contain"
                  style={{
                    ...frame,
                    transform: expanded ? 'none' : startTransform,
                    opacity: expanded && fullReady ? 1 : 0,
                    transition,
                  }}
                  ref={(el) => {
                    // 缓存图可能在监听挂载前就加载完，onLoad 不会触发，挂载时补检
                    if (el?.complete && el.naturalWidth > 0) setMediaStatus('ready');
                  }}
                  onError={() => setMediaStatus('error')}
                  onLoad={(event) => {
                    setMediaStatus('ready');
                    if (event.currentTarget.naturalHeight)
                      setNaturalRatio(
                        event.currentTarget.naturalWidth / event.currentTarget.naturalHeight,
                      );
                  }}
                  onTransitionEnd={(event) => {
                    if (event.propertyName === 'transform' && closingRef.current) {
                      finishClose();
                    }
                  }}
                />

                {!fullReady && expanded ? (
                  <div className={styles.status} role="status">
                    <span>
                      {loadError
                        ? active.item.thumb && !thumbError
                          ? '高清图暂时无法加载，当前显示预览图。'
                          : '图片暂时无法加载。'
                        : '正在加载高清图…'}
                    </span>
                    {loadError ? (
                      <button
                        type="button"
                        className={buttonClassName({ className: styles.control })}
                        onClick={retry}
                      >
                        重新加载
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {/* 图注：编号 + 名称 + 计数 + 详情入口（移动端切换按钮并入此栏） */}
                <div
                  className={styles.caption}
                  style={{
                    left: window.innerWidth < 640 ? 16 : 72,
                    top: frame.top + frame.height + 12,
                    width: window.innerWidth - (window.innerWidth < 640 ? 32 : 144),
                    opacity: expanded ? 1 : 0,
                    transition: reducedMotion || instant ? 'none' : `opacity ${DURATION}ms ${EASE}`,
                  }}
                >
                  <p className="flex min-w-0 items-center truncate text-[#edf1f6]">
                    {hasSiblings ? (
                      <span className="mr-2 inline-flex shrink-0 gap-1 sm:hidden">
                        <button
                          type="button"
                          data-direction="previous"
                          aria-label="上一张"
                          onClick={() => go(-1)}
                          className={buttonClassName({ icon: true, className: styles.control })}
                        >
                          <ArrowLeft className="size-4" />
                        </button>
                        <button
                          type="button"
                          data-direction="next"
                          aria-label="下一张"
                          onClick={() => go(1)}
                          className={buttonClassName({ icon: true, className: styles.control })}
                        >
                          <ArrowRight className="size-4" />
                        </button>
                      </span>
                    ) : null}
                    {active.item.serial ? (
                      <span className="mr-2 shrink-0 font-mono text-xs text-[#bdbdbd]">
                        {active.item.serial}
                      </span>
                    ) : null}
                    <span className="truncate">{active.item.alt}</span>
                  </p>
                  <span className="flex shrink-0 items-center gap-3">
                    {hasSiblings ? (
                      <span className="font-mono text-xs text-[#bdbdbd]">
                        {active.index + 1} / {active.siblings.length}
                      </span>
                    ) : null}
                    {active.item.href ? (
                      <Link
                        href={active.item.href}
                        onClick={finishClose}
                        className="inline-flex items-center gap-1 text-[#c3ccd8] underline-offset-4 transition-colors hover:text-white hover:underline"
                      >
                        查看详情
                        <ArrowRight size={18} strokeWidth={1.6} aria-hidden />
                      </Link>
                    ) : null}
                  </span>
                </div>
              </div>

              {/* 关闭按钮（移动端常驻可见，触屏无 Esc；初始聚焦目标） */}
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="关闭"
                onClick={close}
                className={buttonClassName({
                  icon: true,
                  className: `${styles.control} ${styles.close}`,
                })}
              >
                <X className="size-5" />
              </button>

              {/* 同组左右切换（桌面侧翼；移动端在图注栏内） */}
              {hasSiblings ? (
                <>
                  <button
                    type="button"
                    data-direction="previous"
                    aria-label="上一张"
                    onClick={() => go(-1)}
                    className={buttonClassName({
                      icon: true,
                      className: `${styles.control} ${styles.previous}`,
                    })}
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    data-direction="next"
                    aria-label="下一张"
                    onClick={() => go(1)}
                    className={buttonClassName({
                      icon: true,
                      className: `${styles.control} ${styles.next}`,
                    })}
                  >
                    <ArrowRight className="size-5" />
                  </button>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </LightboxContext.Provider>
  );
}
