import type { Spell, SpellInput, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

export interface SpellCaster {
  id: number;
  name: string;
}

async function requestJson<T>(url: string, failure: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    ...init,
    headers: authenticatedJsonHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: failure }));
    throw new Error(error.message || failure);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const getJson = requestJson;

export const SpellApi = {
  /** Every spell as a summary; the browser filters on the client. */
  async getIndex(): Promise<SpellSummary[]> {
    const data = await getJson<{ spells: SpellSummary[] }>("/api/dnd5e/spells", "Failed to load spells");
    return data.spells;
  },

  async getSpell(id: number): Promise<Spell> {
    const data = await getJson<{ spell: Spell }>(`/api/dnd5e/spells/${id}`, "Failed to load the spell");
    return data.spell;
  },

  /** GM only: entities whose spell lists name the spell. */
  async getCasters(id: number): Promise<SpellCaster[]> {
    const data = await getJson<{ entities: SpellCaster[] }>(
      `/api/dnd5e/spells/${id}/casters`,
      "Failed to load the spell's casters"
    );
    return data.entities;
  },

  async createSpell(input: SpellInput): Promise<Spell> {
    const data = await requestJson<{ spell: Spell }>("/api/dnd5e/spells", "Failed to create the spell", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return data.spell;
  },

  async updateSpell(id: number, input: SpellInput): Promise<Spell> {
    const data = await requestJson<{ spell: Spell }>(`/api/dnd5e/spells/${id}`, "Failed to save the spell", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    return data.spell;
  },

  async deleteSpell(id: number): Promise<void> {
    await requestJson<void>(`/api/dnd5e/spells/${id}`, "Failed to delete the spell", { method: "DELETE" });
  },
};
