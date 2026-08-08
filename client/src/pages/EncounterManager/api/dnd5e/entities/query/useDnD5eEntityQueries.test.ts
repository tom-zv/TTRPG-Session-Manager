import { act, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, test } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { MY_CHARACTER_KEYS } from "src/pages/Compendium/api/query/myCharacterKeys.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderHookWithProviders } from "src/test/render.js";
import { ENTITY_KEYS } from "./keys.js";
import { useDeleteDnD5eEntity, useUpdateDnD5eEntity } from "./useDnD5eEntityQueries.js";

const bram: DnD5eEntityDetails = {
  templateId: 11,
  name: "Bram",
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "pc",
  ac: 16,
  hp: 33,
  speeds: { walk: 30 },
  size: "medium",
  alignment: "neutral",
  abilityScores: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 10 },
};

const PLAYER_ID = 2;

// A player's list and sheet, as if this client had shown My characters before.
function seedAssignedPcs(queryClient: QueryClient) {
  queryClient.setQueryData(MY_CHARACTER_KEYS.list(PLAYER_ID), [{ templateId: bram.templateId, name: bram.name }]);
  queryClient.setQueryData(MY_CHARACTER_KEYS.detail(PLAYER_ID, bram.templateId), bram);
}

const isMarkedForRefresh = (queryClient: QueryClient) => [
  queryClient.getQueryState(MY_CHARACTER_KEYS.list(PLAYER_ID))?.isInvalidated,
  queryClient.getQueryState(MY_CHARACTER_KEYS.detail(PLAYER_ID, bram.templateId))?.isInvalidated,
];

describe("entity mutations and assigned-PC caches", () => {
  test("saving a template marks the assigned-PC list and sheets for a refresh", async () => {
    const saved = { ...bram, ac: 17 };
    server.use(http.put("/api/dnd5e/entities/:id", () => json({ entity: saved })));
    const { result, queryClient } = renderHookWithProviders(() => useUpdateDnD5eEntity());
    seedAssignedPcs(queryClient);

    await act(() => result.current.mutateAsync({ id: bram.templateId, data: saved }));

    await waitFor(() => expect(isMarkedForRefresh(queryClient)).toEqual([true, true]));
    expect(queryClient.getQueryData(ENTITY_KEYS.template(bram.templateId))).toEqual(saved);
  });

  test("deleting a template marks the assigned-PC list and sheets for a refresh", async () => {
    server.use(http.delete("/api/dnd5e/entities/:id", () => json({ success: true })));
    const { result, queryClient } = renderHookWithProviders(() => useDeleteDnD5eEntity());
    seedAssignedPcs(queryClient);

    await act(() => result.current.mutateAsync(bram.templateId));

    await waitFor(() => expect(isMarkedForRefresh(queryClient)).toEqual([true, true]));
  });
});
