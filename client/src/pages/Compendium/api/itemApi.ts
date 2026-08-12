import type {
  Item,
  ItemInput,
  ItemListParams,
  ItemListResult,
  ItemMembersResult,
  ItemRef,
  ItemResolveResult,
} from "shared/domain/dnd5e/item.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

// The D&D 5e item catalog (/api/dnd5e/items). Every route needs a signed-in user; the server
// answers each viewer with what they may see, and a hidden item reads like a missing one.

const BASE = "/api/dnd5e/items";

async function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { method: "GET", ...init, headers: authenticatedJsonHeaders(), credentials: "include" });
}

async function failWith(response: Response, failure: string): Promise<never> {
  const error = await response.json().catch(() => ({ message: failure }));
  throw new Error(error.message || failure);
}

async function itemFrom(response: Response, failure: string): Promise<Item> {
  if (!response.ok) return failWith(response, failure);
  const data = (await response.json()) as { item: Item };
  return data.item;
}

/** The query string the server reads: one key per selected value, so a source keeps its commas. */
export function itemListSearch(params: ItemListParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  for (const key of ["kinds", "categories", "origins", "rarities", "sources"] as const) {
    params[key]?.forEach(value => search.append(key, value));
  }
  if (params.attunement !== undefined) search.set("attunement", String(params.attunement));
  if (params.specifics !== undefined) search.set("specifics", String(params.specifics));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const ItemApi = {
  async list(params: ItemListParams, signal?: AbortSignal): Promise<ItemListResult> {
    const response = await request(`${BASE}${itemListSearch(params)}`, { signal });
    if (!response.ok) return failWith(response, "Failed to load items");
    return (await response.json()) as ItemListResult;
  },

  /** The item, or null when it is not available to this viewer (hidden, deleted or missing). */
  async get(id: number, signal?: AbortSignal): Promise<Item | null> {
    const response = await request(`${BASE}/${id}`, { signal });
    if (response.status === 404) return null;
    return itemFrom(response, "Failed to load the item");
  },

  /** A page of a family's specifics, a group's members or a pack's contents; null when unavailable. */
  async members(id: number, page: { offset: number; limit: number }, signal?: AbortSignal): Promise<ItemMembersResult | null> {
    const response = await request(`${BASE}/${id}/members?offset=${page.offset}&limit=${page.limit}`, { signal });
    if (response.status === 404) return null;
    if (!response.ok) return failWith(response, "Failed to load related items");
    return (await response.json()) as ItemMembersResult;
  },

  /** One visible summary or null per reference, in order (at most ITEM_RESOLVE_LIMIT per call). */
  async resolve(refs: ItemRef[], signal?: AbortSignal): Promise<ItemResolveResult> {
    const response = await request(`${BASE}/resolve`, { method: "POST", body: JSON.stringify({ refs }), signal });
    if (!response.ok) return failWith(response, "Failed to look up items");
    return (await response.json()) as ItemResolveResult;
  },

  async create(input: ItemInput): Promise<Item> {
    return itemFrom(await request(BASE, { method: "POST", body: JSON.stringify(input) }), "Failed to create the item");
  },

  async update(id: number, input: ItemInput): Promise<Item> {
    return itemFrom(await request(`${BASE}/${id}`, { method: "PUT", body: JSON.stringify(input) }), "Failed to save the item");
  },

  async setVisibility(id: number, hidden: boolean): Promise<Item> {
    const response = await request(`${BASE}/${id}/visibility`, { method: "PUT", body: JSON.stringify({ hidden }) });
    return itemFrom(response, "Failed to change the item's visibility");
  },

  async remove(id: number): Promise<void> {
    const response = await request(`${BASE}/${id}`, { method: "DELETE" });
    if (!response.ok) await failWith(response, "Failed to delete the item");
  },
};
