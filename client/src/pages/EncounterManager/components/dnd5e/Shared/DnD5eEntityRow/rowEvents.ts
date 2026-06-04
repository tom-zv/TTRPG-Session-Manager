import type React from "react";

const NESTED_CONTROL = "button, input, select, textarea, a[href], label";

/**
 * True when a click on a clickable row started on one of its own controls
 * (a button, input, switch label…). The row should not treat it as "select me".
 */
export function isFromNestedControl(event: React.SyntheticEvent<HTMLElement>): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const control = target.closest(NESTED_CONTROL);
  return control !== null && control !== event.currentTarget && event.currentTarget.contains(control);
}
