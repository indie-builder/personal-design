export type BrowseEntry = { href: string; title: string };
type BrowseContext = { href: string; entries: BrowseEntry[] };
export type FilterableBrowseEntry = BrowseEntry & {
  category: string;
  search?: string[];
};

const filterNames = ['cat', 'q'] as const;
const BROWSE_WINDOW = 240;

export function windowed<T extends { href: string }>(entries: T[], currentHref: string): T[] {
  const index = entries.findIndex((entry) => entry.href === currentHref);
  // 同步后索引快照可能暂时缺少当前条目，回退也必须限制 RSC 负载。
  if (index < 0) return entries.slice(0, BROWSE_WINDOW);
  const size = BROWSE_WINDOW * 2 + 1;
  if (entries.length <= size) return entries;
  const start = Math.max(0, Math.min(index - BROWSE_WINDOW, entries.length - size));
  return entries.slice(start, start + size);
}

export function matchesSearch(query: string, fields: (string | undefined)[]): boolean {
  return fields
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

function filterParams(listHref: string, params = new URLSearchParams()) {
  const source = new URLSearchParams(listHref.split('?')[1] ?? '');
  for (const name of filterNames) {
    const value = source.get(name);
    if (value) params.set(name, value);
  }
  return params;
}

/** Carry the actual filters in native links, including open-in-new-tab and history. */
export function browseHref(href: string, listHref: string): string {
  return `${href}?${filterParams(listHref, new URLSearchParams({ browse: '2' }))}`;
}

/** Keep scroll/focus memories separate for each filter, without copying the catalog. */
export function browseMemoryKey(storageKey: string, listHref: string): string {
  const params = filterParams(listHref);
  return `${storageKey}:${listHref.split('?')[0]}${params.size ? `?${params}` : ''}`;
}

/** Resolve shareable trails from current data, independently of session storage. */
export function resolveUrlBrowseContext(
  query: string,
  listPath: string,
  pathname: string,
  catalog: FilterableBrowseEntry[],
): BrowseContext | null {
  const params = new URLSearchParams(query);
  if (params.get('browse') !== '2') return null;
  const requestedCat = params.get('cat') ?? '';
  const category = catalog.some((entry) => entry.category === requestedCat) ? requestedCat : '';
  const queryText = params.get('q') ?? '';
  const entries = catalog.filter(
    (entry) =>
      matchesSearch(queryText, [entry.title, ...(entry.search ?? [])]) &&
      (!category || entry.category === category),
  );
  if (!entries.some((entry) => entry.href === pathname)) return null;
  const filters = new URLSearchParams();
  if (queryText) filters.set('q', queryText);
  if (category) filters.set('cat', category);
  return { href: `${listPath}${filters.size ? `?${filters}` : ''}`, entries };
}
