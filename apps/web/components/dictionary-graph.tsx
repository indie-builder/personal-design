'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DictionaryGraphEdge,
  DictionaryGraphNode,
} from '@personal-design/ai-coding-dictionary/graph';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';

export const CHAPTER_COLORS = [
  '#bdced9',
  '#c7d6c1',
  '#e2d3be',
  '#e2cbd0',
  '#d6cee5',
  '#bfdad3',
  '#ded8bd',
];

type Point = { x: number; y: number; r: number; font: number; title: string; section: number };
type Props = {
  nodes: DictionaryGraphNode[];
  edges: DictionaryGraphEdge[];
  selected: string | null;
  matches?: string[] | null;
  preview?: boolean;
  onSelect?: (slug: string | null) => void;
};

const project = ([x, y, z]: [number, number, number]) => ({
  x: -x + 1.2 * z,
  y: -y + 0.14 * (x + z),
});
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function overlap(a: Point, b: Point) {
  if (distance(a, b) < a.r + b.r + 7) return true;
  const ax = a.x,
    ay = a.y - a.r - a.font,
    bx = b.x,
    by = b.y - b.r - b.font;
  const aw = a.title.length * a.font * 0.3 + 5,
    bw = b.title.length * b.font * 0.3 + 5;
  return (
    (Math.abs(ax - bx) < aw + bw && Math.abs(ay - by) < (a.font + b.font) * 0.6 + 4) ||
    (Math.abs(ax - b.x) < aw + b.r && Math.abs(ay - b.y) < a.font * 0.6 + b.r) ||
    (Math.abs(bx - a.x) < bw + a.r && Math.abs(by - a.y) < b.font * 0.6 + a.r)
  );
}

function positions(
  nodes: DictionaryGraphNode[],
  width: number,
  height: number,
  selected: string | null,
  preview: boolean,
  zoom: number,
  pan: { x: number; y: number },
) {
  const focus = nodes.find((node) => node.slug === selected);
  const origin = focus ? project(focus.position) : { x: 0, y: 0 };
  const scale = Math.min(width / (preview ? 520 : 430), height / (preview ? 350 : 360)) * zoom;
  const center = { x: width * (preview ? 0.5 : 0.49) + pan.x, y: height * 0.5 + pan.y };
  const related = new Set(focus?.links ?? []);
  const targets = new Map<string, Point>();
  for (const node of nodes) {
    const projected = project(node.position);
    const prominence = Math.sqrt(Math.max(1, node.degree));
    targets.set(node.slug, {
      x: center.x + (projected.x - origin.x) * scale,
      y: center.y + (projected.y - origin.y) * scale,
      r: (preview ? 2 : 8) + prominence * (preview ? 1.45 : 4.25),
      font: preview ? 0 : node.slug === selected ? 18 : Math.min(17, 10 + prominence * 0.8),
      title: node.title,
      section: node.section,
    });
  }
  if (!focus || preview) return targets;
  const centerPoint = targets.get(focus.slug)!;
  const ordered = [...nodes].sort(
    (a, b) =>
      Number(b.slug === selected) - Number(a.slug === selected) ||
      Number(related.has(b.slug)) - Number(related.has(a.slug)) ||
      distance(targets.get(a.slug)!, centerPoint) - distance(targets.get(b.slug)!, centerPoint),
  );
  const placed: Point[] = [];
  for (const node of ordered) {
    const point = targets.get(node.slug)!;
    if (node.slug !== selected) {
      const dx = point.x - centerPoint.x,
        dy = point.y - centerPoint.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length,
        uy = dy / length;
      let radius = length;
      // Preserve each original ray; only move outward until disks and readable labels clear.
      for (let attempt = 0; attempt < 100; attempt++) {
        point.x = centerPoint.x + ux * radius;
        point.y = centerPoint.y + uy * radius;
        if (!placed.some((other) => overlap(point, other))) break;
        radius += 5;
      }
    }
    placed.push(point);
  }
  return targets;
}

export function DictionaryGraph({
  nodes,
  edges,
  selected,
  matches,
  preview = false,
  onSelect,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const current = useRef(new Map<string, Point>());
  const targets = useRef(new Map<string, Point>());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pointer = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const bySlug = useMemo(() => new Map(nodes.map((node) => [node.slug, node])), [nodes]);
  const visualFocus = selected ?? 'agent';
  const related = useMemo(
    () => new Set(bySlug.get(visualFocus)?.links ?? []),
    [bySlug, visualFocus],
  );
  const matched = useMemo(() => (matches ? new Set(matches) : null), [matches]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const box = element.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!size.width || !size.height) return;
    targets.current = positions(nodes, size.width, size.height, selected, preview, zoom, pan);
  }, [nodes, size, selected, preview, zoom, pan]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || !size.width || !size.height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    element.width = Math.round(size.width * ratio);
    element.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    let frame = 0,
      last = 0,
      running = false;
    const draw = (time: number) => {
      const delta = last ? Math.min(time - last, 50) : 16;
      last = time;
      const instant = instantMotion();
      const ease = instant ? 1 : 1 - Math.exp(-delta / 190);
      const style = getComputedStyle(document.documentElement);
      const ink = style.getPropertyValue('--color-ink').trim() || '#202020';
      const muted = style.getPropertyValue('--color-ink-soft').trim() || '#5c5c5c';
      const dark = document.documentElement.dataset.theme === 'dark';
      const points = current.current;
      for (const node of nodes) {
        const target = targets.current.get(node.slug);
        if (!target) continue;
        const point = points.get(node.slug);
        if (!point) points.set(node.slug, { ...target });
        else {
          point.x += (target.x - point.x) * ease;
          point.y += (target.y - point.y) * ease;
          point.r += (target.r - point.r) * ease;
          point.font = target.font;
          point.title = target.title;
          point.section = target.section;
        }
      }
      context.clearRect(0, 0, size.width, size.height);
      const display =
        preview && !instant
          ? new Map(
              nodes.map((node, index) => {
                const point = points.get(node.slug)!;
                return [
                  node.slug,
                  {
                    ...point,
                    x: point.x + Math.sin(time / 1800 + index * 0.7) * 2,
                    y: point.y + Math.cos(time / 2100 + index * 0.6) * 2,
                  },
                ] as const;
              }),
            )
          : points;
      context.lineWidth = preview ? 0.65 : 0.75;
      for (const edge of edges) {
        const a = display.get(edge.source),
          b = display.get(edge.target);
        if (!a || !b) continue;
        const active = edge.source === visualFocus || edge.target === visualFocus;
        if (!active) continue;
        const dim = matched && !matched.has(edge.source) && !matched.has(edge.target);
        context.globalAlpha = dim ? 0.025 : selected ? (dark ? 0.48 : 0.45) : 0.16;
        context.strokeStyle = ink;
        const bend = project(edge.control);
        const source = project(bySlug.get(edge.source)!.position);
        const target = project(bySlug.get(edge.target)!.position);
        const cx = (a.x + b.x) / 2 + (bend.x - (source.x + target.x) / 2) * 0.34;
        const cy = (a.y + b.y) / 2 + (bend.y - (source.y + target.y) / 2) * 0.34;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.quadraticCurveTo(cx, cy, b.x, b.y);
        context.stroke();
        if (active && !instant) {
          const t =
            (((time / 3800 + (edge.source.length + edge.target.length) * 0.071) % 1) + 1) % 1;
          const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
          const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
          context.globalAlpha = dark ? 0.72 : 0.46;
          context.beginPath();
          context.arc(x, y, preview ? 1 : 1.5, 0, Math.PI * 2);
          context.fillStyle = ink;
          context.fill();
        }
      }
      const ordered = [...nodes].sort(
        (a, b) =>
          Number(a.slug === visualFocus) - Number(b.slug === visualFocus) ||
          Number(related.has(a.slug)) - Number(related.has(b.slug)),
      );
      for (const node of ordered) {
        const point = display.get(node.slug);
        if (
          !point ||
          point.x < -80 ||
          point.x > size.width + 80 ||
          point.y < -80 ||
          point.y > size.height + 80
        )
          continue;
        const active = node.slug === selected;
        const dim = matched && !matched.has(node.slug) && !active;
        context.globalAlpha = dim ? 0.12 : selected && !active && !related.has(node.slug) ? 0.7 : 1;
        context.fillStyle = CHAPTER_COLORS[node.section] ?? '#bdced9';
        context.beginPath();
        context.arc(point.x, point.y, point.r * (active ? 1.12 : 1), 0, Math.PI * 2);
        context.fill();
        if (active) {
          context.globalAlpha = 0.95;
          context.strokeStyle = style.getPropertyValue('--color-paper').trim() || '#fff';
          context.lineWidth = 5;
          context.stroke();
          context.strokeStyle = CHAPTER_COLORS[node.section] ?? '#bdced9';
          context.lineWidth = 2;
          context.beginPath();
          context.arc(point.x, point.y, point.r * 1.36, 0, Math.PI * 2);
          context.stroke();
        }
      }
      if (!preview) {
        const occupied: Point[] = [];
        const labelOrder = [...nodes].sort(
          (a, b) =>
            Number(b.slug === visualFocus) - Number(a.slug === visualFocus) ||
            Number(related.has(b.slug)) - Number(related.has(a.slug)) ||
            b.degree - a.degree,
        );
        for (const node of labelOrder) {
          const point = display.get(node.slug);
          if (!point || point.x < 0 || point.x > size.width || point.y < 0 || point.y > size.height)
            continue;
          const important = node.slug === visualFocus || related.has(node.slug);
          if (node.slug !== visualFocus && occupied.some((other) => overlap(point, other)))
            continue;
          context.globalAlpha =
            matched && !matched.has(node.slug) && node.slug !== selected
              ? 0.22
              : important
                ? 0.96
                : 0.64;
          context.fillStyle = important ? ink : muted;
          context.font = `${node.slug === visualFocus ? 500 : 400} ${point.font}px 'Albert Sans', system-ui, sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'bottom';
          context.fillText(node.title, point.x, point.y - point.r - 7);
          occupied.push(point);
        }
      }
      context.globalAlpha = 1;
      if (running) frame = requestAnimationFrame(draw);
    };
    const update = () => {
      cancelAnimationFrame(frame);
      running = !instantMotion() && !document.hidden;
      frame = requestAnimationFrame(draw);
    };
    const stop = observeMotionPolicy(update);
    const theme = new MutationObserver(update);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      theme.disconnect();
      stop();
    };
  }, [nodes, edges, bySlug, related, matched, selected, visualFocus, preview, size, zoom, pan]);

  return (
    <canvas
      ref={canvas}
      width={1}
      height={1}
      data-graph-ready={size.width > 0 || undefined}
      aria-label={
        preview ? undefined : 'AI Coding 知识图谱：点击节点查看词条，方向键切换，Enter 打开'
      }
      tabIndex={preview ? -1 : 0}
      onPointerDown={
        preview
          ? undefined
          : (event) => {
              pointer.current = {
                x: event.clientX,
                y: event.clientY,
                panX: pan.x,
                panY: pan.y,
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
      }
      onPointerMove={
        preview
          ? undefined
          : (event) => {
              const start = pointer.current;
              if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) {
                start.moved = true;
                setPan({
                  x: start.panX + event.clientX - start.x,
                  y: start.panY + event.clientY - start.y,
                });
              }
              const box = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - box.left,
                y = event.clientY - box.top;
              event.currentTarget.style.cursor = [...current.current.values()].some(
                (point) => Math.hypot(point.x - x, point.y - y) < point.r + 8,
              )
                ? 'pointer'
                : start?.moved
                  ? 'grabbing'
                  : 'grab';
            }
      }
      onPointerUp={
        preview
          ? undefined
          : (event) => {
              const start = pointer.current;
              pointer.current = null;
              if (start?.moved) return;
              const box = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - box.left,
                y = event.clientY - box.top;
              const hit = [...current.current.entries()]
                .filter(([, point]) => Math.hypot(point.x - x, point.y - y) < point.r + 8)
                .sort((a, b) => distance(a[1], { x, y }) - distance(b[1], { x, y }))[0];
              if (hit) onSelect?.(hit[0]);
            }
      }
      onPointerCancel={
        preview
          ? undefined
          : () => {
              pointer.current = null;
            }
      }
      onWheel={
        preview
          ? undefined
          : (event) => {
              event.preventDefault();
              setZoom((value) =>
                Math.max(0.65, Math.min(2.3, value * (event.deltaY > 0 ? 0.9 : 1.1))),
              );
            }
      }
      onKeyDown={
        preview
          ? undefined
          : (event) => {
              if (event.key === 'Escape') onSelect?.(null);
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                const index = Math.max(
                  0,
                  nodes.findIndex((node) => node.slug === selected),
                );
                onSelect?.(
                  nodes[
                    (index + (event.key === 'ArrowRight' ? 1 : -1) + nodes.length) % nodes.length
                  ]?.slug ?? null,
                );
              }
              if (event.key === 'Enter' && !selected) onSelect?.(nodes[0]?.slug ?? null);
            }
      }
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        touchAction: preview ? 'auto' : 'none',
      }}
    />
  );
}
