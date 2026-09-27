'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Shared load state for large media (detail hero, carousel slides, lightbox):
 * loading → ready/error, with a watchdog that fails stalled loads while
 * `watch` is true and a retry counter that callers use as the remount key.
 */
export function useMediaStatus(watch: boolean, timeoutMs: number) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!watch || status !== 'loading') return;
    const timer = window.setTimeout(() => setStatus('error'), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [watch, status, attempt, timeoutMs]);
  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }, []);
  return {
    status,
    attempt,
    setStatus,
    /** Back to loading with a fresh remount key. */
    retry,
  };
}
