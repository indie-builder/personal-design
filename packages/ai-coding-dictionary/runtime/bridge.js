/* Integration only: the captured atlas owns all rendering, motion and graph interactions. */
(() => {
  const catalog = window.__dictionaryCatalog;
  const byTitle = new Map(catalog.entries.map(entry => [entry.term, entry]));
  const bySlug = new Map(catalog.entries.map(entry => [entry.slug, entry]));
  let queued = false;
  function decorate() {
    queued = false;
    for (const slide of document.querySelectorAll('[class*="node-detail-module"][class*="__content"]')) {
      const entry = byTitle.get(slide.querySelector('h2')?.textContent.trim());
      if (!entry || slide.dataset.bilingual === entry.slug) continue;
      slide.querySelectorAll('.atlas-chinese-definition,.atlas-chinese-body').forEach(node => node.remove());
      slide.dataset.bilingual = entry.slug;
      const aliases = slide.querySelector('p[class*="__aliases"]');
      if (aliases) {
        aliases.textContent = entry.displayAliases.join(' · ');
        aliases.hidden = !entry.displayAliases.length;
      }
      const definition = slide.querySelector('p[class*="__def"]');
      if (definition) {
        const chinese = document.createElement('p');
        chinese.className = `${definition.className} atlas-chinese-definition`;
        chinese.lang = 'zh-CN'; chinese.textContent = entry.description.zh;
        definition.before(chinese); definition.lang = 'en';
      }
      const firstBlock = slide.querySelector('section[class*="__block"]');
      if (firstBlock) {
        const block = document.createElement('section');
        block.className = `${firstBlock.className} atlas-chinese-body`;
        block.lang = 'zh-CN';
        const label = document.createElement('h3'); label.textContent = '中文解读'; block.append(label);
        for (const paragraph of entry.body.zh) { const p = document.createElement('p'); p.textContent = paragraph; block.append(p); }
        firstBlock.before(block);
      }
    }
    for (const link of document.querySelectorAll('a[href^="http"]')) {
      if (!link.closest('[class*="__prose"]')) link.hidden = true;
      link.removeAttribute('href'); link.removeAttribute('target'); link.removeAttribute('rel');
    }
    const input = document.querySelector('#atlas-search');
    if (input && input.placeholder !== '搜索术语或中文解释') { input.placeholder = '搜索术语或中文解释'; input.setAttribute('aria-label', '搜索词典'); }
    const close = document.querySelector('aside > button');
    if (close && close.getAttribute('aria-label') !== '关闭词条') close.setAttribute('aria-label', '关闭词条');
  }
  const observer = new MutationObserver(() => { if (!queued) { queued = true; queueMicrotask(decorate); } });
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  decorate();
  const notify = (state) => {
    if (window.parent === window) return;
    window.parent.postMessage({ type: 'dictionary-state', term: state.focusedSlug, q: state.query }, location.origin);
  };
  const connect = () => {
    const journey = window.__atlasJourney;
    if (!journey) { setTimeout(connect, 50); return; }
    document.documentElement.dataset.atlasReady = 'true';
    journey.subscribe((state, previous) => {
      if (state.focusedSlug !== previous.focusedSlug || state.query !== previous.query) notify(state);
    });
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'dictionary-focus') return;
      const term = event.data.term;
      if (term === null || bySlug.has(term)) journey.getState().focusNode(term);
    });
  };
  connect();
})();
