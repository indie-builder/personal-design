'use client';

import { PageError } from '@/components/page-error';

export default function LayoutCompositionsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      reset={reset}
      title="布局参考暂时无法打开"
      href="/products/layout-compositions"
      returnLabel="返回布局参考"
    />
  );
}
