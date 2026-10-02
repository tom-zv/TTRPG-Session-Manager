import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { CampaignDTO } from "shared/DTO/campaigns/types.js";
import type { DnD5eEncounterSummary } from "shared/domain/encounters/dnd5e/encounter.js";
import type { User } from "src/api/types.js";
import { json, apiError } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { currentUrl, go, RouterProbe } from "src/test/routerProbe.js";
import { ENCOUNTER_KEYS } from "src/pages/EncounterManager/api/dnd5e/encounters/query/keys.js";
import { AppRoutes } from "./router.js";

vi.mock("src/services/SocketService/socket.js", async () => (await import("src/test/fakes/socket.js")).socketModule);
// Sections outside campaign selection only show where the app landed; the live board has its own suites.
vi.mock("src/pages/SoundManager/components/SoundManager.js", () => ({ default: () => null }));
vi.mock("src/pages/Compendium/components/Compendium.js", () => ({ Compendium: () => <p>Compendium section</p> }));
vi.mock("src/pages/EncounterManager/components/dnd5e/LiveEncounter/LiveEncounterView.js", () => ({
  LiveEncounter: ({ campaignId, encounterId }: { campaignId: number; encounterId: number }) =>
    <p>{`Live encounter ${encounterId} of campaign ${campaignId}`}</p>,
}));

const gm = testUser({ id: 1, username: "table-gm", isGm: true });
const otherGm = testUser({ id: 3, username: "second-gm", isGm: true });
const player = testUser({ id: 2, username: "table-player", isGm: false });

const ashes: CampaignDTO = { id: 11, name: "Ashes", description: "" };
const brine: CampaignDTO = { id: 12, name: "Brine", description: "" };

const encounter = (id: number, campaignId: number, name: string): DnD5eEncounterSummary => ({
  id, campaignId, name, system: "dnd5e", description: "", status: "planned", location: "", difficulty: "medium",
  createdAt: "2026-11-01T00:00:00.000Z", entityCount: 0,
});
const encountersByCampaign: Record<number, DnD5eEncounterSummary[]> = {
  [ashes.id]: [encounter(101, ashes.id, "Ambush at the ford")],
  [brine.id]: [encounter(201, brine.id, "Wreck of the Gull")],
};

let campaignsByUser: Record<number, CampaignDTO[]>;
let summaryRequests: number[];

beforeEach(() => {
  campaignsByUser = { [gm.id]: [ashes, brine], [otherGm.id]: [ashes, brine], [player.id]: [brine] };
  summaryRequests = [];
  server.use(
    http.get("/api/campaigns", ({ request }) => {
      const token = request.headers.get("Authorization")?.replace("Bearer ", "");
      const user = token === "player-token" ? player : token === "other-gm-token" ? otherGm : gm;
      return json({ campaigns: campaignsByUser[user.id] });
    }),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: [] })),
    http.get("/api/dnd5e/encounters/summaries", ({ request }) => {
      const campaignId = Number(new URL(request.url).searchParams.get("campaignId"));
      summaryRequests.push(campaignId);
      return json({ encounters: encountersByCampaign[campaignId] ?? [] });
    }),
    http.get("/api/users", () => json({ users: [] })),
    http.get("/api/campaigns/:id/members", () => json({ members: [] })),
    // No board has been started in any campaign; the player board has its own suite.
    http.get("/api/campaigns/:id/current-encounter", () => json({ encounter: null })),
  );
});

/** The encounter section, once the session has loaded and the shell has mounted it. */
const encounterPage = async () => within(await waitFor(() => {
  const page = document.getElementById("encounter-manager-page");
  if (!page) throw new Error("The encounter section is not mounted yet");
  return page;
}));
const switcher = () => within(screen.getByRole("navigation")).getByRole("combobox", { name: "Campaign" });
const stored = (user: User) => localStorage.getItem(`ttrpg.lastCampaign.${user.id}`);
const tokens: Record<number, string> = { [gm.id]: "gm-token", [otherGm.id]: "other-gm-token", [player.id]: "player-token" };
const renderShell = (route: string, user: User) =>
  renderWithProviders(<><AppRoutes /><RouterProbe /></>, { route, user, sessionToken: tokens[user.id] });

describe("campaign selection", () => {
  test("the last campaign chosen in this browser opens prep, and the list is that campaign's", async () => {
    localStorage.setItem(`ttrpg.lastCampaign.${gm.id}`, String(brine.id));
    renderShell("/encounter-manager", gm);

    expect(await (await encounterPage()).findByText("Wreck of the Gull")).toBeInTheDocument();
    expect(currentUrl()).toBe(`/encounter-manager/${brine.id}`);
    expect((await encounterPage()).getByRole("heading", { name: "Brine" })).toBeInTheDocument();
    expect((await encounterPage()).queryByText("Ambush at the ford")).not.toBeInTheDocument();
    expect(switcher()).toHaveDisplayValue("Brine");
    expect(summaryRequests).toEqual([brine.id]);
  });

  test("a permitted deep link overrides the last choice and becomes it", async () => {
    localStorage.setItem(`ttrpg.lastCampaign.${gm.id}`, String(brine.id));
    renderShell(`/encounter-manager/${ashes.id}`, gm);

    expect(await (await encounterPage()).findByText("Ambush at the ford")).toBeInTheDocument();
    expect(switcher()).toHaveDisplayValue("Ashes");
    await waitFor(() => expect(stored(gm)).toBe(String(ashes.id)));
    expect(summaryRequests).toEqual([ashes.id]);
  });

  test("a stale stored campaign is ignored and the GM chooses; choosing records it", async () => {
    const user = userEvent.setup();
    localStorage.setItem(`ttrpg.lastCampaign.${gm.id}`, "99");
    renderShell("/encounter-manager", gm);

    expect(await (await encounterPage()).findByRole("heading", { name: "Choose a campaign" })).toBeInTheDocument();
    expect(summaryRequests).toEqual([]);
    await user.click((await encounterPage()).getByRole("button", { name: "Ashes" }));

    expect(await (await encounterPage()).findByText("Ambush at the ford")).toBeInTheDocument();
    expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}`);
    expect(stored(gm)).toBe(String(ashes.id));
  });

  test("a URL for a campaign the account cannot open shows nothing of it", async () => {
    localStorage.setItem(`ttrpg.lastCampaign.${player.id}`, String(brine.id));
    renderShell(`/encounter-manager/${ashes.id}`, player);

    expect(await (await encounterPage()).findByRole("alert")).toHaveTextContent("This campaign is not available to you.");
    expect((await encounterPage()).getByRole("link", { name: "Open Brine" })).toHaveAttribute("href", `/encounter-manager/${brine.id}`);
    expect(switcher()).toHaveDisplayValue("Brine");
    expect(stored(player)).toBe(String(brine.id));
    expect(summaryRequests).toEqual([]);
  });

  test("a player whose stored campaign was withdrawn lands on their only membership", async () => {
    localStorage.setItem(`ttrpg.lastCampaign.${player.id}`, String(ashes.id));
    renderShell("/encounter-manager", player);

    expect(await (await encounterPage()).findByRole("status")).toHaveTextContent("Waiting for the GM to start an encounter.");
    expect((await encounterPage()).getByRole("heading", { name: "Brine" })).toBeInTheDocument();
    expect(currentUrl()).toBe(`/encounter-manager/${brine.id}`);
    expect(summaryRequests).toEqual([]);
  });

  test("a player without a membership waits to be added and keeps Compendium", async () => {
    const user = userEvent.setup();
    campaignsByUser[player.id] = [];
    renderShell("/encounter-manager", player);

    expect(await (await encounterPage()).findByRole("status")).toHaveTextContent("Waiting for your GM to add you to a campaign.");
    expect(within(screen.getByRole("navigation")).getByText("No campaign")).toBeInTheDocument();
    await user.click(within(screen.getByRole("navigation")).getByRole("link", { name: "Compendium" }));
    expect(currentUrl()).toBe("/compendium");
    expect(screen.getByText("Compendium section")).toBeInTheDocument();
  });
});

describe("campaign-scoped prep", () => {
  test("switching campaigns never shows a late list or an open create dialog of the previous one", async () => {
    const user = userEvent.setup();
    let releaseAshes!: () => void;
    const ashesHeld = new Promise<void>(resolve => { releaseAshes = resolve; });
    server.use(http.get("/api/dnd5e/encounters/summaries", async ({ request }) => {
      const campaignId = Number(new URL(request.url).searchParams.get("campaignId"));
      summaryRequests.push(campaignId);
      if (campaignId === ashes.id) await ashesHeld;
      return json({ encounters: encountersByCampaign[campaignId] });
    }));
    const { queryClient } = renderShell(`/encounter-manager/${ashes.id}`, gm);

    await user.click(await (await encounterPage()).findByRole("button", { name: "+ New Encounter" }));
    expect(screen.getByRole("dialog", { name: "New encounter in Ashes" })).toBeInTheDocument();

    // The dialog is modal; a link or Back changes the campaign under it.
    await go(`/encounter-manager/${brine.id}`);
    expect(await (await encounterPage()).findByText("Wreck of the Gull")).toBeInTheDocument();
    expect(switcher()).toHaveDisplayValue("Brine");
    expect(screen.queryByRole("dialog", { name: "New encounter in Ashes" })).not.toBeInTheDocument();

    releaseAshes();
    expect(summaryRequests).toEqual([ashes.id, brine.id]);
    await waitFor(() => expect(queryClient.getQueryState(ENCOUNTER_KEYS.campaignSummaries(gm.id, ashes.id))?.fetchStatus).toBe("idle"));
    expect((await encounterPage()).queryByText("Ambush at the ford")).not.toBeInTheDocument();
    expect((await encounterPage()).getByRole("heading", { name: "Brine" })).toBeInTheDocument();
  });

  test("while the next campaign's list loads, the previous campaign's list is not shown for it", async () => {
    let releaseBrine!: () => void;
    const brineHeld = new Promise<void>(resolve => { releaseBrine = resolve; });
    server.use(http.get("/api/dnd5e/encounters/summaries", async ({ request }) => {
      const campaignId = Number(new URL(request.url).searchParams.get("campaignId"));
      summaryRequests.push(campaignId);
      if (campaignId === brine.id) await brineHeld;
      return json({ encounters: encountersByCampaign[campaignId] });
    }));
    renderShell(`/encounter-manager/${ashes.id}`, gm);
    expect(await (await encounterPage()).findByText("Ambush at the ford")).toBeInTheDocument();

    await go(`/encounter-manager/${brine.id}`);
    const page = await encounterPage();
    expect(await page.findByRole("heading", { name: "Brine" })).toBeInTheDocument();
    await waitFor(() => expect(summaryRequests).toEqual([ashes.id, brine.id]));
    expect(page.queryByText("Ambush at the ford")).not.toBeInTheDocument();

    releaseBrine();
    expect(await page.findByText("Wreck of the Gull")).toBeInTheDocument();
  });

  test("the create form sends the campaign it was opened for", async () => {
    const user = userEvent.setup();
    const created: unknown[] = [];
    server.use(http.post("/api/dnd5e/encounters", async ({ request }) => {
      created.push(await request.json());
      return json({ insertId: 202 }, 201);
    }));
    renderShell(`/encounter-manager/${brine.id}`, gm);

    await user.click(await (await encounterPage()).findByRole("button", { name: "+ New Encounter" }));
    const dialog = screen.getByRole("dialog", { name: "New encounter in Brine" });
    const name = within(dialog).getByLabelText(/Name/);
    // The dialog takes focus on the next frame; typing before then loses keystrokes.
    await waitFor(() => expect(dialog).toHaveFocus());
    await user.type(name, "Reef crossing");
    await user.click(within(dialog).getByRole("button", { name: "Create Encounter" }));

    await waitFor(() => expect(created).toEqual([
      { campaignId: brine.id, data: expect.objectContaining({ name: "Reef crossing" }) },
    ]));
    await waitFor(() => expect(summaryRequests).toEqual([brine.id, brine.id]));
  });

  test("a direct encounter URL opens only inside the encounter's own campaign", async () => {
    const detailRequests: string[] = [];
    server.use(http.get("/api/dnd5e/encounters/:id/details", ({ params, request }) => {
      const campaignId = Number(new URL(request.url).searchParams.get("campaignId"));
      detailRequests.push(`${params.id}@${campaignId}`);
      const match = encountersByCampaign[campaignId]?.find(row => row.id === Number(params.id));
      return match ? json({ encounterDetails: match }) : apiError(404, "Encounter not found");
    }));
    const { unmount } = renderShell(`/encounter-manager/${brine.id}/101`, gm);

    expect(await (await encounterPage()).findByRole("alert")).toHaveTextContent("This encounter is not part of Brine.");
    expect(screen.queryByText(/Live encounter/)).not.toBeInTheDocument();
    unmount();

    renderShell(`/encounter-manager/${ashes.id}/101`, gm);
    expect(await screen.findByText(`Live encounter 101 of campaign ${ashes.id}`)).toBeInTheDocument();
    expect(detailRequests).toEqual([`101@${brine.id}`, `101@${ashes.id}`]);
  });

  test("a failed encounter details read is distinct from an encounter in the wrong campaign", async () => {
    server.use(http.get("/api/dnd5e/encounters/:id/details", () =>
      apiError(500, "Encounter details are unavailable"),
    ));
    renderShell(`/encounter-manager/${brine.id}/201`, gm);

    const alert = await (await encounterPage()).findByRole("alert");
    expect(alert).toHaveTextContent("Could not open this encounter.");
    expect(alert).toHaveTextContent("Encounter details are unavailable");
    expect(alert).toHaveTextContent(`Back to ${brine.name}`);
    expect(alert).not.toHaveTextContent("This encounter is not part");
    expect(screen.queryByText(/Live encounter/)).not.toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  test("an open encounter survives visiting another section and closes when another campaign is chosen", async () => {
    const user = userEvent.setup();
    server.use(http.get("/api/dnd5e/encounters/:id/details", () => json({ encounterDetails: encountersByCampaign[ashes.id][0] })));
    renderShell(`/encounter-manager/${ashes.id}/101`, gm);
    expect(await screen.findByText(`Live encounter 101 of campaign ${ashes.id}`)).toBeInTheDocument();

    const nav = within(screen.getByRole("navigation"));
    await user.click(nav.getByRole("link", { name: "Compendium" }));
    expect(screen.getByText(`Live encounter 101 of campaign ${ashes.id}`)).toBeInTheDocument();
    await user.click(nav.getByRole("link", { name: "Encounter Manager" }));
    await waitFor(() => expect(currentUrl()).toBe(`/encounter-manager/${ashes.id}/101`));

    await user.click(nav.getByRole("link", { name: "Compendium" }));
    await user.selectOptions(switcher(), "Brine");
    expect(currentUrl()).toBe("/compendium");
    await waitFor(() => expect(screen.queryByText(/Live encounter/)).not.toBeInTheDocument());
    await user.click(nav.getByRole("link", { name: "Encounter Manager" }));
    expect(await (await encounterPage()).findByText("Wreck of the Gull")).toBeInTheDocument();
    expect(currentUrl()).toBe(`/encounter-manager/${brine.id}`);
  });

  test("another account in the same tab starts from its own campaign and list", async () => {
    const user = userEvent.setup();
    localStorage.setItem(`ttrpg.lastCampaign.${otherGm.id}`, String(brine.id));
    renderShell(`/encounter-manager/${ashes.id}`, gm);
    expect(await (await encounterPage()).findByText("Ambush at the ford")).toBeInTheDocument();

    server.use(
      http.post("/api/auth/logout", () => new HttpResponse(null, { status: 205 })),
      http.post("/api/auth/login", () => json({ user: otherGm, session: { token: "other-gm-token", createdAt: otherGm.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" } })),
      http.get("/api/auth/user-session", () => json({ user: otherGm, session: { token: "other-gm-token", createdAt: otherGm.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" } })),
    );
    await user.click(screen.getByRole("button", { name: /table-gm/ }));
    await user.click(screen.getByRole("button", { name: "Logout" }));
    await user.type(await screen.findByLabelText("Username"), "second-gm");
    await user.type(screen.getByLabelText("Password"), "secret{Enter}");

    // Login returns to the app root; the Encounter tab resolves this account's own last choice.
    await user.click(within(await screen.findByRole("navigation")).getByRole("link", { name: "Encounter Manager" }));
    expect(await (await encounterPage()).findByText("Wreck of the Gull")).toBeInTheDocument();
    expect(currentUrl()).toBe(`/encounter-manager/${brine.id}`);
    expect((await encounterPage()).queryByText("Ambush at the ford")).not.toBeInTheDocument();
    expect(stored(gm)).toBe(String(ashes.id));
  });
});
