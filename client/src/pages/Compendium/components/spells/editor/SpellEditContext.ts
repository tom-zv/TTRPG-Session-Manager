import { drawsLive, useActiveSheetEdit, useSheetEdit, type SheetEditApi } from "../../sheetEditor/SheetEditContext.js";
import type { SpellDraft } from "./model/spellDraft.js";
import type { SpellModes } from "./model/fields.js";
import { spellFieldRegion } from "./model/issueTargets.js";

/** The spell sheet's edit state: the kit's controls and the draft. `SpellEditor` provides it. */
export type SpellEditApi = SheetEditApi<SpellDraft, SpellModes>;

/** The sheet's edit state, or null in view mode. */
export const useSpellEdit = (): SpellEditApi | null => useSheetEdit<SpellDraft, SpellModes>();

/** For editors, which only render while editing. */
export const useActiveSpellEdit = (): SpellEditApi => useActiveSheetEdit<SpellDraft, SpellModes>();

/** Whether a region of the spell sheet ("name", "header", "components") draws live fields; false in view mode. */
export const useSpellLiveRegion = (): ((region: string) => boolean) => {
  const edit = useSpellEdit();
  return region => drawsLive(edit, region, spellFieldRegion);
};
