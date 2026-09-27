/* The original runtime owns the graph; this document owns the bilingual reading panel. */
(() => {
  if (window.__atlasPreview) {
    const startPreview = () => {
      if (!window.__atlasJourney) {
        setTimeout(startPreview, 50);
        return;
      }
      window.__atlasJourney.getState().focusNode('agent');
    };
    startPreview();
    return;
  }
  const catalog = window.__dictionaryCatalog;
  const entries = catalog.entries;
  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const byTitle = new Map(entries.map((entry) => [entry.term, entry]));
  const panel = element('aside', 'dictionary-detail');
  panel.setAttribute('aria-labelledby', 'dictionary-title');
  panel.dataset.open = 'false';
  panel.inert = true;
  document.body.append(panel);
  let currentSlug = null;
  let renderKey = null;
  let journey;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.6');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute(
      'd',
      kind === 'close'
        ? 'M6 6l12 12M18 6 6 18'
        : kind === 'previous'
          ? 'm14 6-6 6 6 6'
          : 'm10 6 6 6-6 6',
    );
    svg.append(path);
    return svg;
  }
  function close() {
    journey.getState().focusNode(null);
  }
  function navigate(entry) {
    const state = journey.getState();
    if (state.searchActive && !state.matchSlugs.includes(entry.slug)) state.resetSearch();
    state.focusNode(entry.slug);
  }
  function termLink(entry, className) {
    const link = element('a', className);
    const url = new URL(parent === window ? location.href : parent.location.href);
    url.searchParams.set('term', entry.slug);
    if (journey.getState().searchActive && !journey.getState().matchSlugs.includes(entry.slug))
      url.searchParams.delete('q');
    link.href = url.href;
    link.target = '_parent';
    link.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      navigate(entry);
    });
    return link;
  }
  function section(id, title, language) {
    const node = element('section', 'dictionary-section');
    node.id = id;
    if (language) node.lang = language;
    const heading = element('h3', '', title);
    heading.lang = 'zh-CN';
    node.append(heading);
    return node;
  }
  function appendParagraph(container, text, language) {
    const lines = text.trim().split('\n');
    if (lines.length > 2 && lines[0].startsWith('|') && /^\|[\s:|\-]+\|$/.test(lines[1])) {
      const wrap = element('div', 'dictionary-table');
      const table = element('table');
      const cells = (line) =>
        line
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => cell.trim());
      const head = element('thead'),
        body = element('tbody'),
        row = element('tr');
      for (const value of cells(lines[0])) {
        const cell = element('th', '', value);
        cell.scope = 'col';
        row.append(cell);
      }
      head.append(row);
      for (const line of lines.slice(2)) {
        const row = element('tr');
        for (const value of cells(line)) row.append(element('td', '', value));
        body.append(row);
      }
      table.append(head, body);
      wrap.append(table);
      container.append(wrap);
    } else if (/^Usage:?$/.test(text.trim()) || /^用法[:：]?$/.test(text.trim()))
      container.append(element('h4', 'dictionary-usage', language === 'zh-CN' ? '用法' : 'Usage'));
    else container.append(element('p', '', text));
  }
  function render(state) {
    const entry = bySlug.get(state.focusedSlug);
    if (!entry) {
      const restoreFocus = currentSlug && !document.activeElement?.matches('input,textarea,select');
      panel.dataset.open = 'false';
      panel.inert = true;
      currentSlug = null;
      renderKey = null;
      // The upstream search handler also closes on Escape: cover every close path here.
      if (restoreFocus)
        queueMicrotask(() => {
          if (!journey.getState().focusedSlug)
            document
              .querySelector('button[class*="atlas-search-module"][class*="__iconBtn"]')
              ?.focus({ preventScroll: true });
        });
      return;
    }
    const nextKey = entry.slug + ':' + (state.searchActive ? state.matchSlugs.join(',') : '');
    if (renderKey === nextKey) return;
    const termChanged = currentSlug !== entry.slug;
    const scrollTop = termChanged
      ? 0
      : (panel.querySelector('.dictionary-reading')?.scrollTop ?? 0);
    renderKey = nextKey;
    currentSlug = entry.slug;
    panel.inert = false;
    panel.dataset.open = 'true';
    panel.dataset.term = entry.slug;
    const header = element('header', 'dictionary-header');
    const title = element('h2', '', entry.term);
    title.id = 'dictionary-title';
    title.tabIndex = -1;
    const dismiss = element('button', 'dictionary-close');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', '关闭词条');
    dismiss.title = '关闭词条（Esc）';
    dismiss.append(icon('close'));
    dismiss.addEventListener('click', close);
    header.append(title, dismiss);
    const content = element('div', 'dictionary-reading');
    const category = element('p', 'dictionary-category', catalog.sections[entry.section].zh);
    category.style.setProperty('--chapter-color', catalog.palette[entry.section]);
    const introduction = element('section', 'dictionary-introduction');
    introduction.setAttribute('aria-label', '中英释义');
    const chinese = element('p', 'dictionary-definition', entry.description.zh);
    chinese.lang = 'zh-CN';
    const english = element('p', 'dictionary-definition-en', entry.description.en);
    english.lang = 'en';
    introduction.append(chinese, english);
    const jump = element('nav', 'dictionary-jump');
    jump.setAttribute('aria-label', '词条内容导航');
    for (const [id, text] of [
      ['dictionary-full', '中英全文'],
      ['dictionary-related', '关联术语'],
    ]) {
      const link = element('a', '', text);
      link.href = '#' + id;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        if (id === 'dictionary-related') panel.querySelector('#dictionary-related').open = true;
        panel.querySelector('#' + id)?.scrollIntoView({
          behavior: window.__atlasInstant ? 'instant' : 'smooth',
          block: 'start',
        });
      });
      jump.append(link);
    }
    const full = section('dictionary-full', '中英全文');
    for (const [index, paragraph] of entry.body.en.entries()) {
      const pair = element('div', 'dictionary-pair');
      const chinese = element('div', 'dictionary-pair-zh');
      chinese.lang = 'zh-CN';
      appendParagraph(chinese, entry.body.zh[index] ?? '这段中文译文暂不可用。', 'zh-CN');
      const english = element('div', 'dictionary-pair-en');
      english.lang = 'en';
      appendParagraph(english, paragraph, 'en');
      pair.append(chinese, english);
      full.append(pair);
    }
    const related = element('details', 'dictionary-related');
    related.id = 'dictionary-related';
    const relatedEntries = entry.related.map((term) => byTitle.get(term)).filter(Boolean);
    const relatedSummary = element('summary', 'dictionary-related-summary');
    relatedSummary.append(
      element('span', '', '关联术语'),
      element('span', 'dictionary-related-count', String(relatedEntries.length)),
    );
    related.append(relatedSummary);
    const relatedContent = element('div', 'dictionary-related-content');
    for (const [index, category] of catalog.sections.entries()) {
      const group = relatedEntries.filter((item) => item.section === index);
      if (!group.length) continue;
      const directory = element('div', 'dictionary-directory');
      const heading = element('h4', '', category.zh);
      heading.style.setProperty('--chapter-color', catalog.palette[index]);
      const list = element('ul');
      for (const item of group) {
        const row = element('li'),
          link = termLink(item, 'dictionary-term');
        link.textContent = item.term;
        row.append(link);
        list.append(row);
      }
      directory.append(heading, list);
      relatedContent.append(directory);
    }
    if (!relatedEntries.length)
      relatedContent.append(element('p', 'dictionary-muted', '这个词条暂无关联术语。'));
    related.append(relatedContent);
    content.append(category, introduction, jump, full, related);
    const footer = element('nav', 'dictionary-pagination');
    footer.setAttribute('aria-label', '相邻词条');
    const sequence =
      state.searchActive && state.matchSlugs.includes(entry.slug)
        ? entries.filter((item) => state.matchSlugs.includes(item.slug))
        : entries;
    const index = sequence.indexOf(entry);
    for (const [offset, label, direction] of [
      [-1, '上一个', 'previous'],
      [1, '下一个', 'next'],
    ]) {
      const next = sequence[index + offset];
      const control = next
        ? termLink(next, 'dictionary-neighbor')
        : element('button', 'dictionary-neighbor');
      if (!next) {
        control.type = 'button';
        control.disabled = true;
      }
      control.dataset.direction = direction;
      const words = element('span');
      words.append(element('span', 'dictionary-neighbor-label', label));
      words.append(
        element(
          'span',
          'dictionary-neighbor-name',
          next?.term ?? (offset < 0 ? '已经是第一条' : '已经是最后一条'),
        ),
      );
      control.append(icon(direction), words);
      footer.append(control);
    }
    panel.replaceChildren(header, content, footer);
    content.scrollTop = scrollTop;
    if (termChanged && window.__atlasInstant) title.focus({ preventScroll: true });
  }
  let queued = false;
  function decorate() {
    queued = false;
    const input = document.querySelector('#atlas-search');
    if (input && input.placeholder !== '搜索术语或中文解释') {
      input.placeholder = '搜索术语或中文解释';
      input.setAttribute('aria-label', '搜索词典');
    }
    for (const link of document.querySelectorAll('a[href^="http"]')) {
      if (panel.contains(link)) continue;
      link.hidden = true;
      link.removeAttribute('href');
      link.removeAttribute('target');
    }
  }
  new MutationObserver(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(decorate);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  const notify = (state) => {
    if (parent !== window)
      parent.postMessage(
        { type: 'dictionary-state', term: state.focusedSlug, q: state.query },
        location.origin,
      );
  };
  function connect() {
    journey = window.__atlasJourney;
    if (!journey) {
      setTimeout(connect, 50);
      return;
    }
    document.documentElement.dataset.atlasReady = 'true';
    journey.subscribe((state, previous) => {
      if (state.focusedSlug !== previous.focusedSlug || state.matchSlugs !== previous.matchSlugs)
        render(state);
      if (state.focusedSlug !== previous.focusedSlug || state.query !== previous.query)
        notify(state);
    });
    const initial = new URLSearchParams(location.search).get('term');
    if (initial && bySlug.has(initial) && !journey.getState().focusedSlug)
      journey.getState().focusNode(initial);
    render(journey.getState());
    addEventListener('message', (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== parent ||
        event.data?.type !== 'dictionary-focus'
      )
        return;
      if (event.data.term === null || bySlug.has(event.data.term))
        journey.getState().focusNode(event.data.term);
    });
    addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && currentSlug && !event.target.closest('input,textarea,select')) {
        event.preventDefault();
        close();
      }
    });
    decorate();
  }
  connect();
})();
