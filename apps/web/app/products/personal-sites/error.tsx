'use client';

import { PageError } from '@/components/page-error';

export default function PersonalSitesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      reset={reset}
      title="个人网站暂时无法打开"
      href="/products/personal-sites"
      returnLabel="返回个人网站"
      hint="加载时遇到了问题，重新加载通常可以恢复。"
    />
  );
}
