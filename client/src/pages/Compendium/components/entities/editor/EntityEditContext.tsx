import { drawsLive, useActiveSheetEdit, useSheetEdit, type SheetEditApi } from "../../sheetEditor/SheetEditContext.js";
import type { EntityDraft } from "./model/defaults.js";
import type { EntityDraftModes } from "./model/inference.js";
import { liveFieldRegion } from "./model/issueTargets.js";

/**
 * The entity sheet's edit state: the kit's controls, the draft as the sheet renders it (automatic
 * passive Perception already computed) and its modes. `EntityEditor` provides it.
 */
export type EntityEditApi = SheetEditApi<EntityDraft, EntityDraftModes>;

/** The sheet's edit state, or null in view mode. */
export const useEntityEdit = (): EntityEditApi | null => useSheetEdit<EntityDraft, EntityDraftModes>();

/** For editors, which only render while editing. */
export const useActiveEdit = (): EntityEditApi => useActiveSheetEdit<EntityDraft, EntityDraftModes>();

/**
 * Whether a region of the entity sheet ("ac", "subtitle", "saves.dex") draws live fields; false in
 * view mode. See `drawsLive`.
 */
export const useLiveRegion = (): ((region: string) => boolean) => {
  const edit = useEntityEdit();
  return region => drawsLive(edit, region, liveFieldRegion);
};
