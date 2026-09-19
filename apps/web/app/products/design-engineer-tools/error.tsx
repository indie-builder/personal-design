'use client';

import { PageError } from '@/components/page-error';

export default function DesignEngineerToolsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      reset={reset}
      title="设计工程工具暂时无法打开"
      href="/products/design-engineer-tools"
      returnLabel="返回设计工程工具"
      hint="加载时遇到了问题，重新加载通常可以恢复。"
    />
  );
}
