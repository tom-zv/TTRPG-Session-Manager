import { useState } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CampaignDTO, CurrentEncounterDTO } from "shared/DTO/campaigns/types.js";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import type { EncounterOperation } from "shared/sockets/encounters/types.js";
import { entity, state } from "shared/domain/encounters/dnd5e/testSupport.js";
import { resolveEncounterSettings } from "shared/domain/encounters/dnd5e/settings.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { currentUrl, RouterProbe } from "src/test/routerProbe.js";
import { fakeSocket, resetFakeSockets } from "src/test/fakes/socket.js";
import { installLayoutApis } from "src/test/fakes/matchMedia.js";
import { AppRoutes } from "src/app/router.js";

vi.mock("src/services/SocketService/socket.js", async () => (await import("src/test/fakes/socket.js")).socketModule);

/** Stands in for Compendium browsing state: what was typed must survive a start elsewhere. */
function BrowsingCompendium() {
  const [query, setQuery] = useState("");
  return <label>Search compendium<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>;
}
vi.mock("src/pages/Compendium/components/Compendium.js", () => ({ Compendium: BrowsingCompendium }));

const player = testUser({ id: 2, username: "table-player", isGm: false });
const ashes: CampaignDTO = { id: 11, name: "Ashes", description: "" };
const brine: CampaignDTO = { id: 12, name: "Brine", description: "" };

const details = (id: number, campaignId: number, name: string): CurrentEncounterDTO => ({
  id, system: "dnd5e", campaignId, name, description: "", location: "", difficulty: "", status: "active",
  createdAt: "2026-11-01T00:00:00.000Z",
});
const ambush = details(101, ashes.id, "Ambush at the ford");
const bridge = details(102, ashes.id, "Bridge of bones");
const wreck = details(201, brine.id, "Wreck of the Gull");

const template = (templateId: number, name: string, role: DnD5eEntityDetails["role"], controllerUserIds: number[] = []): DnD5eEntityDetails => ({
  templateId, name, role, controllerUserIds, createdAt: "2026-01-01T00:00:00.000Z", source: "homebrew", imported: false,
  locallyEdited: false, ac: 15, hp: 40, speeds: { walk: 30 }, size: "medium", alignment: "neutral",
  abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
});
const templates = [
  // The player's own character: exact HP, but this board offers no way to change it.
  template(100, "Bram", "pc", [player.id]),
  // The player runs this NPC, yet the monster HP setting still decides what they see of it.
  template(101, "Captain Vex", "npc", [player.id]),
  template(102, "Lurker", "creature"),
];

/** A running fight in which the hidden Lurker holds the turn. */
const fight = (id: number, overrides: Partial<DnD5eEncounterState> = {}): DnD5eEncounterState => state(3, {
  id,
  version: 4,
  currentTurn: 2,
  settings: resolveEncounterSettings({ visibility: { monsterHp: "status" } }),
  entityStates: [
    entity({ instanceId: 0, templateId: 100, maxHp: 40, currentHp: 33 }),
    entity({ instanceId: 1, templateId: 101, maxHp: 40, currentHp: 31 }),
    entity({ instanceId: 2, templateId: 102, maxHp: 40, currentHp: 40, hidden: true }),
  ],
  ...overrides,
});

let current: Record<number, CurrentEncounterDTO | null>;
let currentRequests: number[];
let states: Record<number, DnD5eEncounterState>;

beforeEach(() => {
  installLayoutApis();
  localStorage.setItem(`ttrpg.lastCampaign.${player.id}`, String(ashes.id));
  current = { [ashes.id]: null, [brine.id]: null };
  currentRequests = [];
  states = { [ambush.id]: fight(ambush.id), [bridge.id]: fight(bridge.id), [wreck.id]: fight(wreck.id) };
  server.use(
    http.get("/api/campaigns", () => json({ campaigns: [ashes, brine] })),
    http.get("/api/campaigns/:id/current-encounter", ({ params }) => {
      const campaignId = Number(params.id);
      currentRequests.push(campaignId);
      return json({ encounter: current[campaignId] });
    }),
    http.post("/api/dnd5e/entities/batch", () => json({ entities: templates })),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: [] })),
  );
  const socket = fakeSocket("/encounter");
  socket.autoAck("campaign:watch", () => ({ success: true }));
  socket.autoAck("encounter:leave", () => ({ success: true }));
  socket.autoAck("encounter:join", (payload) => {
    const { encounterId } = payload as { encounterId: number };
    return { success: true, encounterState: structuredClone(states[encounterId]) };
  });
});

afterEach(() => resetFakeSockets());

const renderShell = (route: string) =>
  renderWithProviders(<><AppRoutes /><RouterProbe /></>, { route, user: player, sessionToken: "player-token" });

const encounterPage = () => within(document.getElementById("encounter-manager-page")!);
const signal = (campaignId: number) =>
  act(() => fakeSocket("/encounter").serverEmit("campaign:currentEncounterChanged", { campaignId }));
const row = (name: string) => encounterPage().getByRole("button", { name: new RegExp(name) });
const damage = (encounterId: number, version: number, targetId: number, amount: number): EncounterOperation => ({
  encounterId, operationId: `op-${encounterId}-${version}`, version, createdAt: "2026-11-26T00:00:00.000Z",
  appliedEvents: [{ type: "damage", values: { targetId, sourceId: 0, amount } }],
});

describe("player board", () => {
  test("a start switches a player following Encounter from waiting to a read-only board with player visibility", async () => {
    renderShell(`/encounter-manager/${ashes.id}`);
    await waitFor(() => expect(document.getElementById("encounter-manager-page")).not.toBeNull());
    expect(await encounterPage().findByText("Waiting for the GM to start an encounter.")).toBeInTheDocument();

    current[ashes.id] = ambush;
    await signal(ashes.id);
    expect(await encounterPage().findByRole("heading", { name: "Ambush at the ford" })).toBeInTheDocument();
    expect(await encounterPage().findByText("Current turn: Hidden combatant")).toBeInTheDocument();

    // Hidden rows stay off the board; the PC shows exact HP and the controlled NPC follows the setting.
    expect(encounterPage().queryByRole("button", { name: /Lurker/ })).not.toBeInTheDocument();
    expect(encounterPage().queryByText("Lurker")).not.toBeInTheDocument();
    expect(within(row("Bram")).getByText("33")).toBeInTheDocument();
    expect(within(row("Captain Vex")).getByText("Healthy")).toBeInTheDocument();
    expect(within(row("Captain Vex")).queryByText("31")).not.toBeInTheDocument();
    // Nothing to prepare, edit or run.
    for (const name of [/Next Turn/i, /reset/i, /Add Entity/i, /Exit Encounter/i, /Start combat/i, /End combat/i, /More actions/i, /Deal damage/i, /^Heal/i]) {
      expect(encounterPage().queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(encounterPage().queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(within(row("Bram")).queryAllByRole("button")).toEqual([]);
    expect(within(row("Captain Vex")).queryAllByRole("button")).toEqual([]);

    // An ordinary combat update arrives on the board's stream and navigates nowhere.
    act(() => fakeSocket("/encounter").serverEmit("encounter:operation", damage(ambush.id, 5, 0, 3)));
    expect(await within(row("Bram")).findByText("30")).toBeInTheDocument();
    expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}`);

    // B replaces A; a delayed packet of A cannot paint B.
    current[ashes.id] = bridge;
    await signal(ashes.id);
    expect(await encounterPage().findByRole("heading", { name: "Bridge of bones" })).toBeInTheDocument();
    await waitFor(() => expect(within(row("Bram")).getByText("33")).toBeInTheDocument());
    act(() => fakeSocket("/encounter").serverEmit("encounter:operation", damage(ambush.id, 5, 0, 10)));
    act(() => fakeSocket("/encounter").serverEmit("encounter:operation", damage(ambush.id, 6, 0, 10)));
    expect(within(row("Bram")).getByText("33")).toBeInTheDocument();

    // Reset or deletion of the current board returns the player to waiting.
    current[ashes.id] = null;
    await signal(ashes.id);
    expect(await encounterPage().findByText("Waiting for the GM to start an encounter.")).toBeInTheDocument();
  });

  test("a start while browsing Compendium offers Open encounter and leaves the browsing state as it was", async () => {
    const user = userEvent.setup();
    current[ashes.id] = ambush;
    renderShell("/compendium");
    const search = await screen.findByLabelText("Search compendium");
    await user.type(search, "goblin");
    await waitFor(() => expect(currentRequests).toContain(ashes.id));
    expect(screen.queryByRole("button", { name: "Open encounter" })).not.toBeInTheDocument();

    current[ashes.id] = bridge;
    await signal(ashes.id);
    const notice = await screen.findByRole("status", { name: "New encounter" });
    expect(notice).toHaveTextContent("Ashes: the GM started Bridge of bones.");
    await act(async () => {});
    expect(currentUrl()).toBe("/compendium");
    expect(screen.getByLabelText("Search compendium")).toHaveValue("goblin");

    await user.click(within(notice).getByRole("button", { name: "Open encounter" }));
    expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}`);
    expect(await encounterPage().findByRole("heading", { name: "Bridge of bones" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "New encounter" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Search compendium")).toHaveValue("goblin");
  });

  test("a start missed while disconnected is offered after the reconnect and shown on return", async () => {
    current[ashes.id] = ambush;
    renderShell("/compendium");
    await waitFor(() => expect(currentRequests).toContain(ashes.id));
    const socket = fakeSocket("/encounter");
    await waitFor(() => expect(socket.emitsOf("campaign:watch")).toContainEqual([{ campaignId: ashes.id }]));

    act(() => socket.serverDisconnect());
    current[ashes.id] = bridge;
    act(() => socket.serverConnect());

    const notice = await screen.findByRole("status", { name: "New encounter" });
    expect(notice).toHaveTextContent("Bridge of bones");
    await userEvent.setup().click(within(notice).getByRole("button", { name: "Open encounter" }));
    expect(await encounterPage().findByRole("heading", { name: "Bridge of bones" })).toBeInTheDocument();
  });

  test.each(["a change signal", "a successful watch"])("%s during the first read is followed by a read that starts after it", async (source) => {
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
    server.use(http.get("/api/campaigns/:id/current-encounter", async ({ params }) => {
      const campaignId = Number(params.id);
      // The answer is fixed when the read starts, as a server that read before the Start would be.
      const encounter = current[campaignId];
      if (currentRequests.push(campaignId) === 1) await firstHeld;
      return json({ encounter });
    }));
    const socket = fakeSocket("/encounter");
    // Without a connection there is no watch until the test connects.
    if (source === "a successful watch") socket.serverDisconnect();
    renderShell(`/encounter-manager/${ashes.id}`);
    await waitFor(() => expect(currentRequests).toHaveLength(1));

    current[ashes.id] = ambush;
    if (source === "a successful watch") act(() => socket.serverConnect());
    else await signal(ashes.id);
    releaseFirst();

    await waitFor(() => expect(document.getElementById("encounter-manager-page")).not.toBeNull());
    expect(await encounterPage().findByRole("heading", { name: "Ambush at the ford" })).toBeInTheDocument();
  });

  test("the same encounter started again after a wait is offered again, and a dismissal lasts while it stays current", async () => {
    const user = userEvent.setup();
    current[ashes.id] = ambush;
    const { queryClient } = renderShell("/compendium");
    const search = await screen.findByLabelText("Search compendium");
    await user.type(search, "goblin");
    /** Change the selection, signal it and wait until the player has the new answer. */
    const select = async (encounter: CurrentEncounterDTO | null) => {
      const reads = currentRequests.length;
      current[ashes.id] = encounter;
      await signal(ashes.id);
      await waitFor(() => expect(currentRequests.length).toBeGreaterThan(reads));
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    };
    const notice = () => screen.queryByRole("status", { name: "New encounter" });
    await waitFor(() => expect(currentRequests).toContain(ashes.id));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));

    // The first answer is not news; the same encounter after a reset is.
    expect(notice()).not.toBeInTheDocument();
    await select(null);
    expect(notice()).not.toBeInTheDocument();
    await select(ambush);
    expect(await screen.findByRole("status", { name: "New encounter" })).toHaveTextContent("Ambush at the ford");

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    await select(ambush);
    expect(notice()).not.toBeInTheDocument();

    await select(null);
    await select(ambush);
    expect(await screen.findByRole("status", { name: "New encounter" })).toHaveTextContent("Ambush at the ford");
    expect(currentUrl()).toBe("/compendium");
    expect(screen.getByLabelText("Search compendium")).toHaveValue("goblin");
  });

  test("a replaced encounter that becomes current again is offered although the replacement's notice got no action", async () => {
    const user = userEvent.setup();
    current[ashes.id] = ambush;
    const { queryClient } = renderShell("/compendium");
    const search = await screen.findByLabelText("Search compendium");
    await user.type(search, "goblin");
    /** Change the selection, signal it and wait until the player has the new answer. */
    const select = async (encounter: CurrentEncounterDTO) => {
      const reads = currentRequests.length;
      current[ashes.id] = encounter;
      await signal(ashes.id);
      await waitFor(() => expect(currentRequests.length).toBeGreaterThan(reads));
      await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    };
    await waitFor(() => expect(currentRequests).toContain(ashes.id));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(screen.queryByRole("status", { name: "New encounter" })).not.toBeInTheDocument();

    await select(bridge);
    expect(await screen.findByRole("status", { name: "New encounter" })).toHaveTextContent("Bridge of bones");
    await select(ambush);
    expect(await screen.findByRole("status", { name: "New encounter" })).toHaveTextContent("Ambush at the ford");
    expect(currentUrl()).toBe("/compendium");
    expect(screen.getByLabelText("Search compendium")).toHaveValue("goblin");

    await user.click(screen.getByRole("button", { name: "Open encounter" }));
    expect(await encounterPage().findByRole("heading", { name: "Ambush at the ford" })).toBeInTheDocument();
    expect(screen.getByLabelText("Search compendium")).toHaveValue("goblin");

    // A replacement watched on the board is not offered afterwards.
    await select(bridge);
    expect(await encounterPage().findByRole("heading", { name: "Bridge of bones" })).toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation")).getByRole("link", { name: "Compendium" }));
    expect(currentUrl()).toBe("/compendium");
    expect(screen.queryByRole("status", { name: "New encounter" })).not.toBeInTheDocument();
  });

  test("after switching campaigns, a late answer or signal of the first campaign never replaces the second's board", async () => {
    const user = userEvent.setup();
    let releaseAshes!: () => void;
    const ashesHeld = new Promise<void>((resolve) => { releaseAshes = resolve; });
    current[ashes.id] = ambush;
    current[brine.id] = wreck;
    server.use(http.get("/api/campaigns/:id/current-encounter", async ({ params }) => {
      const campaignId = Number(params.id);
      currentRequests.push(campaignId);
      if (campaignId === ashes.id) await ashesHeld;
      return json({ encounter: current[campaignId] });
    }));
    renderShell(`/encounter-manager/${ashes.id}`);
    await waitFor(() => expect(currentRequests).toContain(ashes.id));

    await user.selectOptions(within(screen.getByRole("navigation")).getByRole("combobox", { name: "Campaign" }), String(brine.id));
    expect(await encounterPage().findByRole("heading", { name: "Wreck of the Gull" })).toBeInTheDocument();

    releaseAshes();
    current[ashes.id] = bridge;
    await signal(ashes.id);
    await waitFor(() => expect(currentRequests.filter((id) => id === ashes.id).length).toBeGreaterThan(0));
    expect(encounterPage().getByRole("heading", { name: "Wreck of the Gull" })).toBeInTheDocument();
    expect(encounterPage().queryByRole("heading", { name: /Ambush|Bridge/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "New encounter" })).not.toBeInTheDocument();
    expect(fakeSocket("/encounter").emitsOf("campaign:watch").at(-1)).toEqual([{ campaignId: brine.id }]);
  });
});
