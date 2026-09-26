import type { Metadata } from 'next';
import { AiChat } from '@/components/ai-chat';

export const metadata: Metadata = {
  title: 'AI 问答',
  description: '选择或创建智能体，用对话生成清晰、可交互的回答。',
};

export default function AiChatPage() {
  return <AiChat />;
}
