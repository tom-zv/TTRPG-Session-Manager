import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import type { User } from "src/api/types.js";
import { installLayoutApis, installMatchMedia } from "src/test/fakes/matchMedia.js";
import { apiError, json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl, go } from "src/test/routerProbe.js";
import type { DnD5eInventoryItem } from "shared/domain/encounters/dnd5e/inventory.js";
import { MY_CHARACTER_KEYS } from "../../api/query/myCharacterKeys.js";
import { INVENTORY_KEYS } from "../../api/query/inventoryKeys.js";
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
  featuredNpc: entity.role === "npc" && entity.settings?.compendium?.featured === true,
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

type InventoryServer = { stored: Map<number, DnD5eInventoryItem[]>; reads: number[]; writes: Array<{ id: number; items: DnD5eInventoryItem[] }> };

// The inventory endpoints as the server enforces them: GMs reach PCs and featured NPCs, players
// only their assigned PCs. `templates` and `assigned` are read on each request, so tests can change them.
function serveInventory(
  templates: () => DnD5eEntityDetails[],
  assigned: Record<number, DnD5eEntityDetails[]> = {},
  options: { failSave?: string } = {}
): InventoryServer {
  const inventory: InventoryServer = { stored: new Map(), reads: [], writes: [] };
  const signedIn = () => Number(localStorage.getItem("test-user-id"));
  const reachable = (id: number) => {
    if (signedIn() !== gm.id) return (assigned[signedIn()] ?? []).some(entity => entity.templateId === id && entity.role === "pc");
    const entity = templates().find(item => item.templateId === id);
    return entity !== undefined && (entity.role === "pc" || (entity.role === "npc" && entity.settings?.compendium?.featured === true));
  };
  server.use(
    http.get("/api/dnd5e/entities/:id/inventory", ({ params }) => {
      const id = Number(params.id);
      inventory.reads.push(id);
      return reachable(id) ? json({ items: inventory.stored.get(id) ?? [] }) : json({ message: "Inventory not found" }, 404);
    }),
    http.put("/api/dnd5e/entities/:id/inventory", async ({ params, request }) => {
      const id = Number(params.id);
      const { items } = (await request.json()) as { items: DnD5eInventoryItem[] };
      inventory.writes.push({ id, items });
      if (options.failSave) return apiError(400, options.failSave);
      // The server trims text, so the response can differ from what was sent.
      const saved = items.map(item => ({ ...item, name: item.name.trim(), ...(item.notes ? { notes: item.notes.trim() } : {}) }));
      inventory.stored.set(id, saved);
      return json({ items: saved });
    })
  );
  return inventory;
}

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
  serveInventory(() => TEMPLATES, assigned);
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

type Saves = { created: DnD5eEntityDetails[]; updated: Array<{ id: number; data: DnD5eEntityDetails }>; summaries: number };

// A catalog the forms can write to: POST assigns the next ID, PUT replaces the template.
function serveEditableCatalog(initial: DnD5eEntityDetails[], options: { failCreate?: string } = {}) {
  const store = new Map(initial.map(entity => [entity.templateId, entity]));
  let nextId = 101;
  const saves: Saves = { created: [], updated: [], summaries: 0 };
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: [magicMissile] })),
    http.get("/api/dnd5e/entities/summary", () => {
      saves.summaries += 1;
      return json({ entities: [...store.values()].map(toSummary) });
    }),
    http.post("/api/dnd5e/entities/batch", async ({ request }) => {
      const { entityIds } = (await request.json()) as { entityIds: number[] };
      return json({ entities: entityIds.flatMap(id => store.get(id) ?? []) });
    }),
    http.post("/api/dnd5e/entities", async ({ request }) => {
      if (options.failCreate) return apiError(500, options.failCreate);
      const { data } = (await request.json()) as { data: Omit<DnD5eEntityDetails, "templateId" | "createdAt"> };
      const entity: DnD5eEntityDetails = { ...data, templateId: nextId++, createdAt: "2026-02-01T00:00:00.000Z" };
      store.set(entity.templateId, entity);
      saves.created.push(entity);
      return json({ insertId: entity.templateId, entity }, 201);
    }),
    http.put("/api/dnd5e/entities/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const { data } = (await request.json()) as { data: DnD5eEntityDetails };
      const entity: DnD5eEntityDetails = { ...data, templateId: id, createdAt: store.get(id)?.createdAt ?? "" };
      store.set(id, entity);
      saves.updated.push({ id, data });
      return json({ entity });
    })
  );
  serveInventory(() => [...store.values()]);
  return saves;
}

const formDialog = (name: string) => screen.findByRole("dialog", { name });
const listedNames = () => within(screen.getByRole("listbox", { name: "Entities" })).getAllByRole("option")
  .map(item => item.textContent?.match(/^(Mara|Goblin|Wolf)/)?.[0]);

describe("GM create and edit", () => {
  test("creating an NPC from an empty catalog selects its generated ID, and it can be edited right away", async () => {
    const user = userEvent.setup();
    const saves = serveEditableCatalog([]);
    renderAs(gm, "/compendium?section=entities");

    await user.click(await screen.findByRole("button", { name: "New entity" }));
    const create = within(await formDialog("New entity"));
    await user.type(create.getByLabelText("Name"), "Mara");
    await user.selectOptions(create.getByLabelText("Role"), "NPC");
    await user.click(create.getByRole("button", { name: /Create Entity/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const id = saves.created[0]?.templateId;
    expect(id).toBe(101);
    expect(currentUrl()).toBe(`/compendium?entity=${id}`);
    expect(await within(details()).findByRole("heading", { name: "Mara" })).toBeVisible();
    expect(option("Mara")).toHaveAttribute("aria-selected", "true");

    await user.click(within(details()).getByRole("button", { name: "Edit Mara" }));
    const edit = within(await formDialog("Edit Mara"));
    expect(edit.getByLabelText("Name")).toHaveValue("Mara");
    await user.clear(edit.getByLabelText("AC"));
    await user.type(edit.getByLabelText("AC"), "15");
    await user.click(edit.getByRole("button", { name: /Save Entity/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saves.updated.map(save => [save.id, save.data.ac])).toEqual([[id, 15]]);
    expect(within(details()).getByText("AC").nextElementSibling).toHaveTextContent("15");
    expect(saves.summaries).toBe(1);
  });

  test("a failed save keeps the draft and shows the error; Cancel returns to the previous selection", async () => {
    const user = userEvent.setup();
    serveEditableCatalog([mara], { failCreate: "Database unavailable" });
    renderAs(gm, `/compendium?entity=${mara.templateId}`);
    await within(await screen.findByLabelText("Entity details")).findByRole("heading", { name: "Mara" });

    await user.click(screen.getByRole("button", { name: "New entity" }));
    const create = within(await formDialog("New entity"));
    await user.type(create.getByLabelText("Name"), "Wolf");
    await user.click(create.getByRole("button", { name: /Create Entity/ }));

    expect(await create.findByText("Database unavailable")).toBeVisible();
    expect(create.getByLabelText("Name")).toHaveValue("Wolf");

    await user.click(create.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(currentUrl()).toBe(`/compendium?entity=${mara.templateId}`);
    expect(within(details()).getByRole("heading", { name: "Mara" })).toBeVisible();
  });

  test("marking an NPC Featured lists it under Featured NPCs without a reload and keeps its other settings", async () => {
    const user = userEvent.setup();
    const saves = serveEditableCatalog([{ ...mara, settings: { combat: { deathSaves: true } }, controllerUserIds: [2] }, goblin]);
    renderAs(gm, `/compendium?entity=${mara.templateId}`);
    const views = within(await screen.findByRole("group", { name: "Entity views" }));
    await user.click(views.getByRole("button", { name: "Featured NPCs" }));
    expect(screen.getByText("No entities match.")).toBeVisible();

    await user.click(await within(details()).findByRole("button", { name: "Edit Mara" }));
    const edit = within(await formDialog("Edit Mara"));
    await user.click(edit.getByRole("button", { name: /Identity/ }));
    await user.click(edit.getByRole("checkbox", { name: /Featured NPC/ }));
    await user.click(edit.getByRole("button", { name: /Save Entity/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(saves.updated[0]?.data.settings).toEqual({ combat: { deathSaves: true }, compendium: { featured: true } });
    expect(listedNames()).toEqual(["Mara"]);
    expect(within(details()).getByText(/Featured NPC/)).toBeVisible();
    expect(saves.summaries).toBe(1);
  });

  test("a save the active filters hide keeps the filters and the detail, and Show in list resets them", async () => {
    const user = userEvent.setup();
    serveEditableCatalog([mara, goblin]);
    renderAs(gm, "/compendium?section=entities");
    const views = within(await screen.findByRole("group", { name: "Entity views" }));
    await user.click(views.getByRole("button", { name: "NPCs" }));

    await user.click(screen.getByRole("button", { name: "New entity" }));
    const create = within(await formDialog("New entity"));
    await user.type(create.getByLabelText("Name"), "Wolf");
    await user.click(create.getByRole("button", { name: /Create Entity/ }));

    expect(await within(details()).findByRole("heading", { name: "Wolf" })).toBeVisible();
    expect(listedNames()).toEqual(["Mara"]);
    expect(views.getByRole("button", { name: "NPCs" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Show in list" }));
    expect(views.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(listedNames()).toEqual(["Goblin", "Mara", "Wolf"]);
    expect(option("Wolf")).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Show in list" })).not.toBeInTheDocument();
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
    expect(queryClient.getQueriesData({ queryKey: INVENTORY_KEYS.user(player.id) })).toEqual([]);
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

const inventoryOf = (container: HTMLElement) => within(container).findByRole("region", { name: "Inventory" });
const inventoryRows = (region: HTMLElement) => within(region).getAllByRole("row").slice(1)
  .map(row => [within(row).getByRole("rowheader"), ...within(row).getAllByRole("cell")].map(cell => cell.textContent));

// Same split-pane limit as row presses: the press user.type uses to focus a field is cancelled,
// so focus the field directly and type without clicking.
const typeInSplitPane = async (user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) => {
  act(() => field.focus());
  await user.type(field, text, { skipClick: true });
};

describe("inventory", () => {
  test("a GM fills a PC's empty inventory; the server's saved list replaces the cache, in order", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES);
    const { queryClient } = renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const region = await inventoryOf(await screen.findByLabelText("Entity details"));
    expect(await within(region).findByText("Nothing in the inventory yet.")).toBeVisible();
    await user.click(within(region).getByRole("button", { name: "Edit inventory" }));
    const editor = within(within(region).getByRole("form", { name: "Edit inventory" }));
    for (let i = 0; i < 3; i++) await user.click(editor.getByRole("button", { name: "Add item" }));
    expect(editor.getByLabelText("Item 1 quantity")).toHaveValue(1);

    await typeInSplitPane(user, editor.getByLabelText("Item 1 name"), "  Potion of healing ");
    await user.clear(editor.getByLabelText("Item 1 quantity"));
    await typeInSplitPane(user, editor.getByLabelText("Item 1 quantity"), "2");
    await typeInSplitPane(user, editor.getByLabelText("Item 2 name"), "Rope");
    await typeInSplitPane(user, editor.getByLabelText("Item 3 name"), "Iron key");
    await typeInSplitPane(user, editor.getByLabelText("Item 3 notes"), "Opens the crypt");
    await user.click(editor.getByRole("button", { name: "Remove item 2" }));
    await user.click(editor.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(within(region).queryByRole("form")).not.toBeInTheDocument());
    expect(inventory.writes).toEqual([{ id: bram.templateId, items: [
      { name: "  Potion of healing ", quantity: 2 },
      { name: "Iron key", quantity: 1, notes: "Opens the crypt" },
    ] }]);
    expect(inventoryRows(region)).toEqual([["Potion of healing", "2", ""], ["Iron key", "1", "Opens the crypt"]]);
    expect(queryClient.getQueryData(INVENTORY_KEYS.detail(gm.id, bram.templateId))).toEqual(inventory.stored.get(bram.templateId));
    expect(inventory.reads).toEqual([bram.templateId]);
  });

  test("a failed save keeps the draft and shows the error; Cancel returns to the saved list", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES, {}, { failSave: "Item 1: quantity must be a whole number of at least 1" });
    inventory.stored.set(bram.templateId, [{ name: "Potion of healing", quantity: 2 }]);
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const region = await inventoryOf(await screen.findByLabelText("Entity details"));
    await user.click(await within(region).findByRole("button", { name: "Edit inventory" }));
    const editor = within(within(region).getByRole("form", { name: "Edit inventory" }));
    await user.clear(editor.getByLabelText("Item 1 quantity"));
    await typeInSplitPane(user, editor.getByLabelText("Item 1 quantity"), "0");
    await user.click(editor.getByRole("button", { name: "Save" }));

    expect(await editor.findByRole("alert")).toHaveTextContent("quantity must be a whole number");
    expect(editor.getByLabelText("Item 1 quantity")).toHaveValue(0);
    expect(editor.getByLabelText("Item 1 name")).toHaveValue("Potion of healing");

    await user.click(editor.getByRole("button", { name: "Cancel" }));
    expect(inventoryRows(region)).toEqual([["Potion of healing", "2", ""]]);
  });

  test("an ordinary NPC has no inventory; un-featuring hides it and featuring again brings the same items back", async () => {
    const user = userEvent.setup();
    serveEditableCatalog([mara, goblin]);
    const inventory = serveInventory(() => [], {});
    renderAs(gm, `/compendium?entity=${mara.templateId}`);
    expect(await within(await screen.findByLabelText("Entity details")).findByRole("heading", { name: "Mara" })).toBeVisible();
    expect(within(details()).queryByRole("region", { name: "Inventory" })).not.toBeInTheDocument();
    expect(inventory.reads).toEqual([]);

    const toggleFeatured = async () => {
      await user.click(within(details()).getByRole("button", { name: "Edit Mara" }));
      const edit = within(await formDialog("Edit Mara"));
      await user.click(edit.getByRole("button", { name: /Identity/ }));
      await user.click(edit.getByRole("checkbox", { name: /Featured NPC/ }));
      await user.click(edit.getByRole("button", { name: /Save Entity/ }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    };
    // Serve the inventory as if for the catalog's current Featured setting.
    let featured = false;
    const served = serveInventory(() => (featured ? [{ ...mara, settings: { compendium: { featured: true } } }] : []));
    served.stored.set(mara.templateId, [{ name: "Silver dagger", quantity: 1, notes: "Engraved" }]);

    featured = true;
    await toggleFeatured();
    const region = await inventoryOf(details());
    await waitFor(() => expect(inventoryRows(region)).toEqual([["Silver dagger", "1", "Engraved"]]));

    featured = false;
    await toggleFeatured();
    expect(within(details()).queryByRole("region", { name: "Inventory" })).not.toBeInTheDocument();

    featured = true;
    await toggleFeatured();
    expect(inventoryRows(await inventoryOf(details()))).toEqual([["Silver dagger", "1", "Engraved"]]);
  });

  test("a player reads their PC's inventory without edit controls, refreshed when they reopen Entities", async () => {
    const user = userEvent.setup();
    const assigned = { [player.id]: [bram] };
    serveCompendiumApi(assigned);
    const inventory = serveInventory(() => TEMPLATES, assigned);
    inventory.stored.set(bram.templateId, [{ name: "Potion of healing", quantity: 2 }]);
    renderAs(player, `/compendium?entity=${bram.templateId}`);

    const region = await inventoryOf(await screen.findByLabelText("Character details"));
    await waitFor(() => expect(inventoryRows(region)).toEqual([["Potion of healing", "2", ""]]));
    expect(within(region).queryByRole("button", { name: "Edit inventory" })).not.toBeInTheDocument();

    await user.click(tab("Spells"));
    inventory.stored.set(bram.templateId, [{ name: "Potion of healing", quantity: 1 }, { name: "Iron key", quantity: 1 }]);
    await user.click(tab("Entities"));

    await waitFor(() => expect(inventoryRows(region)).toEqual([["Potion of healing", "1", ""], ["Iron key", "1", ""]]));
    expect(inventory.reads).toEqual([bram.templateId, bram.templateId]);
  });
});
