'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ImageOff } from 'lucide-react';
import { instantMotion, useVisiblePlay } from '@/lib/motion';
import { shuffleBooks } from '@/lib/book-shuffle';
import { BookSpines } from './book-spines';
import styles from './home-view.module.css';

export type Preview = { src: string; alt: string; videoSrc?: string };
export type ToolPreviewItem = { name: string; category: string; icon: string | null };

export function PreviewImage({ src, alt, priority = false }: Preview & { priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={styles.imageFrame}>
      {failed || !src ? (
        <div className={styles.mediaError}>
          <ImageOff size={20} strokeWidth={1.5} />
          <span>预览暂不可用</span>
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 640px) 250px, 320px"
          className={styles.image}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

/** The homepage preview moves only while it is visible; the actual shelf stays unchanged. */
export function BookPreview({ categories }: { categories: { name: string; count: number }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(-1);
  const bag = useRef<number[]>([]);
  const current = useRef(-1);
  const onPlay = useCallback(
    (playing: boolean) => {
      setRunning(playing);
      if (playing && current.current === -1) {
        bag.current = shuffleBooks(categories.length);
        current.current = bag.current.shift() ?? -1;
        setActive(current.current);
      }
    },
    [categories.length],
  );
  useVisiblePlay(ref, onPlay);
  function nextBook() {
    if (!running || instantMotion() || document.hidden) return;
    if (!bag.current.length) bag.current = shuffleBooks(categories.length, current.current);
    current.current = bag.current.shift() ?? -1;
    setActive(current.current);
  }
  return (
    <div
      ref={ref}
      className={styles.bookMotion}
      data-running={running}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (event.target instanceof HTMLElement && event.target.dataset.bookActive === 'true')
          nextBook();
      }}
    >
      <BookSpines categories={categories} previewActive={running ? active : -1} />
    </div>
  );
}

/** Reuse the atlas renderer only while this timeline item is visible and motion is allowed. */
export function DictionaryPreview() {
  const host = useRef<HTMLDivElement>(null);
  const onPlay = useCallback((playing: boolean) => {
    const element = host.current;
    if (!element) return;
    const frame = element.querySelector('iframe');
    if (playing && !frame) {
      const next = document.createElement('iframe');
      next.src = '/ai-coding-atlas/index.html?preview=1&term=agent';
      next.title = 'AI Coding 知识图谱预览';
      next.tabIndex = -1;
      next.setAttribute('aria-hidden', 'true');
      next.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      element.append(next);
    } else if (!playing && frame) frame.remove();
  }, []);
  useVisiblePlay(host, onPlay);
  const nodes = [
    { name: 'Model', x: 58, y: 55, r: 12, color: '#bdced9' },
    { name: 'Token', x: 147, y: 32, r: 10, color: '#bdced9' },
    { name: 'Agent', x: 162, y: 102, r: 18, color: '#c7d6c1' },
    { name: 'Harness', x: 68, y: 148, r: 11, color: '#bdced9' },
    { name: 'Context', x: 261, y: 64, r: 14, color: '#c7d6c1' },
    { name: 'MCP', x: 267, y: 157, r: 10, color: '#e2d3be' },
  ];
  return (
    <div className={styles.dictionaryPreview} aria-hidden="true">
      <svg viewBox="0 0 320 196">
        <g className={styles.dictionaryEdges}>
          {nodes
            .filter((node) => node.name !== 'Agent')
            .map((node) => (
              <line key={node.name} x1="162" y1="102" x2={node.x} y2={node.y} />
            ))}
          <path d="M58 55 Q106 8 147 32 M147 32 Q211 23 261 64 M68 148 Q161 179 267 157" />
        </g>
        {nodes.map((node) => (
          <g key={node.name}>
            <circle cx={node.x} cy={node.y} r={node.r} fill={node.color} />
            <text x={node.x} y={node.y - node.r - 6} textAnchor="middle">
              {node.name}
            </text>
          </g>
        ))}
      </svg>
      <div ref={host} className={styles.dictionaryRuntime} />
    </div>
  );
}

export function ToolPreview({ tools }: { tools: ToolPreviewItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const timer = useRef(0);
  const onPlay = useCallback(
    (playing: boolean) => {
      window.clearTimeout(timer.current);
      if (!playing) {
        setActive(-1);
        return;
      }
      const advance = () => {
        setActive((current) => (current + 1) % tools.length);
        timer.current = window.setTimeout(advance, 1800);
      };
      advance();
    },
    [tools.length],
  );
  useVisiblePlay(ref, onPlay);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div ref={ref} className={styles.toolPreview} aria-hidden="true">
      {tools.map((tool, index) => (
        <span key={tool.name} data-active={index === active || undefined}>
          <i>
            {tool.icon && <Image src={tool.icon} alt="" width={16} height={16} />}
            <ArrowUpRight size={16} strokeWidth={1.6} />
          </i>
          <b>{tool.name}</b>
        </span>
      ))}
    </div>
  );
}
