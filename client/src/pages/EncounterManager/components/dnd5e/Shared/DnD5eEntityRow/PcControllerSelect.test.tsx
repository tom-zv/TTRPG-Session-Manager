import { screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { describe, expect, test } from "vitest";
import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { entity as entityState } from "shared/domain/encounters/dnd5e/testSupport.js";
import { MY_CHARACTER_KEYS } from "src/pages/Compendium/api/query/myCharacterKeys.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders } from "src/test/render.js";
import { PcControllerSelect } from "./PcControllerSelect.js";

const bram: DnD5eEntity = {
  ...entityState({ templateId: 11 }),
  name: "Bram",
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "pc",
  ac: 16,
  hp: 33,
  speeds: { walk: 30 },
  size: "medium",
  alignment: "neutral",
  abilityScores: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 10 },
  source: "homebrew",
  imported: false,
  locallyEdited: false,
  controllerUserIds: [],
};

describe("PcControllerSelect", () => {
  // Bram's template is not cached here, so only the assigned-PC refresh can bring the change in.
  test("assigning a player marks the assigned-PC lists and sheets for a refresh", async () => {
    const user = userEvent.setup();
    const assignments: number[][] = [];
    server.use(
      http.get("/api/users", () => json({ users: [{ id: 2, username: "player", isGm: false }] })),
      http.put("/api/dnd5e/entities/:id/controllers", async ({ request }) => {
        const { userIds } = (await request.json()) as { userIds: number[] };
        assignments.push(userIds);
        return json({ controllerUserIds: userIds });
      })
    );
    const { queryClient } = renderWithProviders(<PcControllerSelect entity={bram} />);
    queryClient.setQueryData(MY_CHARACTER_KEYS.list(2), []);
    queryClient.setQueryData(MY_CHARACTER_KEYS.detail(2, bram.templateId), null);

    await user.selectOptions(await screen.findByLabelText("Played by"), await screen.findByRole("option", { name: "player" }));

    await waitFor(() => expect(assignments).toEqual([[2]]));
    await waitFor(() => expect(queryClient.getQueryState(MY_CHARACTER_KEYS.list(2))?.isInvalidated).toBe(true));
    expect(queryClient.getQueryState(MY_CHARACTER_KEYS.detail(2, bram.templateId))?.isInvalidated).toBe(true);
  });
});
