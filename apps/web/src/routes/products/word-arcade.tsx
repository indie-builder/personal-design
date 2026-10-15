import { createFileRoute } from '@tanstack/react-router';
import { WordArcade } from '@/components/word-arcade';
import { pageHead } from '@/lib/site-url';

export const Route = createFileRoute('/products/word-arcade')({
  head: pageHead('文字游乐场', '把文字变成游戏：打砖块、贪吃蛇、文字射击、飞字打靶与文字跑酷。'),
  component: WordArcadePage,
});

function WordArcadePage() {
  return <WordArcade />;
}
