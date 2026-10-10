'use client';

import { useEffect, useRef } from 'react';
import { instantMotion, observeMotionPolicy } from '@/lib/motion';
import styles from './home-digital-rain.module.css';

const glyphs = 'AISDPEL01<>=+*-#$';
const randomGlyph = () => glyphs[Math.floor(Math.random() * glyphs.length)]!;

export function HomeDigitalRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let visible = false;
    let width = 0;
    let height = 0;
    const spacing = 12.3;
    let color = '';
    let glowColor = '';
    let columns: {
      head: number;
      speed: number;
      end: number;
      brightness: number;
      cells: { glyph: string; alpha: number; floor: number; glow: number }[];
    }[] = [];

    function advance() {
      for (const column of columns) {
        column.head += column.speed;
        for (const [row, cell] of column.cells.entries()) {
          cell.alpha = Math.max(cell.floor, cell.alpha * 0.94);
          if (row === Math.floor(column.head) && row <= column.end) cell.alpha = 0.8;
          cell.glow = cell.glow < 0.03 ? 0 : cell.glow * 0.82;
        }
        if (Math.random() < 0.4) {
          const cell = column.cells[Math.floor(Math.random() * column.cells.length)]!;
          cell.glyph = randomGlyph();
        }
        if (column.head > column.end + 4) {
          column.head = -Math.random() * column.cells.length * 1.5;
          column.speed = 0.25 + Math.random() * 0.75;
        }
      }
    }

    function draw() {
      context!.clearRect(0, 0, width, height);
      context!.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
      context!.textBaseline = 'top';
      columns.forEach((column, index) => {
        column.cells.forEach((cell, row) => {
          const alpha = cell.alpha * column.brightness;
          context!.globalAlpha = Math.max(alpha, cell.glow);
          if (context!.globalAlpha === 0) return;
          context!.fillStyle = cell.glow > alpha ? glowColor : color;
          context!.fillText(cell.glyph, index * spacing, row * 16);
        });
      });
      context!.globalAlpha = 1;
    }

    function updatePalette() {
      const style = getComputedStyle(canvas!);
      color = style.color;
      glowColor = style.getPropertyValue('--rain-glow').trim();
      draw();
    }

    function resize() {
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(width * scale);
      canvas!.height = Math.round(height * scale);
      context!.setTransform(scale, 0, 0, scale, 0, 0);
      const rows = Math.ceil(height / 16);
      columns = Array.from({ length: Math.ceil(width / spacing) }, () => {
        const end = Math.floor(rows * (0.35 + Math.random() * 0.65));
        return {
          head: Math.random() * rows * 2,
          speed: 0.25 + Math.random() * 0.75,
          end,
          brightness: 0.5 + Math.random() * 0.5,
          cells: Array.from({ length: rows }, (_, row) => ({
            glyph: randomGlyph(),
            alpha: 0,
            floor: row <= end ? 0.04 + Math.random() * 0.08 : 0,
            glow: 0,
          })),
        };
      });
      for (let step = 0; step < rows * 4; step++) advance();
      updatePalette();
    }

    function updatePlayback() {
      clearInterval(timer);
      timer = undefined;
      const playing = visible && !document.hidden && !instantMotion();
      canvas!.dataset.playing = String(playing);
      if (playing)
        timer = setInterval(() => {
          advance();
          draw();
        }, 90);
    }

    function pointerMove(event: PointerEvent) {
      if (!timer || event.pointerType === 'touch') return;
      const rect = canvas!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (y < -44 || y > height + 44) return;
      for (
        let index = Math.max(0, Math.floor((x - 44) / spacing));
        index < Math.min(columns.length, Math.ceil((x + 44) / spacing));
        index++
      ) {
        columns[index]!.cells.forEach((cell, row) => {
          const distance = Math.hypot(index * spacing + spacing / 2 - x, row * 16 + 8 - y);
          if (distance < 44) cell.glow = Math.max(cell.glow, 0.95 * (1 - distance / 44) ** 1.5);
        });
      }
    }

    resize();
    const size = new ResizeObserver(resize);
    size.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      updatePlayback();
    });
    intersection.observe(canvas);
    const theme = new MutationObserver(updatePalette);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const stopPolicy = observeMotionPolicy(updatePlayback);
    window.addEventListener('pointermove', pointerMove, { passive: true });
    return () => {
      canvas.dataset.playing = 'false';
      clearInterval(timer);
      size.disconnect();
      intersection.disconnect();
      theme.disconnect();
      stopPolicy();
      window.removeEventListener('pointermove', pointerMove);
    };
  }, []);

  return (
    <div className={styles.background} aria-hidden="true">
      <canvas ref={ref} className={styles.canvas} data-digital-rain aria-hidden="true" />
    </div>
  );
}
