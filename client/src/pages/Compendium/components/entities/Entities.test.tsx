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
import type { ItemListResult, ItemRef, ItemSummary } from "shared/domain/dnd5e/item.js";
import type { DnD5eInventoryEntry, DnD5eInventoryItem, DnD5eInventoryItemLink } from "shared/domain/encounters/dnd5e/inventory.js";
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
  source: "homebrew",
  imported: false,
  locallyEdited: false,
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
  source: entity.source,
  page: entity.page,
  imported: entity.imported,
  locallyEdited: entity.locallyEdited,
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
const gmViewer = { userId: gm.id, isGm: true };

type Requests = { summaries: number; batches: number[][]; mine: number; mineDetails: number[] };

type InventoryWrite = { id: number; items: DnD5eInventoryItem[]; expectedRevision?: number };
type InventoryServer = {
  stored: Map<number, DnD5eInventoryItem[]>;
  revisions: Map<number, number>;
  /** Catalog items as the signed-in viewer may see them; a linked row without one reads as its saved name. */
  catalog: Map<number, DnD5eInventoryItemLink>;
  reads: number[];
  writes: InventoryWrite[];
  /** Store a list as if another session saved it: the revision moves on. */
  saveElsewhere: (id: number, items: DnD5eInventoryItem[]) => void;
  /** While set, each GET reads the stored list at once but answers only after it settles. */
  holdReads: Promise<void> | null;
};

// The inventory endpoints as the server enforces them: GMs reach PCs and featured NPCs, players
// only their assigned PCs. `templates` and `assigned` are read on each request, so tests can change them.
// A PUT with a stale expectedRevision is a 409 carrying the stored list, as on the server.
function serveInventory(
  templates: () => DnD5eEntityDetails[],
  assigned: Record<number, DnD5eEntityDetails[]> = {},
  options: { failSave?: string; holdSave?: Promise<void> } = {}
): InventoryServer {
  const inventory: InventoryServer = {
    stored: new Map(), revisions: new Map(), catalog: new Map(), reads: [], writes: [], holdReads: null,
    saveElsewhere: (id, items) => {
      inventory.stored.set(id, items);
      inventory.revisions.set(id, revision(id) + 1);
    },
  };
  const revision = (id: number) => inventory.revisions.get(id) ?? 0;
  const signedIn = () => Number(localStorage.getItem("test-user-id"));
  // The role as the server knows it: one account can be a GM, then a player.
  const signedInAsGm = () => localStorage.getItem("test-user-gm") === "true";
  const reachable = (id: number) => {
    if (!signedInAsGm()) return (assigned[signedIn()] ?? []).some(entity => entity.templateId === id && entity.role === "pc");
    const entity = templates().find(item => item.templateId === id);
    return entity !== undefined && (entity.role === "pc" || (entity.role === "npc" && entity.settings?.compendium?.featured === true));
  };
  const entries = (id: number): DnD5eInventoryEntry[] => (inventory.stored.get(id) ?? []).map(({ itemId, ...row }) => {
    const item = itemId === undefined ? undefined : inventory.catalog.get(itemId);
    // A player gets neither the ID nor the name of a hidden or deleted item.
    if (itemId === undefined || (!signedInAsGm() && (!item || item.hidden))) return row;
    return item ? { ...row, itemId, item } : { ...row, itemId };
  });
  const body = (id: number) => ({ items: entries(id), revision: revision(id) });
  server.use(
    http.get("/api/dnd5e/entities/:id/inventory", async ({ params }) => {
      const id = Number(params.id);
      inventory.reads.push(id);
      const response = reachable(id) ? json(body(id)) : json({ message: "Inventory not found" }, 404);
      await inventory.holdReads;
      return response;
    }),
    http.put("/api/dnd5e/entities/:id/inventory", async ({ params, request }) => {
      const id = Number(params.id);
      const sent = (await request.json()) as { items: DnD5eInventoryItem[]; expectedRevision?: number };
      inventory.writes.push({ id, ...sent });
      if (options.failSave) return apiError(400, options.failSave);
      if (sent.expectedRevision !== undefined && sent.expectedRevision !== revision(id)) {
        return json({ message: "The inventory changed since it was loaded.", ...body(id) }, 409);
      }
      // The server trims text, so the response can differ from what was sent.
      const saved = sent.items.map(item => ({ ...item, name: item.name.trim(), ...(item.notes ? { notes: item.notes.trim() } : {}) }));
      inventory.saveElsewhere(id, saved);
      const response = json(body(id));
      await options.holdSave;
      return response;
    })
  );
  return inventory;
}

// Concrete catalog items for the inventory picker, matched by name like the server's search and
// served one page (offset, limit) at a time.
function serveItemSearch(items: ItemSummary[]) {
  const searches: string[] = [];
  server.use(
    http.get("/api/dnd5e/items", ({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = params.get("q") ?? "";
      const offset = Number(params.get("offset") ?? 0);
      const limit = Number(params.get("limit") ?? 50);
      searches.push(`${q}|${params.getAll("kinds").join(",")}${offset ? `|${offset}` : ""}`);
      const matches = items.filter(item => item.kind === "concrete" && item.name.toLowerCase().includes(q.toLowerCase()));
      const result: ItemListResult = {
        items: matches.slice(offset, offset + limit), total: matches.length, offset, limit,
        facets: { kinds: [], categories: [], origins: [], rarities: [], sources: [] },
      };
      return json(result);
    })
  );
  return searches;
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
        localStorage.setItem("test-user-gm", String(to.isGm));
        void login({ username: to.username, password: "secret" });
      }}
    >
      Switch to {to.username}
    </button>
  );
};

const renderAs = (user: User, route: string, switchTo?: User) => {
  localStorage.setItem("test-user-id", String(user.id));
  localStorage.setItem("test-user-gm", String(user.isGm));
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

  test("a PC's sheet leads with template HP and spells, a Party badge only in the party; traits and actions open on request", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const sheet = await within(await screen.findByLabelText("Entity details")).findByRole("article", { name: "Bram" });
    const facts = within(sheet);
    expect(facts.getByText("Template HP").nextElementSibling).toHaveTextContent("33 (5d10 + 5)");
    // Bram is outside the party: no badge, and no Party line among the vitals.
    expect(facts.queryByText("Party")).not.toBeInTheDocument();
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

    // Aria is in the party: a badge by the role.
    await pressRowInSplitPane(option("Aria"));
    const aria = within(await within(details()).findByRole("article", { name: "Aria" }));
    expect(aria.getByText("Party")).toBeVisible();
  });

  test("a sheet links the items its text names; a spell preview keeps its own item mentions plain; an item link opens Items", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const wand: ItemSummary = { id: 51, kind: "concrete", origin: "imported", name: "Wand", source: "DMG", rarity: "none", requiresAttunement: false, aliases: [] };
    const sword: ItemSummary = { ...wand, id: 52, name: "Longsword", source: "PHB" };
    const armed: DnD5eEntityDetails = {
      ...bram,
      actions: [{ name: "Longsword", description: "Swings a {@item Longsword|PHB|longsword} or a {@item Broom|HB}.", actionType: "action" }],
      spellcasting: [{ ...bram.spellcasting![0], descriptions: ["Casts through a {@item Wand|DMG}."] }],
    };
    const resolveRequests: ItemRef[][] = [];
    server.use(
      http.post("/api/dnd5e/entities/batch", () => json({ entities: [armed] })),
      http.get("/api/dnd5e/spells/:id", () => json({ spell: {
        ...magicMissile, range: "120 feet", materialConsumed: false, duration: "Instantaneous", conditions: [], locallyEdited: false,
        description: "Darts fly from a {@item Wand|DMG}.",
      } })),
      http.post("/api/dnd5e/items/resolve", async ({ request }) => {
        const { refs } = (await request.json()) as { refs: ItemRef[] };
        resolveRequests.push(refs);
        return json({ results: refs.map(ref => ({ ref, item: [wand, sword].find(item => item.name === ref.name && item.source === ref.source) ?? null })) });
      }),
      http.get("/api/dnd5e/items/:id", ({ params }) => {
        const found = [wand, sword].find(item => item.id === Number(params.id));
        return found ? json({ item: { ...found, details: {} } }) : apiError(404, "Item not found");
      })
    );
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const article = await within(await screen.findByLabelText("Entity details")).findByRole("article", { name: "Bram" });
    const sheet = within(article);
    expect(await sheet.findByRole("button", { name: "Wand" })).toBeVisible();
    await user.click(sheet.getByRole("button", { name: "Magic Missile" }));
    const spellPreview = await screen.findByRole("dialog", { name: "Magic Missile" });
    expect(await within(spellPreview).findByText("Darts fly from a Wand.")).toBeVisible();
    expect(within(spellPreview).queryByRole("button", { name: "Wand" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(sheet.getByText("Traits and actions"));
    expect(await sheet.findByRole("button", { name: "longsword" })).toBeVisible();
    expect(sheet.queryByRole("button", { name: "Broom" })).not.toBeInTheDocument();
    expect(article).toHaveTextContent("Swings a longsword or a Broom.");
    // The spellcasting and the traits-and-actions sections each resolve their own text once.
    expect(resolveRequests).toEqual([
      [{ name: "Wand", source: "DMG" }],
      [{ name: "Broom", source: "HB" }, { name: "Longsword", source: "PHB" }],
    ]);

    await user.click(sheet.getByRole("button", { name: "longsword" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Longsword" })).getByRole("link", { name: "Open in Compendium" }));
    expect(tab("Items")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe("/compendium?item=52");
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

type Saves = {
  created: DnD5eEntityDetails[];
  updated: Array<{ id: number; data: Partial<DnD5eEntityDetails> }>;
  patched: Array<{ id: number; patch: unknown }>;
  summaries: number;
};

// A catalog the editor can write to: POST assigns the next ID, PUT updates the template's stat
// block, and the settings PATCH merges the sent settings into the stored ones.
function serveEditableCatalog(initial: DnD5eEntityDetails[], options: { failCreate?: string } = {}) {
  const store = new Map(initial.map(entity => [entity.templateId, entity]));
  let nextId = 101;
  const saves: Saves = { created: [], updated: [], patched: [], summaries: 0 };
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
      const entity: DnD5eEntityDetails = {
        ...data, templateId: nextId++, createdAt: "2026-02-01T00:00:00.000Z", source: "homebrew", imported: false, locallyEdited: false,
      };
      store.set(entity.templateId, entity);
      saves.created.push(entity);
      return json({ insertId: entity.templateId, entity }, 201);
    }),
    http.put("/api/dnd5e/entities/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const { data } = (await request.json()) as { data: Partial<DnD5eEntityDetails> };
      const entity: DnD5eEntityDetails = { ...store.get(id)!, ...data, templateId: id };
      store.set(id, entity);
      saves.updated.push({ id, data });
      return json({ entity });
    }),
    http.patch("/api/dnd5e/entities/:id/settings", async ({ params, request }) => {
      const id = Number(params.id);
      const patch = (await request.json()) as NonNullable<DnD5eEntityDetails["settings"]>;
      const stored = store.get(id)!;
      const settings = { ...stored.settings };
      for (const [group, leaves] of Object.entries(patch)) Object.assign(settings, { [group]: { ...settings[group as keyof typeof settings], ...leaves } });
      store.set(id, { ...stored, settings });
      saves.patched.push({ id, patch });
      return json({ settings });
    })
  );
  serveInventory(() => [...store.values()]);
  return saves;
}

type TestUser = ReturnType<typeof userEvent.setup>;
const editor = () => within(details()).getByRole("toolbar", { name: "Editing" });
// The GM's Edit lives in the sheet's actions menu; it opens the sheet in edit mode.
const openEdit = async (user: TestUser, name: string) => {
  await user.click(await within(details()).findByRole("button", { name: `Actions for ${name}` }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  expect(editor()).toBeVisible();
};
const rename = async (user: TestUser, from: string, to: string) => {
  // The inline editor opens with its text selected, so typing replaces it.
  await user.click(within(details()).getByRole("button", { name: `Edit Name, ${from}` }));
  await user.keyboard(`${to}{Enter}`);
};
const saveEdits = async (user: TestUser) => {
  await user.click(within(editor()).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(within(details()).queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument());
};
const listedNames = () => within(screen.getByRole("listbox", { name: "Entities" })).getAllByRole("option")
  .map(item => item.textContent?.match(/^(Mara|Goblin|Wolf)/)?.[0]);

describe("GM create and edit", () => {
  test("creating an NPC from an empty catalog selects its generated ID, and it can be edited right away", async () => {
    const user = userEvent.setup();
    const saves = serveEditableCatalog([]);
    renderAs(gm, "/compendium?section=entities");

    await user.click(await screen.findByRole("button", { name: "New entity" }));
    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=new"));
    await rename(user, "New Entity", "Mara");
    await user.click(within(details()).getByRole("button", { name: /^Edit Type/ }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Role" }), "NPC");
    await user.click(screen.getByRole("button", { name: "Done" }));
    await saveEdits(user);

    const id = saves.created[0]?.templateId;
    expect(id).toBe(101);
    expect(saves.created[0]).toMatchObject({ name: "Mara", role: "npc" });
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${id}`));
    expect(await within(details()).findByRole("heading", { name: "Mara" })).toBeVisible();
    expect(option("Mara")).toHaveAttribute("aria-selected", "true");

    await openEdit(user, "Mara");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${id}&edit=1`));
    await user.click(within(details()).getByRole("button", { name: "Edit Armor Class, 10" }));
    await user.keyboard("15{Enter}");
    await saveEdits(user);

    expect(saves.updated.map(save => [save.id, save.data.ac])).toEqual([[id, 15]]);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${id}`));
    expect(within(details()).getByText("AC").nextElementSibling).toHaveTextContent("15");
    expect(saves.summaries).toBe(1);
  });

  test("a failed save keeps the draft and shows the error; Cancel returns to the previous selection", async () => {
    const user = userEvent.setup();
    serveEditableCatalog([mara], { failCreate: "Database unavailable" });
    renderAs(gm, `/compendium?entity=${mara.templateId}`);
    await within(await screen.findByLabelText("Entity details")).findByRole("heading", { name: "Mara" });

    await user.click(screen.getByRole("button", { name: "New entity" }));
    await rename(user, "New Entity", "Wolf");
    await user.click(within(editor()).getByRole("button", { name: "Save" }));

    expect(await within(details()).findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(within(details()).getByRole("button", { name: "Edit Name, Wolf" })).toBeVisible();

    await user.click(within(editor()).getByRole("button", { name: "Cancel" }));
    const confirm = within(within(details()).getByRole("group", { name: "Discard unsaved changes?" }));
    await user.click(confirm.getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${mara.templateId}`));
    expect(within(details()).getByRole("heading", { name: "Mara" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  test("marking an NPC Featured lists it under Featured NPCs without a reload and keeps its other settings", async () => {
    const user = userEvent.setup();
    const saves = serveEditableCatalog([{ ...mara, settings: { combat: { deathSaves: true } }, controllerUserIds: [2] }, goblin]);
    renderAs(gm, `/compendium?entity=${mara.templateId}`);
    const views = within(await screen.findByRole("group", { name: "Entity views" }));
    await user.click(views.getByRole("button", { name: "Featured NPCs" }));
    expect(screen.getByText("No entities match.")).toBeVisible();

    await openEdit(user, "Mara");
    await user.click(within(details()).getByRole("checkbox", { name: /Featured NPC/ }));
    await saveEdits(user);

    expect(saves.updated[0]?.data).not.toHaveProperty("settings");
    expect(saves.patched).toEqual([{ id: mara.templateId, patch: { compendium: { featured: true } } }]);
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
    await rename(user, "New Entity", "Wolf");
    await saveEdits(user);

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
    expect(queryClient.getQueriesData({ queryKey: INVENTORY_KEYS.viewer({ userId: player.id, isGm: false }) })).toEqual([]);
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
// Collapsed by default; opening it loads the list.
const openInventory = async (user: ReturnType<typeof userEvent.setup>, container: HTMLElement) => {
  const region = await inventoryOf(container);
  await user.click(within(region).getByText("Inventory"));
  return region;
};
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

    await inventoryOf(await screen.findByLabelText("Entity details"));
    expect(inventory.reads).toEqual([]);
    const region = await openInventory(user, details());
    expect(await within(region).findByText("Nothing in the inventory yet.")).toBeVisible();
    await user.click(within(region).getByRole("button", { name: "Add item" }));
    const editor = within(within(region).getByRole("form", { name: "Edit inventory" }));
    // The editor opens on a blank row, ready to type in.
    expect(editor.getByLabelText("Item 1 name")).toHaveFocus();
    expect(editor.getByLabelText("Item 1 quantity")).toHaveValue(1);
    // Item 4 stays blank: a blank row at the end is not saved.
    for (let i = 0; i < 3; i++) await user.click(editor.getByRole("button", { name: "Add item" }));
    expect(editor.getByLabelText("Item 4 name")).toHaveValue("");

    await typeInSplitPane(user, editor.getByLabelText("Item 1 name"), "  Potion of healing ");
    await user.clear(editor.getByLabelText("Item 1 quantity"));
    await typeInSplitPane(user, editor.getByLabelText("Item 1 quantity"), "2");
    await typeInSplitPane(user, editor.getByLabelText("Item 2 name"), "Rope");
    await typeInSplitPane(user, editor.getByLabelText("Item 3 name"), "Iron key");
    await typeInSplitPane(user, editor.getByLabelText("Item 3 notes"), "Opens the crypt");
    await user.click(editor.getByRole("button", { name: "Remove item 2" }));
    await user.click(editor.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(within(region).queryByRole("form")).not.toBeInTheDocument());
    expect(inventory.writes).toEqual([{ id: bram.templateId, expectedRevision: 0, items: [
      { name: "  Potion of healing ", quantity: 2 },
      { name: "Iron key", quantity: 1, notes: "Opens the crypt" },
    ] }]);
    expect(inventoryRows(region)).toEqual([["Potion of healing", "2", ""], ["Iron key", "1", "Opens the crypt"]]);
    expect(queryClient.getQueryData(INVENTORY_KEYS.detail(gmViewer, bram.templateId)))
      .toEqual({ items: inventory.stored.get(bram.templateId), revision: 1 });
    expect(inventory.reads).toEqual([bram.templateId]);
  });

  test("a failed save keeps the draft and shows the error; Cancel returns to the saved list", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES, {}, { failSave: "Item 1: quantity must be a whole number of at least 1" });
    inventory.stored.set(bram.templateId, [{ name: "Potion of healing", quantity: 2 }]);
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const region = await openInventory(user, await screen.findByLabelText("Entity details"));
    await user.click(await within(region).findByRole("button", { name: "Add item" }));
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
      await openEdit(user, "Mara");
      await user.click(within(details()).getByRole("checkbox", { name: /Featured NPC/ }));
      await saveEdits(user);
    };
    // Serve the inventory as if for the catalog's current Featured setting.
    let featured = false;
    const served = serveInventory(() => (featured ? [{ ...mara, settings: { compendium: { featured: true } } }] : []));
    served.stored.set(mara.templateId, [{ name: "Silver dagger", quantity: 1, notes: "Engraved" }]);

    featured = true;
    await toggleFeatured();
    const region = await openInventory(user, details());
    await waitFor(() => expect(inventoryRows(region)).toEqual([["Silver dagger", "1", "Engraved"]]));

    featured = false;
    await toggleFeatured();
    expect(within(details()).queryByRole("region", { name: "Inventory" })).not.toBeInTheDocument();

    featured = true;
    await toggleFeatured();
    const reopened = await openInventory(user, details());
    await waitFor(() => expect(inventoryRows(reopened)).toEqual([["Silver dagger", "1", "Engraved"]]));
  });

  test("a player reads their PC's inventory without edit controls, refreshed when they reopen Entities", async () => {
    const user = userEvent.setup();
    const assigned = { [player.id]: [bram] };
    serveCompendiumApi(assigned);
    const inventory = serveInventory(() => TEMPLATES, assigned);
    inventory.stored.set(bram.templateId, [{ name: "Potion of healing", quantity: 2 }]);
    renderAs(player, `/compendium?entity=${bram.templateId}`);

    const region = await openInventory(user, await screen.findByLabelText("Character details"));
    await waitFor(() => expect(inventoryRows(region)).toEqual([["Potion of healing", "2", ""]]));
    expect(within(region).queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();

    await user.click(tab("Spells"));
    inventory.stored.set(bram.templateId, [{ name: "Potion of healing", quantity: 1 }, { name: "Iron key", quantity: 1 }]);
    await user.click(tab("Entities"));

    await waitFor(() => expect(inventoryRows(region)).toEqual([["Potion of healing", "1", ""], ["Iron key", "1", ""]]));
    expect(inventory.reads).toEqual([bram.templateId, bram.templateId]);
  });
});

describe("linked inventory", () => {
  const summary = (id: number, name: string, patch: Partial<ItemSummary> = {}): ItemSummary => ({
    id, kind: "concrete", origin: "imported", name, source: "DMG", rarity: "uncommon", requiresAttunement: false, aliases: [], ...patch,
  });
  const family = { id: 1, name: "+1 Weapon", source: "DMG" };
  const plusOnePhb = summary(4, "+1 Longsword", { family, base: { id: 2, name: "Longsword", source: "PHB" } });
  const plusOneXphb = summary(5, "+1 Longsword", { family, base: { id: 3, name: "Longsword", source: "XPHB" } });
  const lantern = summary(6, "Whispering Lantern", { source: "HB", origin: "homebrew", gm: { hidden: true, hiddenByFamily: false } });
  const CATALOG = [summary(1, "+1 Weapon", { kind: "family" }), plusOnePhb, plusOneXphb, lantern];

  const openEditor = async (user: ReturnType<typeof userEvent.setup>) => {
    const region = await openInventory(user, await screen.findByLabelText("Entity details"));
    await user.click(await within(region).findByRole("button", { name: "Add item" }));
    return { region, editor: within(within(region).getByRole("form", { name: "Edit inventory" })) };
  };

  test("a GM links a free-text row to an exact printing; the saved label stays and the row then opens the item", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES);
    inventory.stored.set(bram.templateId, [{ name: "Old sword", quantity: 1 }]);
    const searches = serveItemSearch(CATALOG);
    server.use(http.get("/api/dnd5e/items/:id", () => json({ message: "Item not found" }, 404)));
    renderAs(gm, `/compendium?entity=${bram.templateId}&campaign=7`);

    const { region, editor } = await openEditor(user);
    await user.click(editor.getByRole("button", { name: "Link item 1 to a catalog item" }));
    const picker = within(editor.getByRole("group", { name: "Choose a catalog item for item 1" }));
    await typeInSplitPane(user, picker.getByRole("searchbox", { name: "Search the item catalog" }), "+1 long");

    // Only concrete items are searched, and the two printings differ by their base.
    const results = within(await picker.findByRole("list", { name: "Matching items" }));
    expect(results.getAllByRole("button").map(button => button.textContent))
      .toEqual(["+1 LongswordDMG · Longsword (PHB)", "+1 LongswordDMG · Longsword (XPHB)"]);
    expect(searches.at(-1)).toBe("+1 long|concrete");
    await user.click(results.getByRole("button", { name: /Longsword \(XPHB\)/ }));
    expect(editor.getByText("Linked to +1 Longsword (DMG)")).toBeVisible();
    expect(editor.getByLabelText("Item 1 name")).toHaveValue("Old sword");

    inventory.catalog.set(plusOneXphb.id, { name: "+1 Longsword", source: "DMG" });
    await user.click(editor.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(region).queryByRole("form")).not.toBeInTheDocument());
    expect(inventory.writes).toEqual([
      { id: bram.templateId, expectedRevision: 0, items: [{ name: "Old sword", quantity: 1, itemId: plusOneXphb.id }] },
    ]);

    const itemLink = within(region).getByRole("link", { name: "+1 Longsword" });
    expect(within(region).getByText("Saved as “Old sword”")).toBeVisible();
    await user.click(itemLink);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?campaign=7&item=${plusOneXphb.id}`));
    expect(tab("Items")).toHaveAttribute("aria-selected", "true");
  });

  test("Detach keeps the label without its link; Add from catalog adds a row named after the item; a deleted link is marked", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES);
    inventory.stored.set(bram.templateId, [
      { name: "Old sword", quantity: 1, itemId: plusOnePhb.id },
      { name: "Lost ring", quantity: 1, itemId: 99 },
    ]);
    inventory.catalog.set(plusOnePhb.id, { name: "+1 Longsword", source: "DMG" });
    serveItemSearch(CATALOG);
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const region = await openInventory(user, await screen.findByLabelText("Entity details"));
    // Item 99 was deleted from the catalog: the GM sees the saved name and why it has no link.
    await waitFor(() => expect(within(region).getByText("Catalog item deleted")).toBeVisible());
    await user.click(within(region).getByRole("button", { name: "Add item" }));
    const editor = within(within(region).getByRole("form", { name: "Edit inventory" }));
    expect(editor.getByText("Linked to a deleted catalog item")).toBeVisible();

    await user.click(editor.getByRole("button", { name: "Detach item 1 from its catalog item" }));
    expect(editor.queryByText("Linked to +1 Longsword (DMG)")).not.toBeInTheDocument();
    await user.click(editor.getByRole("button", { name: "Add from catalog" }));
    const picker = within(editor.getByRole("group", { name: "Add an item from the catalog" }));
    await typeInSplitPane(user, picker.getByRole("searchbox", { name: "Search the item catalog" }), "lantern");
    await user.click(await picker.findByRole("button", { name: /Whispering Lantern/ }));
    expect(editor.getByLabelText("Item 3 name")).toHaveValue("Whispering Lantern");
    expect(editor.getByText(/Linked to Whispering Lantern \(HB\) · Hidden from players/)).toBeVisible();

    await user.click(editor.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(inventory.writes).toHaveLength(1));
    expect(inventory.writes[0].items).toEqual([
      { name: "Old sword", quantity: 1 },
      { name: "Lost ring", quantity: 1, itemId: 99 },
      { name: "Whispering Lantern", quantity: 1, itemId: lantern.id },
    ]);
  });

  test("a stale save keeps the draft; the GM can load the other save or save over it with the new revision", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES);
    inventory.saveElsewhere(bram.templateId, [{ name: "Rope", quantity: 1 }]);
    const { queryClient } = renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const opened = await openEditor(user);
    const { region } = opened;
    let { editor } = opened;
    // Someone gives Bram a torch while this editor is open.
    inventory.saveElsewhere(bram.templateId, [{ name: "Rope", quantity: 1 }, { name: "Torch", quantity: 2 }]);
    await typeInSplitPane(user, editor.getByLabelText("Item 2 name"), "Lantern");
    await user.click(editor.getByRole("button", { name: "Save" }));

    expect(await editor.findByRole("alert")).toHaveTextContent("Someone changed this inventory");
    expect(editor.getByLabelText("Item 2 name")).toHaveValue("Lantern");
    expect(queryClient.getQueryData(INVENTORY_KEYS.detail(gmViewer, bram.templateId)))
      .toEqual({ items: [{ name: "Rope", quantity: 1 }, { name: "Torch", quantity: 2 }], revision: 2 });

    await user.click(editor.getByRole("button", { name: "Discard mine and load theirs" }));
    editor = within(within(region).getByRole("form", { name: "Edit inventory" }));
    expect(editor.getByLabelText("Item 2 name")).toHaveValue("Torch");
    expect(editor.getByLabelText("Item 3 name")).toHaveValue("");

    inventory.saveElsewhere(bram.templateId, [{ name: "Rope", quantity: 3 }]);
    await user.clear(editor.getByLabelText("Item 2 quantity"));
    await typeInSplitPane(user, editor.getByLabelText("Item 2 quantity"), "5");
    await user.click(editor.getByRole("button", { name: "Save" }));
    await user.click(await editor.findByRole("button", { name: "Save mine over theirs" }));

    await waitFor(() => expect(within(region).queryByRole("form")).not.toBeInTheDocument());
    expect(inventory.writes.map(write => write.expectedRevision)).toEqual([1, 2, 3]);
    expect(inventoryRows(region)).toEqual([["Rope", "1", ""], ["Torch", "5", ""]]);
  });

  test("a player follows a visible linked item; a hidden one shows only its saved label, quantity and notes", async () => {
    const user = userEvent.setup();
    const assigned = { [player.id]: [bram] };
    serveCompendiumApi(assigned);
    const inventory = serveInventory(() => TEMPLATES, assigned);
    inventory.stored.set(bram.templateId, [
      { name: "Sword", quantity: 1, itemId: plusOnePhb.id },
      { name: "Strange lamp", quantity: 2, notes: "Warm", itemId: lantern.id },
    ]);
    // As the server answers a player: the hidden lantern has no catalog entry for them.
    inventory.catalog.set(plusOnePhb.id, { name: "+1 Longsword", source: "DMG" });
    renderAs(player, `/compendium?entity=${bram.templateId}`);

    const region = await openInventory(user, await screen.findByLabelText("Character details"));
    await waitFor(() => expect(inventoryRows(region)).toEqual([
      ["+1 LongswordSaved as “Sword”", "1", ""],
      ["Strange lamp", "2", "Warm"],
    ]));
    expect(within(region).getAllByRole("link").map(link => link.textContent)).toEqual(["+1 Longsword"]);
    expect(within(region).queryByText(/deleted|Hidden/)).not.toBeInTheDocument();
  });

  test("13-F011: when one account switches from GM to player, the player reads its own redacted inventory and a late GM save stays out", async () => {
    const user = userEvent.setup();
    const samGm = testUser({ id: 5, username: "sam", isGm: true });
    const samPlayer = testUser({ id: 5, username: "sam", isGm: false });
    const assigned = { [samGm.id]: [bram] };
    serveCompendiumApi(assigned);
    let releaseSave = () => {};
    const inventory = serveInventory(() => TEMPLATES, assigned, { holdSave: new Promise<void>(resolve => { releaseSave = resolve; }) });
    inventory.stored.set(bram.templateId, [{ name: "Strange lamp", quantity: 1, itemId: lantern.id }]);
    inventory.catalog.set(lantern.id, { name: "Whispering Lantern", source: "HB", hidden: true });
    const { queryClient } = renderAs(samGm, `/compendium?entity=${bram.templateId}`, samPlayer);

    // As GM: the hidden item's name and link, then a save the server is slow to answer.
    const region = await openInventory(user, await screen.findByLabelText("Entity details"));
    expect(await within(region).findByRole("link", { name: "Whispering Lantern" })).toBeVisible();
    await user.click(within(region).getByRole("button", { name: "Add item" }));
    await user.click(within(region).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(inventory.writes).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "Switch to sam" }));
    await screen.findByRole("listbox", { name: "My characters" });
    pressRowInSplitPane(option("Bram"));
    const playerRegion = await openInventory(user, await within(details("Character details")).findByRole("article", { name: "Bram" }));
    await waitFor(() => expect(inventoryRows(playerRegion)).toEqual([["Strange lamp", "1", ""]]));
    expect(within(playerRegion).queryByRole("link")).not.toBeInTheDocument();
    expect(inventory.reads).toEqual([bram.templateId, bram.templateId]);

    releaseSave();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(queryClient.getQueriesData({ queryKey: INVENTORY_KEYS.viewer({ userId: samGm.id, isGm: true }) })).toEqual([]);
    expect(inventoryRows(playerRegion)).toEqual([["Strange lamp", "1", ""]]);
    expect(screen.queryByText("Whispering Lantern")).not.toBeInTheDocument();
  });

  test("13-F012: back on Entities, a player's collapsed or open inventory shows only a fresh answer, never a since-hidden link", async () => {
    const user = userEvent.setup();
    const assigned = { [player.id]: [aria] };
    serveCompendiumApi(assigned);
    const inventory = serveInventory(() => TEMPLATES, assigned);
    inventory.stored.set(aria.templateId, [
      { name: "Lamp", quantity: 2, itemId: lantern.id },
      { name: "Sword", quantity: 1, itemId: plusOnePhb.id },
    ]);
    inventory.catalog.set(lantern.id, { name: "Whispering Lantern", source: "HB" });
    inventory.catalog.set(plusOnePhb.id, { name: "+1 Longsword", source: "DMG" });
    renderAs(player, `/compendium?entity=${aria.templateId}`);
    let release = () => {};
    // The GM hides an item while the player is on Spells; the player's next inventory read is slow.
    const hideWhileAway = async (itemId: number, link: DnD5eInventoryItemLink) => {
      await user.click(tab("Spells"));
      inventory.catalog.set(itemId, { ...link, hidden: true });
      inventory.holdReads = new Promise<void>(resolve => { release = resolve; });
      await user.click(tab("Entities"));
    };

    // Opened, then collapsed before leaving.
    const region = await openInventory(user, await screen.findByLabelText("Character details"));
    expect(await within(region).findByRole("link", { name: "Whispering Lantern" })).toBeVisible();
    await user.click(within(region).getByText("Inventory"));
    await hideWhileAway(lantern.id, { name: "Whispering Lantern", source: "HB" });
    await user.click(within(region).getByText("Inventory"));
    expect(await within(region).findByText("Loading the inventory…")).toBeVisible();
    expect(within(region).queryByRole("link")).not.toBeInTheDocument();
    release();
    await waitFor(() => expect(inventoryRows(region)).toEqual([["Lamp", "2", ""], ["+1 LongswordSaved as “Sword”", "1", ""]]));
    expect(within(region).getAllByRole("link").map(link => link.textContent)).toEqual(["+1 Longsword"]);

    // Left open.
    await hideWhileAway(plusOnePhb.id, { name: "+1 Longsword", source: "DMG" });
    expect(within(region).getByText("Loading the inventory…")).toBeVisible();
    expect(within(region).queryByRole("link")).not.toBeInTheDocument();
    release();
    await waitFor(() => expect(inventoryRows(region)).toEqual([["Lamp", "2", ""], ["Sword", "1", ""]]));
    expect(within(region).queryByRole("link")).not.toBeInTheDocument();
  });

  test("13-F018: back on Entities, a player's sheet waits for a fresh item lookup and a since-hidden item reads as authored", async () => {
    const user = userEvent.setup();
    const wand: ItemSummary = { id: 51, kind: "concrete", origin: "imported", name: "Wand", source: "DMG", rarity: "none", requiresAttunement: false, aliases: [] };
    const sword: ItemSummary = { ...wand, id: 52, name: "Longsword", source: "PHB" };
    const armed: DnD5eEntityDetails = {
      ...aria,
      actions: [{ name: "Strike", description: "Swings a {@item Longsword|PHB|longsword} or waves a {@item Wand|DMG}.", actionType: "action" }],
    };
    serveCompendiumApi({ [player.id]: [armed] });
    const hidden = new Set<number>();
    const resolveRequests: ItemRef[][] = [];
    const hold: { reads?: Promise<void> } = {};
    server.use(
      http.post("/api/dnd5e/items/resolve", async ({ request }) => {
        const { refs } = (await request.json()) as { refs: ItemRef[] };
        resolveRequests.push(refs);
        await hold.reads;
        const visible = [wand, sword].filter(item => !hidden.has(item.id));
        return json({ results: refs.map(ref => ({ ref, item: visible.find(item => item.name === ref.name && item.source === ref.source) ?? null })) });
      }),
      http.get("/api/dnd5e/items/:id", ({ params }) => {
        const found = [wand, sword].find(item => item.id === Number(params.id) && !hidden.has(item.id));
        return found ? json({ item: { ...found, details: {} } }) : apiError(404, "Item not found");
      })
    );
    renderAs(player, `/compendium?entity=${aria.templateId}`);

    const article = await within(await screen.findByLabelText("Character details")).findByRole("article", { name: "Aria" });
    const sheet = within(article);
    await user.click(sheet.getByText("Traits and actions"));
    expect(await sheet.findByRole("button", { name: "Wand" })).toBeVisible();
    expect(resolveRequests).toHaveLength(1);

    // Away on Spells, the GM hides the wand; the player's next lookup is slow.
    await user.click(tab("Spells"));
    hidden.add(wand.id);
    let release = () => {};
    hold.reads = new Promise<void>(resolve => { release = resolve; });
    await user.click(tab("Entities"));

    expect(await sheet.findByText(/Swings a longsword or waves a Wand\./)).toBeVisible();
    expect(sheet.queryByRole("button", { name: "Wand" })).not.toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: "longsword" })).not.toBeInTheDocument();
    await waitFor(() => expect(resolveRequests).toHaveLength(2));

    release();
    expect(await sheet.findByRole("button", { name: "longsword" })).toBeVisible();
    expect(sheet.queryByRole("button", { name: "Wand" })).not.toBeInTheDocument();
  });

  test("13-F014: on a narrow screen, Escape from the picker's Cancel or a result closes only the picker and keeps the draft", async () => {
    installMatchMedia(500);
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES);
    inventory.stored.set(bram.templateId, [{ name: "Old sword", quantity: 1 }]);
    serveItemSearch(CATALOG);
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const dialog = await screen.findByRole("dialog", { name: "Bram" });
    const region = await openInventory(user, dialog);
    await user.click(await within(region).findByRole("button", { name: "Add item" }));
    const editor = within(within(region).getByRole("form", { name: "Edit inventory" }));
    await user.type(editor.getByLabelText("Item 2 name"), "Lantern");
    const linkButton = editor.getByRole("button", { name: "Link item 1 to a catalog item" });
    const pickerName = "Choose a catalog item for item 1";

    await user.click(linkButton);
    act(() => within(editor.getByRole("group", { name: pickerName })).getByRole("button", { name: "Cancel" }).focus());
    await user.keyboard("{Escape}");
    expect(editor.queryByRole("group", { name: pickerName })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Bram" })).toBeVisible();
    expect(editor.getByLabelText("Item 2 name")).toHaveValue("Lantern");
    expect(linkButton).toHaveFocus();

    await user.keyboard("{Enter}");
    const picker = within(editor.getByRole("group", { name: pickerName }));
    await user.type(picker.getByRole("searchbox", { name: "Search the item catalog" }), "+1 long");
    const result = (await picker.findAllByRole("button", { name: /Longsword \(PHB\)/ }))[0];
    act(() => result.focus());
    await user.keyboard("{Escape}");
    expect(editor.queryByRole("group", { name: pickerName })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Bram" })).toBeVisible();
    expect(editor.getByLabelText("Item 2 name")).toHaveValue("Lantern");
    expect(linkButton).toHaveFocus();
  });

  test("13-F015: every printing of one name can be reached in the picker; the 21st is linked and saved with its own ID", async () => {
    const user = userEvent.setup();
    serveCompendiumApi({});
    const inventory = serveInventory(() => TEMPLATES);
    inventory.stored.set(bram.templateId, [{ name: "Warm ring", quantity: 1 }]);
    const printings = Array.from({ length: 21 }, (_, index) =>
      summary(200 + index, "Ring of Warmth", { source: `B${String(index + 1).padStart(2, "0")}` }));
    const searches = serveItemSearch(printings);
    renderAs(gm, `/compendium?entity=${bram.templateId}`);

    const { region, editor } = await openEditor(user);
    await user.click(editor.getByRole("button", { name: "Link item 1 to a catalog item" }));
    const picker = within(editor.getByRole("group", { name: "Choose a catalog item for item 1" }));
    await typeInSplitPane(user, picker.getByRole("searchbox", { name: "Search the item catalog" }), "ring of warmth");
    const results = within(await picker.findByRole("list", { name: "Matching items" }));
    expect(results.getAllByRole("button")).toHaveLength(20);
    expect(picker.getByText("Showing 20 of 21.")).toBeVisible();

    await user.click(picker.getByRole("button", { name: "Show more items" }));
    const last = await results.findByRole("button", { name: /B21/ });
    expect(searches.at(-1)).toBe("ring of warmth|concrete|20");
    expect(picker.queryByRole("button", { name: "Show more items" })).not.toBeInTheDocument();
    await user.click(last);
    expect(editor.getByText("Linked to Ring of Warmth (B21)")).toBeVisible();

    await user.click(editor.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(region).queryByRole("form")).not.toBeInTheDocument());
    expect(inventory.writes[0].items).toEqual([{ name: "Warm ring", quantity: 1, itemId: 220 }]);
  });
});
