import { waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, test } from "vitest";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import { apiError, json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderHookWithProviders } from "src/test/render.js";
import { SPELL_KEYS } from "./keys.js";
import { useSpellIndex } from "./useSpellQueries.js";

const magicMissile: SpellSummary = {
  id: 7,
  name: "Magic Missile",
  source: "PHB",
  level: 1,
  school: "evocation",
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  castingUnit: "action",
  components: { v: true, s: true, m: false },
  classes: ["wizard"],
  damageTypes: ["force"],
  saves: [],
  aliases: [],
};

describe("useSpellIndex", () => {
  test("loads the spell index and caches it under the index key", async () => {
    server.use(http.get("/api/dnd5e/spells", () => json({ spells: [magicMissile] })));

    const { result, queryClient } = renderHookWithProviders(() => useSpellIndex());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([magicMissile]);
    expect(queryClient.getQueryData(SPELL_KEYS.index())).toEqual([magicMissile]);
  });

  test("a failed response surfaces the server's message", async () => {
    server.use(http.get("/api/dnd5e/spells", () => apiError(500, "Spell table unavailable")));

    const { result } = renderHookWithProviders(() => useSpellIndex());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Spell table unavailable");
  });
});
