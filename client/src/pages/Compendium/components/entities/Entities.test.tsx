import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import type { User } from "src/api/types.js";
import { installLayoutApis, installMatchMedia } from "src/test/fakes/matchMedia.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl, go } from "src/test/routerProbe.js";
import { MY_CHARACTER_KEYS } from "../../api/query/myCharacterKeys.js";
import { Compendium } from "../Compendium.js";

const template = (templateId: number, name: string, patch: Partial<DnD5eEntityDetails> = {}): DnD5eEntityDetails => ({
  templateId,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "creature",
  ac: 12,
  hp: 20,
  speeds: { walk: 30 },
  size: "medium",
  alignment: "neutral",
  abilityScores: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
  ...patch,
});

const toSummary = (entity: DnD5eEntityDetails): DnD5eEntitySummary => ({
  templateId: entity.templateId,
  name: entity.name,
  role: entity.role,
  hp: entity.hp,
  cr: entity.cr,
  creatureType: entity.creatureType,
  size: entity.size,
  inParty: entity.settings?.party?.member ?? false,
  featuredNpc: false,
});

const magicMissile: SpellSummary = {
  id: 7, name: "Magic Missile", source: "PHB", level: 1, school: "evocation", ritual: false,
  concentration: false, castingTime: "1 action", castingUnit: "action", components: { v: true, s: true, m: false },
  classes: ["wizard"], damageTypes: ["force"], saves: [], aliases: [],
};

// The plan's cast: a PC assigned to the player but outside the party, a party PC assigned to no
// one, and an NPC assigned to the player.
const bram = template(11, "Bram", {
  role: "pc", hp: 33, ac: 16, hpFormula: "5d10 + 5", skills: { athletics: "+5" },
  abilityScores: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 10 },
  actions: [{ name: "Longsword", description: "Melee attack.", actionType: "action" }],
  spellcasting: [{ name: "Spellcasting", ability: "wis", saveDc: 13, descriptions: [], levels: [{ level: 1, slots: 2, spells: [{ name: "Magic Missile" }] }] }],
});
const aria = template(12, "Aria", { role: "pc", hp: 40, settings: { party: { member: true } } });
const mara = template(13, "Mara", {
  role: "npc", hp: 27, cr: "2", creatureType: "humanoid",
  actions: [{ name: "Scimitar", description: "Melee attack.", actionType: "action" }],
});
const goblin = template(14, "Goblin", { cr: "1/4", creatureType: "humanoid", size: "small", hp: 7 });
const TEMPLATES = [bram, aria, mara, goblin];

const gm = testUser({ id: 1, username: "gm", isGm: true });
const player = testUser({ id: 2, username: "player", isGm: false });
const otherPlayer = testUser({ id: 3, username: "other", isGm: false });

type Requests = { summaries: number; batches: number[][]; mine: number; mineDetails: number[] };

function serveCompendiumApi(assigned: Record<number, DnD5eEntityDetails[]>) {
  const requests: Requests = { summaries: 0, batches: [], mine: 0, mineDetails: [] };
  const signedIn = () => Number(localStorage.getItem("test-user-id"));
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: [magicMissile] })),
    http.get("/api/dnd5e/spells/:id", () =>
      json({ spell: { ...magicMissile, range: "120 feet", materialConsumed: false, duration: "Instantaneous", description: "Darts.", conditions: [], locallyEdited: false } })),
    http.get("/api/dnd5e/entities/summary", () => {
      requests.summaries += 1;
      return json({ entities: TEMPLATES.map(toSummary) });
    }),
    http.post("/api/dnd5e/entities/batch", async ({ request }) => {
      const { entityIds } = (await request.json()) as { entityIds: number[] };
      requests.batches.push(entityIds);
      return json({ entities: TEMPLATES.filter(entity => entityIds.includes(entity.templateId)) });
    }),
    http.get("/api/dnd5e/entities/mine", () => {
      requests.mine += 1;
      return json({ entities: (assigned[signedIn()] ?? []).map(toSummary) });
    }),
    http.get("/api/dnd5e/entities/mine/:id", ({ params }) => {
      requests.mineDetails.push(Number(params.id));
      const entity = (assigned[signedIn()] ?? []).find(item => item.templateId === Number(params.id));
      return entity ? json({ entity }) : json({ message: "Character not found" }, 404);
    })
  );
  return requests;
}

// Signs another account in while the page stays mounted, as the login form does.
const AccountSwitcher = ({ to }: { to: User }) => {
  const { login } = useAuth();
  return (
    <button
      type="button"
      onClick={() => {
        server.use(
          http.post("/api/auth/login", () =>
            json({ user: to, session: { token: `token-${to.id}`, createdAt: to.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" } })),
          http.get("/api/auth/user-session", () =>
            json({ user: to, session: { token: `token-${to.id}`, createdAt: to.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" } }))
        );
        localStorage.setItem("test-user-id", String(to.id));
        void login({ username: to.username, password: "secret" });
      }}
    >
      Switch to {to.username}
    </button>
  );
};

const renderAs = (user: User, route: string, switchTo?: User) => {
  localStorage.setItem("test-user-id", String(user.id));
  return renderWithProviders(
    <>
      <Compendium />
      <RouterProbe />
      {switchTo && <AccountSwitcher to={switchTo} />}
    </>,
    { route, user }
  );
};

const tab = (name: string) => screen.getByRole("tab", { name });
const option = (name: string) => screen.getByRole("option", { name: new RegExp(`^${name}`) });
const details = (name = "Entity details") => screen.getByLabelText(name);

// In the desktop split pane, jsdom's zero-size rects make react-resizable-panels treat every press
// as a separator grab and cancel it (see Compendium.test.tsx); press rows with their mousedown.
const pressRowInSplitPane = (row: HTMLElement) => act(() => void fireEvent.mouseDown(row));

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280);
});

describe("GM entity browser", () => {
  test("opening Entities requests the summaries, and selecting a row loads only that template", async () => {
    const requests = serveCompendiumApi({});
    renderAs(gm, "/compendium?section=entities");

    await screen.findByRole("listbox", { name: "Entities" });
    expect(requests.summaries).toBe(1);
    expect(requests.batches).toEqual([]);

    await pressRowInSplitPane(option("Bram"));
    expect(option("Bram")).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${bram.templateId}`));
    expect(await within(details()).findByRole("heading", { name: "Bram" })).toBeVisible();
    expect(requests.batches).toEqual([[bram.templateId]]);
    expect(requests.summaries).toBe(1);
  });

  test("finds an assigned PC outside the party, an unassigned party PC and an assigned NPC through the views", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    renderAs(gm, "/compendium?section=entities");
    await screen.findByRole("listbox", { name: "Entities" });
    const views = screen.getByRole("group", { name: "Entity views" });
    const names = () => within(screen.getByRole("listbox", { name: "Entities" })).getAllByRole("option")
      .map(item => item.textContent?.match(/^(Aria|Bram|Goblin|Mara)/)?.[0]);

    expect(names()).toEqual(["Aria", "Bram", "Goblin", "Mara"]);
    await user.click(within(views).getByRole("button", { name: "Party" }));
    expect(names()).toEqual(["Aria"]);
    await user.click(within(views).getByRole("button", { name: "PCs" }));
    expect(names()).toEqual(["Aria", "Bram"]);
    await user.click(within(views).getByRole("button", { name: "NPCs" }));
    expect(names()).toEqual(["Mara"]);
    expect(screen.getByText("1 of 4 entities")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(names()).toHaveLength(4);
  });

  test("a PC's sheet leads with party membership, template HP and spells; traits and actions open on request", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const sheet = await within(await screen.findByLabelText("Entity details")).findByRole("article", { name: "Bram" });
    const facts = within(sheet);
    expect(facts.getByText("Template HP").nextElementSibling).toHaveTextContent("33 (5d10 + 5)");
    expect(facts.getByText("Party").nextElementSibling).toHaveTextContent("Not in the party");
    expect(facts.getByText("AC").nextElementSibling).toHaveTextContent("16");
    expect(facts.getByText(/athletics \+5/i)).toBeVisible();
    // Abilities read as tables: the ability and score, then modifier and save.
    const physical = facts.getByRole("table", { name: "Physical abilities" });
    expect(within(physical).getByRole("row", { name: /^Str 10 \+0 \+0$/ })).toBeVisible();
    const mental = facts.getByRole("table", { name: "Mental abilities" });
    expect(within(mental).getByRole("row", { name: /^Wis 10 \+0 \+0$/ })).toBeVisible();
    expect(await facts.findByRole("button", { name: "Magic Missile" })).toBeVisible();

    // Traits and actions are one click away.
    expect(facts.queryByText("Longsword.")).not.toBeInTheDocument();
    await user.click(facts.getByText("Traits and actions"));
    expect(await facts.findByText("Longsword.")).toBeVisible();
  });

  test("following a spell link from an entity and going Back returns to that entity", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    await user.click(await within(await screen.findByLabelText("Entity details")).findByRole("button", { name: "Magic Missile" }));
    await user.click(await screen.findByRole("link", { name: "Open in Compendium" }));
    expect(tab("Spells")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe("/compendium?spell=7");

    await go(-1);
    expect(tab("Entities")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe(`/compendium?entity=${bram.templateId}`);
    expect(within(details()).getByRole("heading", { name: "Bram" })).toBeVisible();
  });

  test("on a narrow screen a direct entity link opens its details dialog, and closing it returns to the list", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCompendiumApi({});
    renderAs(gm, `/compendium?entity=${mara.templateId}`);

    const dialog = await screen.findByRole("dialog", { name: "Mara" });
    expect(await within(dialog).findByRole("heading", { name: "Mara" })).toBeVisible();
    // An NPC's sheet shows its whole stat block, actions included.
    expect(within(dialog).getByRole("heading", { name: "Actions" })).toBeVisible();
    expect(within(dialog).getByText("Scimitar.")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Nothing was focused before the link opened the dialog; focus lands on the list.
    await waitFor(() => expect(screen.getByRole("listbox", { name: "Entities" })).toHaveFocus());
    expect(option("Mara")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe(`/compendium?entity=${mara.templateId}`);

    // Arrow keys in the list move without opening the dialog again.
    screen.getByRole("listbox", { name: "Entities" }).focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("player characters", () => {
  test("a player sees exactly their assigned PCs, read through the assigned-PC API only", async () => {
    // The general summary and batch endpoints are served here, so the counts prove they are never called.
    const requests = serveCompendiumApi({ [player.id]: [bram] });
    renderAs(player, "/compendium?section=entities");

    const list = await screen.findByRole("listbox", { name: "My characters" });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    expect(option("Bram")).toBeVisible();

    await pressRowInSplitPane(option("Bram"));
    expect(await within(details("Character details")).findByRole("article", { name: "Bram" })).toBeVisible();
    expect(requests.summaries).toBe(0);
    expect(requests.batches).toEqual([]);
    expect(requests.mineDetails).toEqual([bram.templateId]);
  });

  test("a direct link to an NPC or an unassigned PC shows the unavailable state", async () => {
    serveCompendiumApi({ [player.id]: [bram] });
    renderAs(player, `/compendium?entity=${mara.templateId}`);

    expect(await within(await screen.findByLabelText("Character details")).findByText("This character is not available to you.")).toBeVisible();

    await go(`/compendium?entity=${aria.templateId}`);
    expect(await within(details("Character details")).findByText("This character is not available to you.")).toBeVisible();
  });

  test("reopening Entities refreshes the list and sheet; revoked access shows unavailable instead of the cached sheet", async () => {
    const user = userEvent.setup();
    const assigned: Record<number, DnD5eEntityDetails[]> = { [player.id]: [bram] };
    const requests = serveCompendiumApi(assigned);
    renderAs(player, `/compendium?entity=${bram.templateId}`);
    expect(await within(await screen.findByLabelText("Character details")).findByRole("article", { name: "Bram" })).toBeVisible();

    await user.click(tab("Spells"));
    assigned[player.id] = [];
    await user.click(tab("Entities"));

    expect(await within(details("Character details")).findByText("This character is not available to you.")).toBeVisible();
    expect(within(details("Character details")).queryByRole("article")).not.toBeInTheDocument();
    expect(await screen.findByText("No characters are assigned to you yet.")).toBeVisible();
    expect(requests.mine).toBe(2);
  });

  test("switching accounts clears the selection and the previous player's cached sheets", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({ [player.id]: [bram], [otherPlayer.id]: [aria] });
    const { queryClient } = renderAs(player, `/compendium?entity=${bram.templateId}`, otherPlayer);
    expect(await within(await screen.findByLabelText("Character details")).findByRole("article", { name: "Bram" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Switch to other" }));

    const list = await screen.findByRole("listbox", { name: "My characters" });
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(1));
    expect(option("Aria")).toBeVisible();
    expect(within(list).getByRole("option")).toHaveAttribute("aria-selected", "false");
    expect(within(details("Character details")).getByText("Select a character to see their sheet.")).toBeVisible();
    await waitFor(() => expect(currentUrl()).toBe("/compendium?section=entities"));
    expect(queryClient.getQueriesData({ queryKey: MY_CHARACTER_KEYS.user(player.id) })).toEqual([]);
  });

  test("auth must finish before a browser mounts", async () => {
    serveCompendiumApi({ [player.id]: [bram] });
    renderAs(player, "/compendium?section=entities");

    expect(screen.queryByRole("listbox", { name: "Entities" })).not.toBeInTheDocument();
    expect(await screen.findByRole("listbox", { name: "My characters" })).toBeVisible();
    await act(async () => {});
    expect(screen.queryByRole("listbox", { name: "Entities" })).not.toBeInTheDocument();
  });
});
