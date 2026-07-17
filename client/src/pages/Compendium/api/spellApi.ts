import type { Spell, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

export interface SpellCaster {
  id: number;
  name: string;
}

async function getJson<T>(url: string, failure: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: authenticatedJsonHeaders(),
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: failure }));
    throw new Error(error.message || failure);
  }
  return response.json() as Promise<T>;
}

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
};
