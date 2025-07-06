import { useLayoutEffect, useState } from "react";

/**
 * Custom hook to calculate the percentage height of a detail element relative to its parent.
 * @param parentRef - Ref to the parent container element.
 * @param detailRef - Ref to the detail (child) element.
 * @param initialPct - Initial fallback percentage.
 * @returns The calculated percentage height.
 */
export function useElementHeightPct(
  parentRef: React.RefObject<HTMLElement | null>,
  detailRef: React.RefObject<HTMLElement | null>,
  initialPct: number = 5
) {
  const [pct, setPct] = useState<number>(initialPct);

  useLayoutEffect(() => {
    const parent = parentRef.current;
    const detail = detailRef.current;
    if (parent && detail) {
      const parentHeight = parent.getBoundingClientRect().height;
      const detailHeight = detail.getBoundingClientRect().height;
      if (parentHeight > 0) {
        setPct((detailHeight / parentHeight) * 100);
      }
    }
  }, [parentRef, detailRef]);

  return pct;
}