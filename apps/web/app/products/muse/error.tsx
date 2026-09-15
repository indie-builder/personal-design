'use client';

import { PageError } from '@/components/page-error';

export default function MuseError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageError
      reset={reset}
      title="灵感暂时无法打开"
      href="/products/muse"
      returnLabel="返回灵感集"
    />
  );
}
