'use client';

import { PageError } from '@/components/page-error';

export default function AiCodingDictionaryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      reset={reset}
      title="AI Coding 词典暂时无法打开"
      href="/products/ai-coding-dictionary"
      returnLabel="返回 AI Coding 词典"
      hint="加载时遇到了问题，重新加载通常可以恢复。"
    />
  );
}
