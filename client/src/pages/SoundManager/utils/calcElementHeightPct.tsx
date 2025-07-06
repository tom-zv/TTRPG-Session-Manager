/**
 * Calculates the percentage height of a detail element relative to its parent container.
 * @param parentElement - The parent container element.
 * @param detailElement - The detail (child) element.
 * @returns Percentage height of the detail element relative to the parent, or undefined if not found.
 */
export function calcElementHeightPct(
  parentElement: HTMLElement | null,
  detailElement: HTMLElement | null
) {
  if (!parentElement || !detailElement) {
    return;
  }

  const parentHeight = parentElement.getBoundingClientRect().height;
  const detailHeight = detailElement.getBoundingClientRect().height;

  if (parentHeight === 0) return;

  return (detailHeight / parentHeight) * 100;
}