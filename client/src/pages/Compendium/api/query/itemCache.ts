import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Item, ItemListResult, ItemMembersResult, ItemSummary } from "shared/domain/dnd5e/item.js";
import { INVENTORY_KEYS } from "./inventoryKeys.js";
import { ITEM_KEYS, type ItemViewer } from "./itemKeys.js";

export type ItemMutationScope = {
  viewer: ItemViewer;
  /** The viewer's browser is still mounted, even if another tab is showing. */
  isCurrent: () => boolean;
};

type IndexData = ItemListResult;
type MembersData = InfiniteData<ItemMembersResult | null, number>;

export const itemToSummary = (item: Item): ItemSummary => ({
  id: item.id,
  kind: item.kind,
  origin: item.origin,
  name: item.name,
  source: item.source,
  category: item.category,
  rarity: item.rarity,
  requiresAttunement: item.requiresAttunement,
  attunementNote: item.attunementNote,
  valueCp: item.valueCp,
  weightLb: item.weightLb,
  aliases: item.aliases,
  family: item.family,
  base: item.base,
  ...(item.gm ? { gm: { hidden: item.gm.hidden, hiddenByFamily: item.gm.hiddenByFamily } } : {}),
});

const mapIndexes = (queryClient: QueryClient, viewer: ItemViewer, map: (page: ItemListResult) => ItemListResult) =>
  queryClient.setQueriesData<IndexData>({ queryKey: ITEM_KEYS.indexes(viewer) }, old =>
    old ? map(old) : old);

const mapMembers = (queryClient: QueryClient, viewer: ItemViewer, map: (page: ItemMembersResult) => ItemMembersResult) =>
  queryClient.setQueriesData<MembersData>({ queryKey: ITEM_KEYS.memberLists(viewer) }, old =>
    old ? { ...old, pages: old.pages.map(page => (page ? map(page) : page)) } : old);

/**
 * Lists are filtered, sorted and counted on the server, so a saved item cannot be placed in
 * them here. Older reads are cancelled, the rows already listed show the saved values at once, and
 * the lists are then refetched for their order, totals and filter choices. Lists that were never
 * loaded stay absent rather than being seeded with one item.
 */
function refreshLists(queryClient: QueryClient, viewer: ItemViewer, exceptDetailId: number) {
  void queryClient.invalidateQueries({ queryKey: ITEM_KEYS.indexes(viewer) });
  void queryClient.invalidateQueries({ queryKey: ITEM_KEYS.memberLists(viewer) });
  void queryClient.invalidateQueries({ queryKey: ITEM_KEYS.pickers(viewer) });
  // Text references resolve by name and visibility, which an edit, hide or delete can change; their
  // previews show the item's page.
  void queryClient.invalidateQueries({ queryKey: ITEM_KEYS.references(viewer) });
  // Inventory rows carry their linked item's name and visibility as this viewer may see them.
  void queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.viewer(viewer) });
  // Other pages name this item (a specific's family or base); a family's visibility reaches its specifics.
  void queryClient.invalidateQueries({
    queryKey: [...ITEM_KEYS.viewer(viewer), "detail"],
    predicate: query => query.queryKey[query.queryKey.length - 1] !== exceptDetailId,
  });
}

async function cancelReads(queryClient: QueryClient, viewer: ItemViewer) {
  await queryClient.cancelQueries({ queryKey: ITEM_KEYS.viewer(viewer) });
}

/** Stores the server's answer to a create, edit or visibility change. */
export async function storeItem(queryClient: QueryClient, { viewer, isCurrent }: ItemMutationScope, item: Item): Promise<void> {
  if (!isCurrent()) return;
  await cancelReads(queryClient, viewer);
  if (!isCurrent()) return;
  queryClient.setQueryData<Item | null>(ITEM_KEYS.detail(viewer, item.id), item);
  const summary = itemToSummary(item);
  const replace = <Row extends { id: number }>(row: Row, next: () => Row) => (row.id === item.id ? next() : row);
  mapIndexes(queryClient, viewer, page => ({ ...page, items: page.items.map(row => replace(row, () => summary)) }));
  mapMembers(queryClient, viewer, page => ({
    ...page,
    members: page.members.map(member => (member.item.id === item.id ? { ...member, item: summary } : member)),
  }));
  refreshLists(queryClient, viewer, item.id);
}

/** After a delete: the item leaves every list and its own entries are dropped. */
export async function forgetItem(queryClient: QueryClient, { viewer, isCurrent }: ItemMutationScope, id: number): Promise<void> {
  if (!isCurrent()) return;
  await cancelReads(queryClient, viewer);
  if (!isCurrent()) return;
  mapIndexes(queryClient, viewer, page => {
    const items = page.items.filter(row => row.id !== id);
    return { ...page, items, total: page.total - (page.items.length - items.length) };
  });
  mapMembers(queryClient, viewer, page => {
    const members = page.members.filter(member => member.item.id !== id);
    return { ...page, members, total: page.total - (page.members.length - members.length) };
  });
  queryClient.removeQueries({ queryKey: ITEM_KEYS.detail(viewer, id) });
  queryClient.removeQueries({ queryKey: ITEM_KEYS.members(viewer, id) });
  refreshLists(queryClient, viewer, id);
}

/** Drops every other viewer's item entries, after an account or role change. */
export function forgetOtherViewers(queryClient: QueryClient, viewer: ItemViewer): void {
  const segment = ITEM_KEYS.viewerSegment(viewer);
  queryClient.removeQueries({
    queryKey: ITEM_KEYS.all,
    predicate: query => query.queryKey[ITEM_KEYS.all.length] !== segment,
  });
}
