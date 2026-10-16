import { useRouterState } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { FileRouteTypes } from '../src/routeTree.gen';

/**
 * TanStack Router 全局读取助手：跨路由读取当前 pathname/search 的统一入口，
 * 三个 hook 都是 useRouterState 的薄包装（官方推荐的跨路由全局读取形态）。
 * 读侧走 router state（SSR 时 pathname/search 已知），写侧沿用 window.history.*
 * （@tanstack/history 拦截 pushState/replaceState 并通知 router，
 * URL 仍是筛选条件的唯一事实源）。
 */

/** 站内可导航路径，取自 routeTree 编译期产物：写错即编译红（typed route 的核心收益）。 */
export type SitePath = FileRouteTypes['to'];

/** 当前路径名。 */
export function usePathname(): string {
  return useRouterState({ select: (state) => state.location.pathname });
}

/**
 * 当前查询串，以 URLSearchParams 形态暴露，
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
