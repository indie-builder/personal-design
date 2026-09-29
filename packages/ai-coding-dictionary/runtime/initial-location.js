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
  let renderer;
  let visible = !window.frameElement;
  let unsubscribe;
  const listeners = new Set();
  // Keep the original renderer: only continuous animation needs a continuous frame loop.
  const repaint = () => {
    if (renderer && visible && !document.hidden) renderer.invalidate(3);
  };
  const renderPolicy = () => {
    for (const listener of listeners) listener();
    if (!renderer) return;
    const mode = window.__atlasRenderPolicy.getSnapshot();
    if (renderer.get().frameloop !== mode) {
      const elapsed = renderer.clock.elapsedTime;
      renderer.setFrameloop(mode);
      renderer.clock.elapsedTime = elapsed;
    }
    repaint();
  };
  window.__atlasRenderPolicy = {
    getSnapshot: () => !visible || document.hidden ? 'never' : window.__atlasInstant ? 'demand' : 'always',
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attach: (state) => {
      renderer = state;
      unsubscribe?.();
      unsubscribe = window.__atlasJourney.subscribe(repaint);
      renderPolicy();
    },
  };
  const visibility = new parent.IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    renderPolicy();
  });
  if (window.frameElement) visibility.observe(window.frameElement);
  document.addEventListener('visibilitychange', renderPolicy);
  for (const event of ['pointermove', 'pointerdown', 'pointerup', 'wheel'])
    addEventListener(event, repaint, { passive: true });
  const apply = () => {
    document.documentElement.dataset.theme = host.dataset.theme ?? 'light';
    document.documentElement.dataset.input = host.dataset.input ?? 'pointer';
    const style = getComputedStyle(host);
    window.__atlasTheme = {
      ink: style.getPropertyValue('--color-ink').trim() || '#202020',
      paper: style.getPropertyValue('--color-paper').trim() || '#ffffff',
    };
    window.__atlasInstant = reduced.matches || host.dataset.input === 'keyboard';
    renderPolicy();
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
      visibility.disconnect();
      unsubscribe?.();
      document.removeEventListener('visibilitychange', renderPolicy);
      reduced.removeEventListener('change', apply);
    },
    { once: true },
  );
  apply();
})();
