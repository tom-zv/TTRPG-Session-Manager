import type { Item } from "shared/domain/dnd5e/item.js";
import { drawsLive, useActiveSheetEdit, useSheetEdit, type SheetEditApi } from "../../sheetEditor/SheetEditContext.js";
import type { ItemDraft } from "./model/itemDraft.js";
import type { ItemModes } from "./model/fields.js";
import { itemFieldRegion } from "./model/issueTargets.js";

/**
 * The item sheet's edit state: the kit's controls and the draft, plus what the item sheet needs
 * beside them. `ItemEditor` provides it.
 */
export type ItemEditApi = SheetEditApi<ItemDraft, ItemModes> & {
  /** The stored item under the draft (a homebrew shell with id 0 for a new one): its kind, family and id. */
  record: Item;
  /** Stats added from "+ stat" that have no value yet; they keep their line until removed or edit mode ends. */
  addedStats: readonly string[];
  /** Adds a stat's line from "+ stat" (a flag is set at once), or drops a line that was removed. */
  showStat: (key: string) => void;
  hideStat: (key: string) => void;
};

/** The sheet's edit state, or null in view mode. */
export const useItemEdit = (): ItemEditApi | null => useSheetEdit<ItemDraft, ItemModes>() as ItemEditApi | null;

/** For editors, which only render while editing. */
export const useActiveItemEdit = (): ItemEditApi => useActiveSheetEdit<ItemDraft, ItemModes>() as ItemEditApi;

/** Whether a region of the item sheet ("name", "subtitle", "damage") draws live fields; false in view mode. */
export const useItemLiveRegion = (): ((region: string) => boolean) => {
  const edit = useItemEdit();
  return region => drawsLive(edit, region, itemFieldRegion);
};
