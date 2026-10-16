import { useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';

/**
 * next/navigation 的最小等价层：读侧走 router state（SSR 时 pathname/search 已知），
 * 写侧沿用 window.history.*（@tanstack/history 拦截 pushState/replaceState 并通知 router，
 * URL 仍是筛选条件的唯一事实源，与 Next 的 replaceState 语义一致）。
 */

/** 对应 next/navigation 的 usePathname。 */
export function usePathname(): string {
  return useRouterState({ select: (state) => state.location.pathname });
}

/**
 * 对应 next/navigation 的 useSearchParams：以 URLSearchParams 形态暴露当前查询串，
 * 让既有的 .get/.size/.toString() 调用零改动。
 */
export function useSearchParams(): URLSearchParams {
  return useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr),
  });
}

/** 把含查询串的站内 href 拆成 TanStack 导航需要的 { to, search } 形态。 */
export function splitHref(href: string): {
  to: string;
  search: Record<string, string> | undefined;
} {
  const queryStart = href.indexOf('?');
  if (queryStart === -1) return { to: href, search: undefined };
  return {
    to: href.slice(0, queryStart),
    search: Object.fromEntries(new URLSearchParams(href.slice(queryStart + 1))),
  };
}

/** useMemo 语义包装，供需要稳定引用的调用方使用。 */
export function useSplitHref(href: string) {
  return useMemo(() => splitHref(href), [href]);
}
