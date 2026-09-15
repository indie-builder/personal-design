export type BrowseEntry = { href: string; title: string };
export type BrowseContext = { href: string; entries: BrowseEntry[] };
export type FilterableBrowseEntry = BrowseEntry & {
  category: string;
  theme?: string;
  search?: string[];
};

const filterNames = ['cat', 'theme', 'q'] as const;

export function matchesSearch(query: string, fields: (string | undefined)[]): boolean {
  return fields
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
    .includes(query.trim().toLocaleLowerCase());
}

/** Carry the actual filters in native links, including open-in-new-tab and history. */
export function browseHref(href: string, listHref: string): string {
  const source = new URLSearchParams(listHref.split('?')[1] ?? '');
  const params = new URLSearchParams({ browse: '2' });
  for (const name of filterNames) {
    const value = source.get(name);
    if (value) params.set(name, value);
  }
  return `${href}?${params}`;
}

/** Keep scroll/focus memories separate for each filter, without copying the catalog. */
export function browseMemoryKey(storageKey: string, listHref: string): string {
  const [path, query = ''] = listHref.split('?');
  const source = new URLSearchParams(query);
  const params = new URLSearchParams();
  for (const name of filterNames) {
    const value = source.get(name);
    if (value) params.set(name, value);
  }
  return `${storageKey}:${path}${params.size ? `?${params}` : ''}`;
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
  const requestedTheme = params.get('theme') ?? '';
  const theme = catalog.some(
    (entry) => entry.theme === requestedTheme && (!category || entry.category === category),
  )
    ? requestedTheme
    : '';
  const queryText = params.get('q') ?? '';
  const entries = catalog.filter(
    (entry) =>
      matchesSearch(queryText, [entry.title, ...(entry.search ?? [])]) &&
      (!category || entry.category === category) &&
      (!theme || entry.theme === theme),
  );
  if (!entries.some((entry) => entry.href === pathname)) return null;
  const filters = new URLSearchParams();
  if (queryText) filters.set('q', queryText);
  if (category) filters.set('cat', category);
  if (theme) filters.set('theme', theme);
  // Returning from a layout detail reopens its book at the image just viewed.
  if (listPath === '/products/layout-compositions' && category)
    filters.set('page', pathname.split('/').at(-1)!);
  return { href: `${listPath}${filters.size ? `?${filters}` : ''}`, entries };
}

/** A saved trail only applies to the product and work that created it. */
export function resolveBrowseContext(
  raw: string | null,
  listPath: string,
  pathname: string,
): BrowseContext | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    const href = saved.href ?? saved.url;
    if (typeof href !== 'string' || (href !== listPath && !href.startsWith(`${listPath}?`)))
      return null;
    if (!Array.isArray(saved.entries)) return null;
    const entries: BrowseEntry[] = saved.entries.filter(
      (entry: BrowseEntry) =>
        typeof entry?.href === 'string' &&
        entry.href.startsWith(`${listPath}/`) &&
        !entry.href.includes('?') &&
        typeof entry.title === 'string',
    );
    if (!entries.some((entry) => entry.href === pathname)) return null;
    return { href, entries };
  } catch {
    return null;
  }
}
