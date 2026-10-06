'use client';

import Link from 'next/link';
import { TaichiAvatar } from './taichi-avatar';
import { ArrowLeft } from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { instantMotion, observeMotionPolicy, playExit } from '@/lib/motion';
import { products } from '@/lib/products';
import { ThemeToggle } from './theme-toggle';
import styles from './workspace-shell.module.css';

type BackAction = { label: string; onBack: () => void };
const WorkspaceBackContext = createContext<Dispatch<SetStateAction<BackAction | null>> | null>(
  null,
);
const WorkspaceNavigationContext = createContext<
  ((href: string, scroll?: boolean, direction?: string) => boolean | void) | null
>(null);

/** Keep Next's native link behavior (prefetch, modifier clicks, drag cancellation). */
export function WorkspaceLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate'> & { href: string }) {
  const navigate = useContext(WorkspaceNavigationContext);
  const direction = (props as Record<string, unknown>)['data-direction'] as string | undefined;
  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        if (navigate?.(href, props.scroll, direction)) event.preventDefault();
      }}
    />
  );
}

/** Reading surfaces replace the home exit with their immediate parent. */
export function WorkspaceBack({ label, onBack }: BackAction) {
  const setBack = useContext(WorkspaceBackContext);
  useEffect(() => {
    setBack?.({ label, onBack });
    return () => setBack?.(null);
  }, [setBack, label, onBack]);
  return null;
}

/** 首页就是产品菜单；内页仅提供回到首页的出口，不重复产品导航。 */
export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const shell = useRef<HTMLDivElement>(null);
  const navigation = useRef<{
    destination: string;
    productHref: string;
    sibling: boolean;
    direction?: string;
    floating: HTMLElement | null;
    target: HTMLElement | null;
    animations: Animation[];
    exit: ReturnType<typeof playExit> | null;
    cleanup: () => void;
  } | null>(null);
  const [back, setBack] = useState<BackAction | null>(null);
  const isHome = pathname === '/';
  const currentProduct = products.find(
    (product) => pathname === product.href || pathname.startsWith(`${product.href}/`),
  );
  const title = currentProduct?.name ?? '作品时间轴';
  const isChat = currentProduct?.slug === 'ai-chat';
  const isLanding = isHome || pathname === currentProduct?.href;

  function navigate(href: string, scroll?: boolean, direction?: string) {
    const destination = href.split('?')[0]!;
    if (navigation.current?.exit && navigation.current.destination === destination) return true;
    navigation.current?.cleanup();
    const productHref = isHome ? href : currentProduct?.href;
    const returning = !isHome && (destination === '/' || destination === currentProduct?.href);
    // 同产品详情→详情（上一件／下一件）与返回列表共用成对过渡；产品标题不变，跳过飞行标题。
    const sibling =
      !isHome &&
      !returning &&
      !!currentProduct &&
      destination.startsWith(`${currentProduct.href}/`);
    if (
      destination === pathname ||
      !productHref ||
      !(isHome || returning || sibling) ||
      !products.some((product) => product.href === productHref) ||
      instantMotion()
    )
      return;

    const surface = shell.current!;
    surface.dataset.routeMotion = 'true';

    const source = sibling
      ? null
      : shell.current?.querySelector<HTMLElement>(
          isHome ? `a[href="${productHref}"] h2` : '[data-workspace-title]',
        );
    const floating = source?.cloneNode(true) as HTMLElement | undefined;
    if (source && floating) {
      const rect = source.getBoundingClientRect();
      const style = getComputedStyle(source);
      floating.removeAttribute('data-workspace-title');
      floating.setAttribute('aria-hidden', 'true');
      floating.className = styles.travelTitle ?? '';
      Object.assign(floating.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        color: style.color,
      });
      shell.current?.append(floating);
      source.style.visibility = 'hidden';
    }
    let cleaned = false;
    const pending = {
      destination,
      productHref,
      sibling,
      direction,
      floating: floating ?? null,
      target: null as HTMLElement | null,
      animations: [] as Animation[],
      exit: null as ReturnType<typeof playExit> | null,
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        pending.exit?.cancel();
        pending.animations.forEach((animation) => animation.cancel());
        floating?.remove();
        source?.style.removeProperty('visibility');
        pending.target?.style.removeProperty('visibility');
        delete surface.dataset.routeMotion;
        if (navigation.current === pending) navigation.current = null;
      },
    };
    // Restore the real content if the target route fails to commit.
    const timer = setTimeout(pending.cleanup, 8000);
    navigation.current = pending;
    if (returning || sibling) {
      router.prefetch(href);
      pending.exit = playExit(
        shell.current?.querySelector('#workspace-content') ?? null,
        () => router.push(href, { scroll }),
        sibling && direction === 'next'
          ? [
              { opacity: 1, transform: 'none' },
              { opacity: 0, transform: 'translateX(-28px) scale(.98)' },
            ]
          : undefined,
        { hold: true },
      );
      return true;
    }
  }

  useLayoutEffect(() => {
    const pending = navigation.current;
    if (!pending) return;
    if (pathname !== pending.destination || instantMotion()) {
      pending.cleanup();
      return;
    }
    pending.exit?.cancel();
    const target = shell.current?.querySelector<HTMLElement>(
      pathname === '/' ? `a[href="${pending.productHref}"] h2` : '[data-workspace-title]',
    );
    const floating = pending.floating;
    const from = floating?.getBoundingClientRect();
    const to = target?.getBoundingClientRect();
    // 相邻导航按行进方向进入：上一件自左、下一件自右；返回沿用产品进入方向。
    let distance = 28;
    if ((pending.sibling && pending.direction === 'previous') || pathname === '/') distance = -28;
    const contentAnimation = shell.current?.querySelector('#workspace-content')?.animate(
      [
        { opacity: 0.15, transform: `translateX(${distance}px) scale(.985)` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 360, easing: 'cubic-bezier(.23,1,.32,1)' },
    );
    if (contentAnimation) pending.animations.push(contentAnimation);
    if (pending.sibling) {
      // 同产品切换标题不动，内容独自接续；后台标签页不驱动 finished，用超时兜底。
      const timeout = setTimeout(pending.cleanup, 500);
      void contentAnimation?.finished
        .then(pending.cleanup, pending.cleanup)
        .finally(() => clearTimeout(timeout));
      return;
    }
    if (!target || !floating || !from || !to) {
      pending.cleanup();
      return;
    }
    if (!from.width || !from.height || to.right < 0 || to.left > innerWidth) {
      pending.cleanup();
      return;
    }
    pending.target = target;
    target.style.visibility = 'hidden';
    const animation = floating.animate(
      [
        { transform: 'none' },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`,
        },
      ],
      { duration: 360, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' },
    );
    pending.animations.push(animation);
    // Hidden tabs can suspend animation timelines; never leave the real heading hidden.
    const timeout = setTimeout(() => {
      animation.cancel();
      pending.cleanup();
    }, 500);
    void animation.finished
      .then(pending.cleanup, pending.cleanup)
      .finally(() => clearTimeout(timeout));
  }, [pathname]);

  useEffect(() => () => navigation.current?.cleanup(), []);
  useEffect(
    () =>
      observeMotionPolicy(() => {
        if (instantMotion() || document.hidden) {
          navigation.current?.exit?.finish();
          navigation.current?.cleanup();
        }
      }),
    [],
  );
  useEffect(() => {
    const keyboard = () => {
      if (document.documentElement.dataset.input !== 'keyboard')
        document.documentElement.dataset.input = 'keyboard';
    };
    const pointer = () => {
      if (document.documentElement.dataset.input !== 'pointer')
        document.documentElement.dataset.input = 'pointer';
    };
    window.addEventListener('keydown', keyboard, true);
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('pointermove', pointer, { passive: true });
    return () => {
      window.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('pointermove', pointer);
    };
  }, []);
  return (
    <WorkspaceNavigationContext.Provider value={navigate}>
      <WorkspaceBackContext.Provider value={setBack}>
        <div ref={shell} className={`${styles.shell} ${isChat ? styles.chatShell : ''}`}>
          <a href="#workspace-content" className={styles.skip}>
            跳至内容
          </a>
          <header
            className={`${styles.header} ${isHome ? '' : styles.innerHeader} ${currentProduct?.slug === 'ai-coding-dictionary' ? styles.canvasHeader : ''} ${isChat ? styles.chatHeader : ''}`}
          >
            <div className={styles.identity}>
              {isHome && <TaichiAvatar />}
              {back ? (
                <h1 className={styles.heading}>
                  <button
                    type="button"
                    className={styles.brand}
                    onClick={back.onBack}
                    aria-label={back.label}
                    title={back.label}
                  >
                    <ArrowLeft
                      className={styles.backIcon}
                      size={18}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span>{title}</span>
                  </button>
                </h1>
              ) : (
                <WorkspaceLink
                  href="/"
                  className={styles.brand}
                  title={isHome ? undefined : '返回首页'}
                  aria-label={isHome ? '作品时间轴首页' : `${title}，返回首页`}
                >
                  {!isHome && (
                    <ArrowLeft
                      className={styles.backIcon}
                      size={18}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  )}
                  {isLanding ? (
                    <h1 data-workspace-title>{title}</h1>
                  ) : (
                    <span data-workspace-title>{title}</span>
                  )}
                </WorkspaceLink>
              )}
            </div>
            <ThemeToggle hidden={isChat} />
          </header>
          <div id="workspace-content" tabIndex={-1} className={styles.content}>
            {children}
          </div>
        </div>
      </WorkspaceBackContext.Provider>
    </WorkspaceNavigationContext.Provider>
  );
}
