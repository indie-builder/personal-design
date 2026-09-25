import type { Metadata } from 'next';
import { entries, sections } from '@personal-design/ai-coding-dictionary';
import { graphEdges, graphNodes } from '@personal-design/ai-coding-dictionary/graph';
import { DictionaryMap } from '@/components/dictionary-map';

export const metadata: Metadata = {
  title: 'AI Coding 词典',
  description: '在知识网中探索 AI Coding 术语，中英对照阅读。',
};

export default function AiCodingDictionaryPage() {
  return (
    <DictionaryMap entries={entries} sections={sections} nodes={graphNodes} edges={graphEdges} />
  );
}
