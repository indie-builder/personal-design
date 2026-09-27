'use client';

import { Fragment, type CSSProperties } from 'react';
import { categoryLabel } from '@/lib/category-label';
import styles from './layout-bookshelf.module.css';

/** 八本书脊的固定装帧：封面色、墨色、高矮厚薄按分类序号循环。 */
export const bindings = [
  ['#b94a35', '#fff6df', 340, 76],
  ['#d6c7a6', '#342e25', 292, 68],
  ['#557477', '#fff9e9', 380, 88],
  ['#d4ac49', '#302918', 324, 74],
  ['#465676', '#f7f3e9', 360, 82],
  ['#a65e47', '#fff8ec', 280, 66],
  ['#707453', '#fff9e5', 350, 78],
  ['#ddd5c3', '#34312a', 310, 72],
] as const;

function coverFace(label: string) {
  return (
    <span key="cover" data-book-cover aria-hidden="true">
      <span>{label}</span>
      <small>排版构图图鉴</small>
    </span>
  );
}

/** 书架：可交互（onOpen）或首页预览（data-preview，随 previewActive 翻动封面）。 */
export function BookSpines({
  categories,
  onOpen,
  muted = [],
  previewActive = -1,
  extracting = -1,
  onExtract,
}: {
  extracting?: number;
  onExtract?: () => void;
  previewActive?: number;
  categories: { name: string; count: number }[];
  onOpen?: (name: string) => void;
  muted?: string[];
}) {
  return (
    <div className={styles.shelf} data-preview={!onOpen || undefined}>
      <div className={styles.books}>
        {categories.map((category, index) => {
          const [color, ink, height, width] = bindings[index % bindings.length]!;
          const label = categoryLabel(category.name);
          const content = (
            <Fragment key={category.name}>
              <span className={styles.spineTitle}>{label}</span>
              <span className={styles.spineBottom}>
                {String(index + 1).padStart(2, '0')}
                <span>{category.count} 页</span>
              </span>
            </Fragment>
          );
          const props = {
            className: styles.spine,
            style: {
              '--binding': color,
              '--binding-ink': ink,
              '--book-height': `${height}px`,
              '--book-width': `${width}px`,
            } as CSSProperties,
          };
          return onOpen ? (
            <button
              {...props}
              key={category.name}
              id={`book-${index}`}
              disabled={muted.includes(category.name)}
              aria-label={`打开${label}，${category.count}页`}
              data-extracting={extracting === index || undefined}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && extracting === index) onExtract?.();
              }}
              onClick={() => onOpen(category.name)}
            >
              {content}
              {coverFace(label)}
            </button>
          ) : (
            <span
              {...props}
              key={category.name}
              data-book-active={index === previewActive}
              data-cover-title={label}
            >
              {content}
              {coverFace(label)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
