import { createFileRoute } from '@tanstack/react-router';
import { DictionaryMap } from '@/components/dictionary-map';
import { pageHead } from '@/lib/site-url';

export const Route = createFileRoute('/products/ai-coding-dictionary')({
  head: pageHead('AI Coding 词典', '在知识网中探索 AI Coding 术语，中英对照阅读。'),
  component: AiCodingDictionaryPage,
});

function AiCodingDictionaryPage() {
  return <DictionaryMap />;
}
