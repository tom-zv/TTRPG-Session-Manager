import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import { NARROW_BROWSER_QUERY } from "../browser/BrowserLayout.js";

/** `live`: the sheet's values are its inputs. `targets`: each value opens its own editor. */
export type SheetPresentation = "live" | "targets";

export const COARSE_POINTER_QUERY = "(pointer: coarse)";

/**
 * How edit mode is drawn. A narrow window or a touch screen gets per-field editors; in-place
 * inputs are too small for a finger. Read per render, so a resize or rotation switches it.
 */
export const usePresentation = (): SheetPresentation => {
  const narrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  return narrow || coarse ? "targets" : "live";
};
