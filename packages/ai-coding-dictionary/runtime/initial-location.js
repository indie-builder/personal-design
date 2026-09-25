(() => {
  if (new URLSearchParams(location.search).get('preview') === '1') {
    window.__atlasPreview = true;
    document.documentElement.dataset.preview = 'true';
    return;
  }
  if (window.parent === window) return;
  const parentParams = new URLSearchParams(parent.location.search);
  const requested = parentParams.get('term');
  const entry = window.__dictionaryCatalog.entries.find(
    (item) => item.slug === requested || item.term === requested,
  );
  const params = new URLSearchParams();
  if (entry) params.set('term', entry.slug);
  const query = (parentParams.get('q') ?? '').slice(0, 2000);
  if (query) params.set('q', query);
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
})();

// Follow the host's existing theme and input policy, including changes while the atlas is open.
(() => {
  const host = parent === window ? document.documentElement : parent.document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const apply = () => {
    document.documentElement.dataset.theme = host.dataset.theme ?? 'light';
    document.documentElement.dataset.input = host.dataset.input ?? 'pointer';
    const style = getComputedStyle(host);
    window.__atlasTheme = {
      ink: style.getPropertyValue('--color-ink').trim() || '#202020',
      paper: style.getPropertyValue('--color-paper').trim() || '#ffffff',
    };
    window.__atlasInstant = reduced.matches || host.dataset.input === 'keyboard';
  };
  const observer = new MutationObserver(apply);
  if (host !== document.documentElement)
    observer.observe(host, { attributes: true, attributeFilter: ['data-theme', 'data-input'] });
  for (const [event, input] of [
    ['keydown', 'keyboard'],
    ['pointerdown', 'pointer'],
    ['pointermove', 'pointer'],
  ])
    addEventListener(
      event,
      () => {
        if (host.dataset.input !== input) {
          host.dataset.input = input;
          apply();
        }
      },
      true,
    );
  reduced.addEventListener('change', apply);
  addEventListener(
    'pagehide',
    () => {
      observer.disconnect();
      reduced.removeEventListener('change', apply);
    },
    { once: true },
  );
  apply();
})();
