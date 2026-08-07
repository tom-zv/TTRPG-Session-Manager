import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

// A player's assigned player characters. Players read character sheets only through these
// endpoints, which the server limits to PCs assigned to the signed-in user.

async function get(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, { method: "GET", headers: authenticatedJsonHeaders(), credentials: "include", signal });
}

async function failWith(response: Response, failure: string): Promise<never> {
  const error = await response.json().catch(() => ({ message: failure }));
  throw new Error(error.message || failure);
}

export const MyCharacterApi = {
  async getSummaries(signal?: AbortSignal): Promise<DnD5eEntitySummary[]> {
    const response = await get("/api/dnd5e/entities/mine", signal);
    if (!response.ok) return failWith(response, "Failed to load your characters");
    const data = (await response.json()) as { entities: DnD5eEntitySummary[] };
    return data.entities;
  },

  /** The character sheet, or null when it is not (or no longer) assigned to the user. */
  async getCharacter(id: number, signal?: AbortSignal): Promise<DnD5eEntityDetails | null> {
    const response = await get(`/api/dnd5e/entities/mine/${id}`, signal);
    if (response.status === 404) return null;
    if (!response.ok) return failWith(response, "Failed to load the character");
    const data = (await response.json()) as { entity: DnD5eEntityDetails };
    return data.entity;
  },
};
