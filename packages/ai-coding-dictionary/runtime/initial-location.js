(() => {
  if (window.parent === window) return;
  const parentParams = new URLSearchParams(parent.location.search);
  const requested = parentParams.get('term');
  const entry = window.__dictionaryCatalog.entries.find(item => item.slug === requested || item.term === requested);
  const params = new URLSearchParams();
  if (entry) params.set('term', entry.slug);
  const query = (parentParams.get('q') ?? '').slice(0, 2000);
  if (query) params.set('q', query);
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
})();
