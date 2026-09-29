import type { Metadata } from 'next';
import { WordArcade } from '@/components/word-arcade';

export const metadata: Metadata = {
  title: '文字游乐场',
  description: '把文字变成游戏：打砖块、贪吃蛇、文字射击、飞字打靶与文字跑酷。',
};

export default function WordArcadePage() {
  return <WordArcade />;
}
