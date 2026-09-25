import { readdir, readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'upstream');
const destination = join(root, '../../apps/web/public/ai-coding-atlas');
const catalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
const original = JSON.parse(await readFile(join(source, 'atlas.json'), 'utf8'));
const initialLocation = await readFile(join(root, 'runtime/initial-location.js'), 'utf8');
const focusSpacing = await readFile(join(root, 'runtime/focus-spacing.js'), 'utf8');
const originals = new Map(original.nodes.map((node) => [node.title, node]));
const chineseWords = new Intl.Segmenter('zh-CN', { granularity: 'word' });
function chineseSearchTerms(text) {
  const words = [...chineseWords.segment(text)]
    .filter((part) => part.isWordLike && /\p{Script=Han}/u.test(part.segment))
    .map((part) => part.segment);
  for (const [run] of text.matchAll(/\p{Script=Han}+/gu))
    for (let start = 0; start < run.length; start++)
      for (let length = 2; length <= 4 && start + length <= run.length; length++)
        words.push(run.slice(start, start + length));
  return words;
}
const slug = (term) =>
  originals.get(term)?.slug ??
  term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const names = new Set(catalog.entries.map((entry) => entry.term));
const entries = catalog.entries.map((entry) => ({
  ...entry,
  slug: slug(entry.term),
  displayAliases: originals.get(entry.term)?.aliases ?? [],
}));
if (new Set(entries.map((entry) => entry.slug)).size !== entries.length)
  throw new Error('Duplicate dictionary slugs; runtime was not regenerated');
const nodes = entries
  .map((entry, index) => {
    const old = originals.get(entry.term);
    const center = original.sections[entry.section]?.centroid ?? [0, 0, 0];
    const seed = [...entry.term].reduce((n, char) => n * 31 + char.charCodeAt(0), 0) >>> 0;
    return {
      ...old,
      slug: entry.slug,
      title: entry.term,
      section: entry.section,
      description: entry.description.en,
      body: entry.body.en.join('\n\n'),
      prose: entry.body.en.join('\n\n'),
      usage: [],
      avoid: '',
      aliases: [
        ...new Set([
          ...(old?.aliases ?? []),
          entry.description.zh,
          ...chineseSearchTerms([entry.description.zh, ...entry.body.zh].join(' ')),
        ]),
      ],
      links: entry.related.filter((term) => names.has(term)).map(slug),
      layout: old?.layout ?? center.map((value, axis) => value + Math.sin(seed + axis * 43) * 50),
      inDegree: 0,
    };
  })
  .sort(
    (a, b) =>
      (original.nodes.findIndex((node) => node.slug === a.slug) + 1 || 999) -
      (original.nodes.findIndex((node) => node.slug === b.slug) + 1 || 999),
  );
const nodeMap = new Map(nodes.map((node) => [node.slug, node]));
const pair = (a, b) => [a, b].sort().join('|');
const wanted = new Map();
for (const node of nodes)
  for (const target of node.links) {
    nodeMap.get(target).inDegree++;
    wanted.set(pair(node.slug, target), [node.slug, target]);
  }
const edges = original.edges
  .filter((edge) => wanted.has(pair(edge.source, edge.target)))
  .map((edge) => {
    wanted.delete(pair(edge.source, edge.target));
    return edge;
  });
for (const [from, to] of wanted.values()) {
  const a = nodeMap.get(from).layout,
    b = nodeMap.get(to).layout;
  edges.push({
    source: from,
    target: to,
    control: a.map((value, index) => (value + b[index]) / 2),
  });
}
const atlas = {
  generatedFrom: 'indie-builder/dictionary-of-ai-coding',
  sections: catalog.sections.map((section, index) => ({
    ...original.sections[index],
    title: section.en,
    index,
    slugs: entries.filter((entry) => entry.section === index).map((entry) => entry.slug),
    centroid: original.sections[index]?.centroid ?? [0, 0, 0],
    radius: original.sections[index]?.radius ?? 200,
  })),
  nodes,
  edges,
};
const records = [];
function replaceOne(text, needle, replacement) {
  if (text.split(needle).length !== 2)
    throw new Error('Captured runtime changed; review patch: ' + needle.slice(0, 80));
  return text.replace(needle, replacement);
}
async function copy(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const from = join(directory, entry.name),
      rel = relative(source, from),
      to = join(destination, rel);
    if (entry.isDirectory()) {
      await copy(from);
      continue;
    }
    if (['capture.json', 'atlas.json'].includes(entry.name)) continue;
    await mkdir(dirname(to), { recursive: true });
    const originalBytes = await readFile(from);
    if (/\.(js|css|html)$/.test(entry.name)) {
      let text = originalBytes.toString();
      if (entry.name === '24s8s-b_jlfxf.js') {
        const data = /t\.exports=JSON\.parse\(("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\)/;
        if (!data.test(text)) throw new Error('Atlas data module not found');
        text = text.replace(
          data,
          () => `t.exports=JSON.parse(${JSON.stringify(JSON.stringify(atlas))})`,
        );
        text = replaceOne(text, 'ready:!1,revealed:!1', 'ready:!0,revealed:!0');
        text = replaceOne(
          text,
          'e.s(["SECTION_COLOR_KEY",0,m,"useJourney",0,g],22059)',
          'window.__atlasJourney=g;e.s(["SECTION_COLOR_KEY",0,m,"useJourney",0,g],22059)',
        );
        text = replaceOne(
          text,
          'setSectionColorOn:n=>{t().sectionColorOn!==n&&e({sectionColorOn:n})}',
          'setSectionColorOn:()=>{}',
        );
        text = replaceOne(
          text,
          'toggleSectionColor:()=>{let n=!t().sectionColorOn,o=n?Math.floor(Math.random()*l.length):null;e({sectionColorOn:n,overviewSection:o}),localStorage.setItem(m,n?"1":"0")}',
          'toggleSectionColor:()=>{}',
        );
      }
      if (entry.name === '11nhf1x4-3r97.js') {
        // Remove the controls and their sound entry points, including audio loading.
        text = replaceOne(text, '(0,f.jsx)(ss,{shifted:j})', 'null');
        text = replaceOne(text, '(0,f.jsx)(sW,{shifted:j})', 'null');
        text = replaceOne(
          text,
          'function I(){if(!N){try{j="1"===localStorage.getItem(k)}catch{}try{(N=new P.default({easySetup:!1,muteOnWindowBlur:!0})).load(P.default.KITS.SND01??"01").then(()=>{M=!0}).catch(()=>{})}catch{}}}',
          'function I(){}',
        );
        text = replaceOne(
          text,
          'function A(e=1){if(!j&&M&&N)try{N.playTap({volume:e})}catch{}}',
          'function A(){}',
        );
        text = replaceOne(
          text,
          'function L(e){j=e;try{localStorage.setItem(k,e?"1":"0")}catch{}}',
          'function L(){}',
        );
      }
      if (entry.name === '10jcl7iozmh4t.js') {
        text = replaceOne(text, 'function tJ(e,t){', `${focusSpacing}\nfunction tJ(e,t){`);
        text = replaceOne(
          text,
          'tM.needsUpdate=!0}function tQ()',
          'atlasSpaceFocus(e,t,n?tC.slugToMotionIndex.get(n)??-1:-1);tM.needsUpdate=!0}function tQ()',
        );
        // Keep the original overlay/motion; its selected disk must survive foreground occlusion.
        text = replaceOne(
          text,
          'uniform float uRingR;  // ring radius',
          'uniform float uSelectedRadius;\n  uniform vec3 uPaper;\n  uniform float uRingR;  // ring radius',
        );
        text = replaceOne(
          text,
          'float a = clamp(band, 0.0, 1.0) * uOpacity;\n    if (a < 0.002) discard;\n    gl_FragColor = vec4(uColor, a);',
          `float selected = step(0.001, uSelectedRadius);
    float disk = selected * (1.0 - smoothstep(uSelectedRadius - 0.005, uSelectedRadius + 0.005, d));
    float halo = selected * (1.0 - smoothstep(uRingR - uThick, uRingR, d));
    float a = clamp(max(band, halo), 0.0, 1.0) * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(mix(uPaper, uColor, clamp(max(band, disk), 0.0, 1.0)), a);`,
        );
        text = replaceOne(
          text,
          'uRingR:{value:.8}',
          'uSelectedRadius:{value:0},uPaper:{value:new er.Color(ty.BG)},uRingR:{value:.8}',
        );
        text = replaceOne(
          text,
          'a.uniforms.uRingR.value=(g+y)/x',
          'a.uniforms.uSelectedRadius.value=n?g/x:0,a.uniforms.uRingR.value=(g+y)/x',
        );
        text = replaceOne(
          text,
          'y=1.1*(.5+.35*(1-f.current))',
          'y=(n?2.8:1.1)*(.5+.35*(1-f.current))',
        );
        text = replaceOne(
          text,
          'a.uniforms.uThick.value=.17/x',
          'a.uniforms.uThick.value=(n?.5:.17)/x',
        );
        text = replaceOne(
          text,
          's.color=A?a:i,y&&',
          's.color=A?a:i,s.fontSize=l.fontSize*(A&&c?1.15:1),s.material.depthTest=!A,s.renderOrder=A?12:10,y&&',
        );
        text = replaceOne(
          text,
          'ref:o,geometry:l,frustumCulled:!1,renderOrder:4',
          'ref:o,geometry:l,frustumCulled:!1,renderOrder:11',
        );
      }
      text = text
        .replaceAll('/_next/', '/ai-coding-atlas/_next/')
        .replaceAll('"/fonts/', '"/ai-coding-atlas/fonts/')
        .replaceAll("'/fonts/", "'/ai-coding-atlas/fonts/")
        .replaceAll(
          'https://cdn.jsdelivr.net/gh/snd-lib/snd-lib@v1.2.4/assets/sounds/sprite/01/audioSprite.mp3',
          '/ai-coding-atlas/audio/01.mp3',
        )
        .replaceAll('/ee73edb21143a49f/script.js', '/ai-coding-atlas/empty.js');
      if (entry.name === 'index.html') {
        text = text.replace(
          /<link[^>]+rel="(?:canonical|author|manifest|icon|apple-touch-icon)"[^>]*>/g,
          '',
        );
        const config = JSON.stringify({ entries }).replaceAll('<', '\\u003c');
        const injection = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; font-src 'self' data:; media-src 'self'; worker-src 'self' blob:"><link rel="stylesheet" href="/ai-coding-atlas/adapt.css"><script>window.__dictionaryCatalog=${config};${initialLocation}</script><script src="/ai-coding-atlas/bridge.js" defer></script>`;
        text = text.replace('<head>', '<head>' + injection);
      }
      await writeFile(to, text);
    } else await copyFile(from, to);
    records.push({ path: rel, sha256: createHash('sha256').update(originalBytes).digest('hex') });
  }
}
await copy(source);
for (const file of ['bridge.js', 'adapt.css'])
  await copyFile(join(root, 'runtime', file), join(destination, file));
await writeFile(
  join(destination, 'empty.js'),
  '/* External analytics are not part of this local atlas. */\n',
);
await writeFile(
  join(destination, 'runtime-manifest.json'),
  JSON.stringify(
    {
      origin: 'https://www.aicodingdictionary.com/',
      files: records,
      terms: nodes.length,
      edges: edges.length,
    },
    null,
    2,
  ) + '\n',
);
console.log(`原站运行资源已准备：${nodes.length} 词条，${edges.length} 连线`);
