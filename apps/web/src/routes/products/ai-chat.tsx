import { createFileRoute } from '@tanstack/react-router';
import { AiChat } from '@/components/ai-chat';
import { pageHead } from '@/lib/site-url';

export const Route = createFileRoute('/products/ai-chat')({
  head: pageHead('AI 问答', '选择或创建智能体，用对话生成清晰、可交互的回答。'),
  component: AiChatPage,
});

function AiChatPage() {
  return <AiChat />;
}
