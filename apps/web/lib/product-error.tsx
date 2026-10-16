'use client';

import type { ErrorComponentProps } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { PageError } from '@/components/page-error';

// error 参数按 TanStack ErrorComponentProps（error: unknown）声明，收窄会违反函数参数逆变
export function createProductError(options: Omit<ComponentProps<typeof PageError>, 'reset'>) {
  return function ProductError({ reset }: ErrorComponentProps) {
    return <PageError {...options} reset={reset} />;
  };
}
