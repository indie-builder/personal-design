'use client';

import type { ComponentProps } from 'react';
import { PageError } from '@/components/page-error';

export function createProductError(options: Omit<ComponentProps<typeof PageError>, 'reset'>) {
  return function ProductError({
    reset,
  }: {
    error: Error & { digest?: string };
    reset: () => void;
  }) {
    return <PageError {...options} reset={reset} />;
  };
}
