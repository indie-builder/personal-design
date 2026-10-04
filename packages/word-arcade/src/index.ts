export { Arcade } from './game';
export type { GameKind, GameState, LetterLayout, Brick, Point } from './game';
export { default as pixelPatterns } from './pixel-patterns.json';

export const games = [
  {
    id: 'breakout',
    name: '打砖块',
    instruction: '移动或 ← → 接球',
  },
  {
    id: 'snake',
    name: '贪吃蛇',
    instruction: '移动或方向键转向',
  },
  {
    id: 'invaders',
    name: '文字射击',
    instruction: '移动或 ← →，自动射击',
  },
  {
    id: 'ducks',
    name: '飞字打靶',
    instruction: '点击射击 · 方向键瞄准，空格发射',
  },
  {
    id: 'runner',
    name: '文字跑酷',
    instruction: '点击或空格跳跃',
  },
] as const;

export const headlines = [
  '任何想法，一键开玩。',
  '还记得第一次破纪录吗？',
  '把空白，留给想象。',
  '下一关，轮到你了。',
] as const;

export const arcadeProduct = {
  slug: 'word-arcade',
  name: '文字游乐场',
  tagline: '五款文字小游戏',
  description: '打砖块、贪吃蛇、文字射击、飞字打靶与文字跑酷。',
  date: '2026-09-29',
  href: '/products/word-arcade',
  cover: '',
};
