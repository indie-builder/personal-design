export type BrowseEntry = { href: string; title: string };
type BrowseContext = { href: string; entries: BrowseEntry[] };
export type FilterableBrowseEntry = BrowseEntry & {
  category: string;
  search?: string[];
};

const filterNames = ['cat', 'q'] as const;

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
