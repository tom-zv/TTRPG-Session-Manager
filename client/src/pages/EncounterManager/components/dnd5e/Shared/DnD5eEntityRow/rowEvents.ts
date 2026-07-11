import type React from "react";

const NESTED_CONTROL = "button, input, select, textarea, a[href], label";

/**
 * True when a click on a clickable row is not meant as "select me":
 * - it started on one of the row's own controls (a button, input, switch label…), or
 * - it started outside the row's DOM. React bubbles events from portals, such as a row tray,
 *   through the component tree, so the row sees clicks made in a panel floating beside it.
 */
export function isFromNestedControl(event: React.SyntheticEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Node)) return false;
  if (!event.currentTarget.contains(target)) return true;
  if (!(target instanceof Element)) return false;
  const control = target.closest(NESTED_CONTROL);
  return control !== null && control !== event.currentTarget && event.currentTarget.contains(control);
}
