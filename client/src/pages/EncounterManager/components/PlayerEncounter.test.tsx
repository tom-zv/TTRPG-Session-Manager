import { useState } from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
  // The player's own character always shows exact HP.
  template(100, "Bram", "pc", [player.id]),
  // The player runs this NPC, yet the monster HP setting still decides what they see of it.
  template(101, "Captain Vex", "npc", [player.id]),
  template(102, "Lurker", "creature", [player.id]),
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
let history: Record<number, CurrentEncounterDTO[]>;
let currentRequests: number[];
let states: Record<number, DnD5eEncounterState>;

beforeEach(() => {
  installLayoutApis();
  localStorage.setItem(`ttrpg.lastCampaign.${player.id}`, String(ashes.id));
  current = { [ashes.id]: null, [brine.id]: null };
  history = { [ashes.id]: [], [brine.id]: [] };
  currentRequests = [];
  states = { [ambush.id]: fight(ambush.id), [bridge.id]: fight(bridge.id), [wreck.id]: fight(wreck.id) };
  server.use(
    http.get("/api/campaigns", () => json({ campaigns: [ashes, brine] })),
    http.get("/api/campaigns/:id/current-encounter", ({ params }) => {
      const campaignId = Number(params.id);
      currentRequests.push(campaignId);
      return json({ encounter: current[campaignId] });
    }),
    http.get("/api/campaigns/:id/encounter-history", ({ params }) => json({ encounters: history[Number(params.id)] })),
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
/** An entity row: the row itself is a pressable button whose name includes the entity's. */
const row = (name: string) => {
  const rows = encounterPage().getAllByRole("button", { name: new RegExp(name) }).filter((element) => element.hasAttribute("aria-pressed"));
  expect(rows).toHaveLength(1);
  return rows[0];
};
const navBar = () => within(document.querySelector<HTMLElement>("nav.nav-bar")!);
const damage = (encounterId: number, version: number, targetId: number, amount: number): EncounterOperation => ({
  encounterId, operationId: `op-${encounterId}-${version}`, version, createdAt: "2026-11-26T00:00:00.000Z",
  appliedEvents: [{ type: "damage", values: { targetId, sourceId: 0, amount } }],
});

describe("player board", () => {
  test("a start switches a player following Encounter from waiting to the board, with player visibility and the table's controls", async () => {
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
    // Nothing to prepare or advance. This player has characters in the fight, so every visible row
    // offers damage and healing.
    for (const name of [/Next Turn/i, /reset/i, /Add Entity/i, /Exit Encounter/i, /Start combat/i, /End combat/i, /More actions/i]) {
      expect(encounterPage().queryByRole("button", { name })).not.toBeInTheDocument();
    }
    for (const name of ["Bram", "Captain Vex"]) {
      expect(within(row(name)).getByRole("button", { name: `Deal damage to ${name}` })).toBeEnabled();
      expect(within(row(name)).getByRole("button", { name: `Heal ${name}` })).toBeEnabled();
    }

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
    await user.click(navBar().getByRole("link", { name: "Compendium" }));
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

    await user.selectOptions(navBar().getByRole("combobox", { name: "Campaign" }), String(brine.id));
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

describe("player actions and history", () => {
  type Request = { encounterId: number; requestedEvents: { type: string; values: Record<string, unknown> }[] };
  const requests = () => fakeSocket("/encounter").emitsOf("encounter:request").map(([request]) => request as Request);

  const openBoard = async (encounter = ambush) => {
    current[ashes.id] = encounter;
    renderShell(`/encounter-manager/${ashes.id}`);
    await waitFor(() => expect(document.getElementById("encounter-manager-page")).not.toBeNull());
    expect(await encounterPage().findByRole("heading", { name: encounter.name })).toBeInTheDocument();
    await waitFor(() => expect(within(row("Bram")).getByText("33")).toBeInTheDocument());
  };

  test("a player damages another visible target; with concealed HP the amount is confirmed and the HP stays concealed", async () => {
    const user = userEvent.setup();
    fakeSocket("/encounter").autoAck("encounter:request", () => ({ success: true }));
    await openBoard();

    const vex = within(row("Captain Vex"));
    // Typed in Chrome; under jsdom's zero-size layout the panel separator takes the pointer focus.
    fireEvent.change(vex.getByLabelText("HP amount"), { target: { value: "12" } });
    await user.click(vex.getByRole("button", { name: "Deal damage to Captain Vex" }));
    expect(requests().at(-1)).toEqual(expect.objectContaining({
      encounterId: ambush.id,
      requestedEvents: [{ type: "damage", values: { targetId: 1, amount: 12, sourceId: player.id } }],
    }));
    expect(await vex.findByText("Dealt 12 damage to Captain Vex.")).toBeInTheDocument();

    // The resulting operation changes the status at most; no number of the NPC is drawn.
    act(() => fakeSocket("/encounter").serverEmit("encounter:operation", {
      ...damage(ambush.id, 5, 1, 12), appliedEvents: [{ type: "damage", values: { targetId: 1, sourceId: player.id, amount: 12 } }],
    }));
    await waitFor(() => expect(within(row("Captain Vex")).getByText("Bloodied")).toBeInTheDocument());
    for (const hidden of ["19", "31", "40"]) expect(within(row("Captain Vex")).queryByText(hidden)).not.toBeInTheDocument();

    // Exact HP needs no confirmation: the row shows the new numbers.
    await user.click(within(row("Bram")).getByRole("button", { name: "Heal Bram" }));
    expect(requests().at(-1)?.requestedEvents).toEqual([{ type: "heal", values: { targetId: 0, amount: 5, sourceId: player.id } }]);
    expect(within(row("Bram")).queryByRole("status")).not.toBeInTheDocument();
  });

  test("a rejected damage is reported and confirms nothing", async () => {
    const user = userEvent.setup();
    fakeSocket("/encounter").autoAck("encounter:request", () => ({ success: false, error: "This encounter is no longer the campaign's current encounter" }));
    await openBoard();

    await user.click(within(row("Captain Vex")).getByRole("button", { name: "Deal damage to Captain Vex" }));
    expect(await encounterPage().findByText(/Action failed: This encounter is no longer/)).toBeInTheDocument();
    expect(within(row("Captain Vex")).queryByText(/Dealt/)).not.toBeInTheDocument();
  });

  test("a player sets their own character's current HP and initiative and nobody else's", async () => {
    fakeSocket("/encounter").autoAck("encounter:request", () => ({ success: true }));
    templates.push(template(103, "Cora", "pc", [7]));
    try {
      states[ambush.id] = fight(ambush.id, {
        entityStates: [...fight(ambush.id).entityStates, entity({ instanceId: 3, templateId: 103, maxHp: 30, currentHp: 30 })],
        initiativeOrder: [0, 1, 2, 3],
      });
      await openBoard();

      // Bram's initiative (20) and current HP (33) are editable; Cora's are plain text.
      fireEvent.keyDown(within(row("Bram")).getByRole("button", { name: "33" }), { key: "Enter" });
      const input = await within(row("Bram")).findByRole("textbox");
      fireEvent.change(input, { target: { value: "50" } });
      fireEvent.keyDown(input, { key: "Enter" });
      const hpChange = { type: "setCurrentHp", values: { targetId: 0, hp: 40 } } as const;
      expect(requests().at(-1)?.requestedEvents).toEqual([hpChange]);
      act(() => fakeSocket("/encounter").serverEmit("encounter:operation", {
        ...damage(ambush.id, 5, 0, 0), appliedEvents: [hpChange],
      }));
      await waitFor(() => expect(within(row("Bram")).getAllByText("40")).toHaveLength(2));
      fireEvent.keyDown(within(row("Bram")).getByRole("button", { name: "20" }), { key: "Enter" });
      const initiative = await within(row("Bram")).findByRole("textbox");
      fireEvent.change(initiative, { target: { value: "18" } });
      fireEvent.keyDown(initiative, { key: "Enter" });
      expect(requests().at(-1)?.requestedEvents).toEqual([{ type: "setInitiative", values: { targetId: 0, initiative: 18 } }]);
      expect(within(row("Cora")).queryByRole("button", { name: "30" })).not.toBeInTheDocument();
      expect(within(row("Cora")).queryByRole("button", { name: "20" })).not.toBeInTheDocument();
      expect(within(row("Cora")).getByText("20")).toBeInTheDocument();
      expect(within(row("Cora")).getAllByText("30")).toHaveLength(2);
      // Cora can still be damaged and healed: she is a visible target.
      expect(within(row("Cora")).getByRole("button", { name: "Deal damage to Cora" })).toBeEnabled();
    } finally {
      templates.pop();
    }
  });

  test("the player clicks Temporary HP to set it from zero and clear it on their own PC", async () => {
    const user = userEvent.setup();
    fakeSocket("/encounter").autoAck("encounter:request", () => ({ success: true }));
    await openBoard();
    for (const [previous, value, version] of [[0, 7, 5], [7, 0, 6]] as const) {
      await user.click(within(row("Bram")).getByRole("button", { name: `Temporary HP: ${previous}` }));
      const input = within(row("Bram")).getByRole("textbox", { name: "Temporary HP" });
      fireEvent.change(input, { target: { value: String(value) } });
      await user.keyboard("{Enter}");
      const event = { type: "setTempHp", values: { targetId: 0, tempHp: value, sourceId: player.id } } as const;
      expect(requests().at(-1)?.requestedEvents).toEqual([event]);
      act(() => fakeSocket("/encounter").serverEmit("encounter:operation", {
        ...damage(ambush.id, version, 0, 0), appliedEvents: [event],
      }));
      expect(await within(row("Bram")).findByRole("button", { name: `Temporary HP: ${value}` })).toBeInTheDocument();
    }
  });

  test.each(["status", "hidden"] as const)("a controlled NPC with %s HP has initiative and amount controls without HP values or death saves", async (monsterHp) => {
    states[ambush.id] = fight(ambush.id, {
      settings: resolveEncounterSettings({ visibility: { monsterHp } }),
      entityStates: fight(ambush.id).entityStates.map((candidate) => candidate.instanceId === 1
        ? { ...candidate, currentHp: 0, deathSaveSuccesses: 1, tempHp: 7 }
        : candidate),
    });
    templates[1].settings = { combat: { deathSaves: true } };
    try {
      await openBoard();
      const vex = within(row("Captain Vex"));
      expect(vex.getByRole("button", { name: "20" })).toBeEnabled();
      expect(vex.getByRole("button", { name: "Deal damage to Captain Vex" })).toBeEnabled();
      expect(vex.getByRole("button", { name: "Heal Captain Vex" })).toBeEnabled();
      expect(vex.queryByRole("button", { name: /Temporary HP|^0$|Set successes/ })).not.toBeInTheDocument();
      expect(vex.queryByRole("group", { name: /death save/ })).not.toBeInTheDocument();
      expect(vex.queryByText("40")).not.toBeInTheDocument();
      expect(vex.queryAllByText("Down")).toHaveLength(monsterHp === "status" ? 1 : 0);
    } finally {
      delete templates[1].settings;
    }
  });

  test.each(["status", "hidden"] as const)("the grave applies %s NPC HP and exact PC HP on the current and past boards", async (monsterHp) => {
    const user = userEvent.setup();
    const entities = fight(ambush.id).entityStates;
    states[ambush.id] = fight(ambush.id, {
      settings: resolveEncounterSettings({ visibility: { monsterHp } }),
      entityStates: [{ ...entities[0], inGrave: true }, { ...entities[1], inGrave: true, currentHp: 0 }, entities[2]],
      initiativeOrder: [2], currentTurn: 0,
    });
    await openBoard();

    const checkGrave = () => {
      const grave = within(encounterPage().getByRole("region", { name: "Grave" }));
      const npc = within(grave.getByRole("button", { name: "Captain Vex, in the grave" }));
      const pc = within(grave.getByRole("button", { name: "Bram, in the grave" }));
      expect(npc.queryAllByText("Down")).toHaveLength(monsterHp === "status" ? 1 : 0);
      expect(npc.queryAllByText("HP")).toHaveLength(monsterHp === "status" ? 1 : 0);
      for (const concealed of ["0", "40", "AC"]) expect(npc.queryByText(concealed)).not.toBeInTheDocument();
      for (const exact of ["33", "40", "AC"]) expect(pc.getByText(exact)).toBeInTheDocument();
      expect(grave.queryByRole("button", { name: /Heal|Deal damage|Temporary HP|Restore|^33$/ })).not.toBeInTheDocument();
    };
    checkGrave();

    history[ashes.id] = [ambush];
    states[ambush.id] = { ...states[ambush.id], phase: "ended" };
    await user.click(encounterPage().getByRole("button", { name: "Past fights" }));
    await user.click(await encounterPage().findByRole("link", { name: ambush.name }));
    expect(await encounterPage().findByText(/This is a past fight/)).toBeInTheDocument();
    await waitFor(checkGrave);
  });

  test("a player whose only controlled combatants are buried or hidden watches until a GM restoration", async () => {
    const entities = fight(ambush.id).entityStates;
    templates.push(template(103, "Cora", "pc", [7]));
    try {
      states[ambush.id] = fight(ambush.id, {
        entityStates: [{ ...entities[0], inGrave: true }, { ...entities[1], inGrave: true }, entities[2],
          entity({ instanceId: 3, templateId: 103, maxHp: 30, currentHp: 30 })],
        initiativeOrder: [2, 3], currentTurn: 1,
      });
      await openBoard();
      expect(encounterPage().queryByRole("button", { name: /Deal damage|^Heal/ })).not.toBeInTheDocument();
      act(() => fakeSocket("/encounter").serverEmit("encounter:operation", {
        ...damage(ambush.id, 5, 0, 0),
        appliedEvents: [{ type: "restoreFromGrave", values: { targetId: 0, hp: 10 } }],
      }));
      expect(await encounterPage().findByRole("button", { name: "Deal damage to Cora" })).toBeEnabled();
    } finally {
      templates.pop();
    }
  });

  test("a player with no character in the fight only watches", async () => {
    const own = templates.map((candidate) => candidate.controllerUserIds);
    for (const candidate of templates) candidate.controllerUserIds = [];
    try {
      await openBoard();
      expect(encounterPage().queryByRole("button", { name: /Deal damage|^Heal/ })).not.toBeInTheDocument();
      expect(within(row("Bram")).queryAllByRole("button")).toEqual([]);
    } finally {
      templates.forEach((candidate, index) => { candidate.controllerUserIds = own[index]; });
    }
  });

  test("own death saves can be marked while making them", async () => {
    const user = userEvent.setup();
    fakeSocket("/encounter").autoAck("encounter:request", () => ({ success: true }));
    states[ambush.id] = fight(ambush.id, {
      entityStates: fight(ambush.id).entityStates.map((candidate) => candidate.instanceId === 0 ? { ...candidate, currentHp: 0 } : candidate),
    });
    current[ashes.id] = ambush;
    renderShell(`/encounter-manager/${ashes.id}`);
    await waitFor(() => expect(document.getElementById("encounter-manager-page")).not.toBeNull());
    await user.click(await encounterPage().findByRole("button", { name: "Set successes to 1" }));
    expect(requests().at(-1)?.requestedEvents).toEqual([{ type: "setDeathSaves", values: { targetId: 0, successes: 1, failures: 0 } }]);
  });

  test("the ended board and a past fight are read-only; a start while viewing history offers Open encounter; Encounter returns to the board", async () => {
    const user = userEvent.setup();
    states[ambush.id] = fight(ambush.id, { phase: "ended" });
    history[ashes.id] = [ambush];
    await openBoard();
    expect(encounterPage().getByText(/Combat has ended/)).toBeInTheDocument();
    expect(encounterPage().queryByRole("button", { name: /Deal damage|^Heal/ })).not.toBeInTheDocument();
    // After End even the player's own values are fixed.
    expect(within(row("Bram")).queryByRole("button", { name: /^33$|^20$|Temporary HP/ })).not.toBeInTheDocument();
    expect(within(row("Bram")).getByText("20")).toBeInTheDocument();

    // History is opened explicitly; a planned encounter is never listed (the server decides).
    await user.click(encounterPage().getByRole("button", { name: "Past fights" }));
    await user.click(await encounterPage().findByRole("link", { name: "Ambush at the ford" }));
    expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}/${ambush.id}`);
    expect(await encounterPage().findByText(/This is a past fight/)).toBeInTheDocument();
    // Nothing to change: no HP actions and no editable values, not even the player's own.
    expect(within(row("Bram")).queryByRole("button", { name: /Deal damage|^Heal|^33$|^20$/ })).not.toBeInTheDocument();
    expect(encounterPage().queryByLabelText("HP amount")).not.toBeInTheDocument();

    // The GM starts Bridge: the past fight stays on screen and the start is offered.
    current[ashes.id] = bridge;
    await signal(ashes.id);
    const notice = await screen.findByRole("status", { name: "New encounter" });
    expect(notice).toHaveTextContent("Ashes: the GM started Bridge of bones.");
    expect(encounterPage().getByRole("heading", { name: "Ambush at the ford" })).toBeInTheDocument();
    await user.click(within(notice).getByRole("button", { name: "Open encounter" }));
    expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}`);
    expect(await encounterPage().findByRole("heading", { name: "Bridge of bones" })).toBeInTheDocument();

    // Back in history, the Encounter tab leads to the current board.
    await user.click(encounterPage().getByRole("button", { name: "Past fights" }));
    await user.click(await encounterPage().findByRole("link", { name: "Ambush at the ford" }));
    expect(await encounterPage().findByText(/This is a past fight/)).toBeInTheDocument();
    await user.click(navBar().getByRole("link", { name: "Encounter" }));
    await waitFor(() => expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}`));
    expect(await encounterPage().findByRole("heading", { name: "Bridge of bones" })).toBeInTheDocument();
  });

  test("a past fight that the GM reopens leaves history; an encounter outside history is refused", async () => {
    states[ambush.id] = fight(ambush.id, { phase: "ended" });
    history[ashes.id] = [ambush];
    current[ashes.id] = bridge;
    renderShell(`/encounter-manager/${ashes.id}/${ambush.id}`);
    await waitFor(() => expect(document.getElementById("encounter-manager-page")).not.toBeNull());
    expect(await encounterPage().findByText(/This is a past fight/)).toBeInTheDocument();

    history[ashes.id] = [];
    act(() => fakeSocket("/encounter").serverEmit("encounter:operation", {
      encounterId: ambush.id, operationId: "reset", version: 5, createdAt: "2026-11-26T00:00:00.000Z",
      appliedEvents: [{ type: "resetEncounter", values: {} }],
    }));
    expect(await encounterPage().findByText("This encounter is not one of Ashes's past fights.")).toBeInTheDocument();
    expect(encounterPage().queryByRole("button", { name: /Bram/ })).not.toBeInTheDocument();
  });
});
