import catalog from '../catalog.json';
import layout from '../graph-layout.json';

export type GraphPoint = [number, number, number];
export type DictionaryGraphNode = {
  slug: string;
  title: string;
  section: number;
  position: GraphPoint;
  links: string[];
  degree: number;
};
export type DictionaryGraphEdge = {
  source: string;
  target: string;
  control: GraphPoint;
};

const originals = new Map(layout.nodes.map((node) => [node.title, node]));
const slugByTerm = new Map(
  catalog.entries.map((entry) => [
    entry.term,
    originals.get(entry.term)?.slug ??
      entry.term
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
  ]),
);
if (new Set(slugByTerm.values()).size !== slugByTerm.size)
  throw new Error('AI Coding 词典词条生成了重复的 URL slug');

export const graphNodes: DictionaryGraphNode[] = catalog.entries.map((entry) => {
  const original = originals.get(entry.term);
  const seed = [...entry.term].reduce((value, char) => value * 31 + char.charCodeAt(0), 0) >>> 0;
  const center = layout.sections[entry.section]?.centroid ?? [0, 0, 0];
  const position = (original?.layout ??
    center.map((value, axis) => value + Math.sin(seed + axis * 43) * 50)) as GraphPoint;
  return {
    slug: slugByTerm.get(entry.term)!,
    title: entry.term,
    section: entry.section,
    position,
    links: entry.related
      .map((term) => slugByTerm.get(term))
      .filter((slug): slug is string => !!slug),
    degree: 0,
  };
});

const bySlug = new Map(graphNodes.map((node) => [node.slug, node]));
const pair = (source: string, target: string) => [source, target].sort().join('|');
const wanted = new Map<string, [string, string]>();
for (const node of graphNodes)
  for (const target of node.links) {
    bySlug.get(target)!.degree++;
    wanted.set(pair(node.slug, target), [node.slug, target]);
  }

export const graphEdges: DictionaryGraphEdge[] = layout.edges
  .filter((edge) => wanted.has(pair(edge.source, edge.target)))
  .map((edge) => {
    wanted.delete(pair(edge.source, edge.target));
    return { source: edge.source, target: edge.target, control: edge.control as GraphPoint };
  });
for (const [source, target] of wanted.values()) {
  const a = bySlug.get(source)!.position;
  const b = bySlug.get(target)!.position;
  graphEdges.push({
    source,
    target,
    control: a.map((value, axis) => (value + b[axis]!) / 2) as GraphPoint,
  });
}
