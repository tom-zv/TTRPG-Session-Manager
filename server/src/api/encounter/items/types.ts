import type { ItemCategory, ItemKind, ItemRarity, StoredItemDetails } from "shared/domain/dnd5e/item.js";

/** Who is reading: GMs see hidden items, players only visible ones. Nobody sees deleted items. */
export interface ItemViewer {
  isGm: boolean;
}

// A dnd5e.items row as the item API reads it, with its family and its viewer-visible base item.
export interface ItemSummaryDB {
  id: number;
  kind: ItemKind;
  import_key: string | null;
  name: string;
  source: string;
  category: ItemCategory | null;
  rarity: ItemRarity;
  requires_attunement: boolean;
  attunement_note: string | null;
  value_cp: number | null;
  weight_lb: number | null;
  is_hidden: boolean;
  family_id: number | null;
  family_name: string | null;
  family_source: string | null;
  family_hidden: boolean;
  base_item_id: number | null;        // the stored link, whether or not the viewer can see it
  base_name: string | null;           // set only when the viewer can see the base item
  base_source: string | null;
  aliases: string[];
}

export interface ItemDB extends ItemSummaryDB {
  page: number | null;
  details: StoredItemDetails;
  locally_edited: boolean;
  import_revision: string | null;
}

// Columns the item API writes. Kind, import identity, family and provenance are never written here.
export interface ItemWriteDB {
  name: string;
  source: string;
  page: number | null;
  category: ItemCategory | null;
  rarity: ItemRarity;
  requires_attunement: boolean;
  attunement_note: string | null;
  value_cp: string | null;            // exact 4-place decimal text
  weight_lb: string | null;
  details: StoredItemDetails;
  base_item_id: number | null;
}

/** What the service needs to know about a row before it writes it, read under a row lock. */
export interface ItemLockDB {
  id: number;
  kind: ItemKind;
  import_key: string | null;
  family_id: number | null;
  base_item_id: number | null;
  locally_edited: boolean;
  deleted: boolean;
  details: StoredItemDetails;
}
