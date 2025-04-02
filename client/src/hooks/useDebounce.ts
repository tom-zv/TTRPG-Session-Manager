// filepath: client/src/hooks/useDebounce.ts
import { useRef, useCallback } from 'react';

export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // memoize the debounced function
  return useCallback((...args: any[]) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      callback(...args);
      timerRef.current = null;
    }, delay);
  }, [callback, delay]) as T;
}