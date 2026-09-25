import type { Metadata } from 'next';
import { DictionaryMap } from '@/components/dictionary-map';

export const metadata: Metadata = {
  title: 'AI Coding 词典',
  description: '在知识网中探索 AI Coding 术语，中英对照阅读。',
};

export default function AiCodingDictionaryPage() {
  return <DictionaryMap />;
}
