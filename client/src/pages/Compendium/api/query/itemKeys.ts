import type { ItemListParams } from "shared/domain/dnd5e/item.js";

/** Who is asking: a GM and a player get different answers for the same request. */
export type ItemViewer = { userId: number; isGm: boolean };

const viewerKey = (viewer: ItemViewer) => `${viewer.userId}:${viewer.isGm ? "gm" : "player"}`;

// Item queries are scoped to the viewer (account and role), so one viewer never reads another's
// cache: hidden items appear only in a GM's entries.
export const ITEM_KEYS = {
  all: ["compendium", "dnd5e", "items"] as const,
  viewer: (viewer: ItemViewer) => [...ITEM_KEYS.all, viewerKey(viewer)] as const,
  indexes: (viewer: ItemViewer) => [...ITEM_KEYS.viewer(viewer), "index"] as const,
  /** The browser's whole list for one set of filters. */
  index: (viewer: ItemViewer, params: Omit<ItemListParams, "offset" | "limit">) =>
    [...ITEM_KEYS.indexes(viewer), params] as const,
  detail: (viewer: ItemViewer, id: number) => [...ITEM_KEYS.viewer(viewer), "detail", id] as const,
  memberLists: (viewer: ItemViewer) => [...ITEM_KEYS.viewer(viewer), "members"] as const,
  members: (viewer: ItemViewer, id: number) => [...ITEM_KEYS.memberLists(viewer), id] as const,
  /** The item picker's searches (inventory rows, base items), paged inside the infinite query. */
  pickers: (viewer: ItemViewer) => [...ITEM_KEYS.viewer(viewer), "picker"] as const,
  picker: (viewer: ItemViewer, params: Omit<ItemListParams, "offset" | "limit">) => [...ITEM_KEYS.pickers(viewer), params] as const,
  /**
   * Reads for {@item} mentions in texts (spells, sheets, item descriptions): resolve batches and
   * link previews. They belong to the documents that show them, not to the Items page, and are
   * scoped to a visit (see ItemReferenceVisit), so a player's return to a tab asks again.
   */
  references: (viewer: ItemViewer) => [...ITEM_KEYS.viewer(viewer), "references"] as const,
  /** One batch of canonical reference keys. */
  resolve: (viewer: ItemViewer, visit: number, refKeys: readonly string[]) =>
    [...ITEM_KEYS.references(viewer), visit, "resolve", refKeys] as const,
  /** A link preview's item page. */
  preview: (viewer: ItemViewer, visit: number, id: number) => [...ITEM_KEYS.references(viewer), visit, "preview", id] as const,
  /** The segment that identifies the viewer, for removing other viewers' entries. */
  viewerSegment: viewerKey,
};
