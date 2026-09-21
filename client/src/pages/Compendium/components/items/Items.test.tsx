import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ITEM_LIST_LIMITS,
  type Item,
  type ItemFacets,
  type ItemInput,
  type ItemListResult,
  type ItemMembersResult,
  type ItemRef,
  type ItemResolveResult,
  type ItemSummary,
} from "shared/domain/dnd5e/item.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import type { User } from "src/api/types.js";
import { installLayoutApis, installMatchMedia, setViewportWidth } from "src/test/fakes/matchMedia.js";
import { apiError, json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl, go } from "src/test/routerProbe.js";
import type { DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import type { WriteIssue } from "shared/domain/writeValidation.js";
import type { DnD5eInventory } from "shared/domain/encounters/dnd5e/inventory.js";
import { INVENTORY_KEYS } from "../../api/query/inventoryKeys.js";
import { ITEM_KEYS } from "../../api/query/itemKeys.js";
import { Compendium } from "../Compendium.js";

const gm = testUser({ id: 1, username: "gm", isGm: true });
const player = testUser({ id: 2, username: "player", isGm: false });

const item = (id: number, name: string, patch: Partial<Item> = {}): Item => ({
  id,
  kind: "concrete",
  origin: "imported",
  name,
  source: "PHB",
  rarity: "none",
  requiresAttunement: false,
  aliases: [],
  details: {},
  ...patch,
});

// A family, two printings of its base and the specific generated for each, a named item, and a
// GM-hidden item. The two "+1 Longsword" rows differ only by their base printing.
const weaponFamily = item(1, "+1 Weapon", { kind: "family", source: "DMG", rarity: "uncommon", details: { bonusWeapon: "+1" } });
const longswordPhb = item(2, "Longsword", { category: "melee weapon", valueCp: 1500, weightLb: 3, details: { damage: { dice: "1d8", type: "slashing", versatileDice: "1d10" } } });
const longswordXphb = item(3, "Longsword", { source: "XPHB", category: "melee weapon", valueCp: 1500 });
const link = (target: Item) => ({ id: target.id, name: target.name, source: target.source });
const plusOnePhb = item(4, "+1 Longsword", { source: "DMG", page: 213, category: "melee weapon", rarity: "uncommon", family: link(weaponFamily), base: link(longswordPhb) });
const plusOneXphb = item(5, "+1 Longsword", { source: "DMG", category: "melee weapon", rarity: "uncommon", family: link(weaponFamily), base: link(longswordXphb) });
const bagOfHolding = item(6, "Bag of Holding", {
  source: "DMG", category: "wondrous item", rarity: "uncommon", details: { description: "This bag has an interior space." },
});
const secretBlade = item(7, "Secret Blade", { source: "homebrew", origin: "homebrew", category: "melee weapon" });

type Stored = { item: Item; hidden: boolean; deleted: boolean; edited?: boolean };

type Catalog = {
  stored: Map<number, Stored>;
  listRequests: URLSearchParams[];
  resolveRequests: ItemRef[][];
  /** Set to hold the next resolve or item-page answers until the promise settles. */
  holds: { resolve?: Promise<void>; detail?: Promise<void> };
  /** The item IDs of item page reads, in order. */
  detailRequests: number[];
  writes: Array<{ method: string; id?: number; body?: unknown }>;
};

const signedIn = () => Number(localStorage.getItem("test-user-id"));
const viewerIsGm = () => signedIn() === gm.id;

const summaryOf = (stored: Stored, isGm: boolean, family?: Stored): ItemSummary => {
  const summary: ItemSummary = { ...stored.item };
  delete (summary as Partial<Item>).page;
  delete (summary as Partial<Item>).details;
  delete summary.gm;
  return isGm ? { ...summary, gm: { hidden: stored.hidden, hiddenByFamily: family?.hidden ?? false } } : summary;
};

// The catalog API as step 03 documents it: players never see hidden items or the specifics of a
// hidden family, specifics are left out of a plain browse, and results sort by name and source.
function serveCatalog(items: Item[], options: {
  hidden?: number[];
  failCreate?: string;
  groupMembers?: Record<number, number[]>;
  holdWrite?: Promise<void>;
  /** Answer each PUT with a 400 that lists these field issues. */
  rejectPut?: WriteIssue[];
} = {}): Catalog {
  const catalog: Catalog = {
    stored: new Map(items.map(entry => [entry.id, { item: entry, hidden: options.hidden?.includes(entry.id) ?? false, deleted: false }])),
    listRequests: [],
    resolveRequests: [],
    holds: {},
    detailRequests: [],
    writes: [],
  };
  let nextId = 100;
  const familyOf = (stored: Stored) => (stored.item.family ? catalog.stored.get(stored.item.family.id) : undefined);
  const visible = (stored: Stored) => {
    if (stored.deleted) return false;
    if (viewerIsGm()) return true;
    return !stored.hidden && !familyOf(stored)?.hidden;
  };
  const toDetail = (stored: Stored): Item => (viewerIsGm()
    ? { ...stored.item, gm: { hidden: stored.hidden, hiddenByFamily: familyOf(stored)?.hidden ?? false, locallyEdited: stored.edited ?? false } }
    : stored.item);
  const fromInput = (id: number, input: ItemInput, previous?: Item): Item => {
    const { baseItemId, ...rest } = input;
    const base = baseItemId === undefined ? previous?.base : link(catalog.stored.get(baseItemId)!.item);
    return { ...item(id, input.name), ...previous, ...rest, ...(base ? { base } : {}), id };
  };

  server.use(
    http.get("/api/dnd5e/items", ({ request }) => {
      const params = new URL(request.url).searchParams;
      catalog.listRequests.push(params);
      const q = params.get("q")?.toLowerCase();
      const specifics = params.has("specifics") ? params.get("specifics") === "true" : q !== undefined;
      const scoped = [...catalog.stored.values()]
        .filter(visible)
        .filter(stored => specifics || !stored.item.family)
        .filter(stored => !q || stored.item.name.toLowerCase().includes(q));
      const sources = params.getAll("sources");
      const kinds = params.getAll("kinds");
      const matching = scoped
        .filter(stored => sources.length === 0 || sources.includes(stored.item.source))
        .filter(stored => kinds.length === 0 || kinds.includes(stored.item.kind))
        .sort((a, b) => a.item.name.localeCompare(b.item.name) || a.item.source.localeCompare(b.item.source) || a.item.id - b.item.id);
      const offset = Number(params.get("offset") ?? 0);
      const limit = params.has("limit") ? Number(params.get("limit")) : null;
      const unique = <Value,>(values: Value[]) => [...new Set(values)];
      const facets: ItemFacets = {
        kinds: unique(scoped.map(stored => stored.item.kind)),
        categories: unique(scoped.flatMap(stored => (stored.item.category ? [stored.item.category] : []))),
        origins: unique(scoped.map(stored => stored.item.origin)),
        rarities: unique(scoped.map(stored => stored.item.rarity)),
        sources: unique(scoped.map(stored => stored.item.source)).sort(),
      };
      const result: ItemListResult = {
        items: matching.slice(offset, limit === null ? undefined : offset + limit).map(stored => summaryOf(stored, viewerIsGm(), familyOf(stored))),
        total: matching.length,
        offset,
        limit,
        facets,
      };
      return json(result);
    }),
    // Step 03: a source restricts the candidates, names match without case, only items the viewer
    // can see count, and two candidates are ambiguous. Each answer is null or a visible summary.
    http.post("/api/dnd5e/items/resolve", async ({ request }) => {
      const { refs } = (await request.json()) as { refs: ItemRef[] };
      catalog.resolveRequests.push(refs);
      await catalog.holds.resolve;
      if (refs.length > 100) return apiError(400, "Resolve at most 100 references at a time.");
      const result: ItemResolveResult = {
        results: refs.map(ref => {
          const candidates = [...catalog.stored.values()].filter(stored => visible(stored)
            && stored.item.name.toLowerCase() === ref.name.toLowerCase()
            && (!ref.source || stored.item.source.toLowerCase() === ref.source.toLowerCase()));
          return { ref, item: candidates.length === 1 ? summaryOf(candidates[0], viewerIsGm(), familyOf(candidates[0])) : null };
        }),
      };
      return json(result);
    }),
    http.get("/api/dnd5e/items/:id", async ({ params }) => {
      catalog.detailRequests.push(Number(params.id));
      await catalog.holds.detail;
      const stored = catalog.stored.get(Number(params.id));
      return stored && visible(stored) ? json({ item: toDetail(stored) }) : apiError(404, "Item not found");
    }),
    http.get("/api/dnd5e/items/:id/members", ({ params }) => {
      const stored = catalog.stored.get(Number(params.id));
      if (!stored || !visible(stored)) return apiError(404, "Item not found");
      const members = stored.item.kind === "family"
        ? [...catalog.stored.values()].filter(entry => entry.item.family?.id === stored.item.id && visible(entry))
        : (options.groupMembers?.[stored.item.id] ?? []).map(id => catalog.stored.get(id)!).filter(visible);
      const result: ItemMembersResult = {
        relation: stored.item.kind === "family" ? "specific" : stored.item.kind === "group" ? "group_member" : null,
        members: members.map(entry => ({ item: summaryOf(entry, viewerIsGm(), stored) })),
        total: members.length,
        offset: 0,
        limit: 50,
      };
      return json(result);
    }),
    http.post("/api/dnd5e/items", async ({ request }) => {
      const body = (await request.json()) as ItemInput;
      catalog.writes.push({ method: "POST", body });
      if (options.failCreate) return apiError(409, options.failCreate);
      const created: Stored = { item: { ...fromInput(nextId++, body), origin: "homebrew" }, hidden: false, deleted: false };
      catalog.stored.set(created.item.id, created);
      return json({ item: toDetail(created) }, 201);
    }),
    http.put("/api/dnd5e/items/:id/visibility", async ({ params, request }) => {
      const stored = catalog.stored.get(Number(params.id))!;
      const { hidden } = (await request.json()) as { hidden: boolean };
      catalog.writes.push({ method: "VISIBILITY", id: stored.item.id, body: { hidden } });
      stored.hidden = hidden;
      return json({ item: toDetail(stored) });
    }),
    http.put("/api/dnd5e/items/:id", async ({ params, request }) => {
      const stored = catalog.stored.get(Number(params.id))!;
      const body = (await request.json()) as ItemInput;
      catalog.writes.push({ method: "PUT", id: stored.item.id, body });
      if (options.rejectPut) return json({ message: "Invalid item data.", details: options.rejectPut }, 400);
      stored.item = fromInput(stored.item.id, body, stored.item);
      // The server marks an edited import, so re-imports skip it.
      stored.edited = stored.item.origin === "imported";
      const response = json({ item: toDetail(stored) });
      await options.holdWrite;
      return response;
    }),
    http.delete("/api/dnd5e/items/:id", async ({ params }) => {
      const stored = catalog.stored.get(Number(params.id))!;
      catalog.writes.push({ method: "DELETE", id: stored.item.id });
      stored.deleted = true;
      await options.holdWrite;
      return new Response(null, { status: 204 });
    }),
    // The other tabs stay mounted; they are covered in their own tests.
    http.get("/api/dnd5e/spells", () => json({ spells: [] })),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: [] })),
    http.get("/api/dnd5e/entities/mine", () => json({ entities: [] }))
  );
  return catalog;
}

const CATALOG = [weaponFamily, longswordPhb, longswordXphb, plusOnePhb, plusOneXphb, bagOfHolding, secretBlade];

// Signs another account in while the page stays mounted, as the login form does.
const AccountSwitcher = ({ to }: { to: User }) => {
  const { login } = useAuth();
  const session = { token: `token-${to.id}`, createdAt: to.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" };
  return (
    <button
      type="button"
      onClick={() => {
        server.use(
          http.post("/api/auth/login", () => json({ user: to, session })),
          http.get("/api/auth/user-session", () => json({ user: to, session }))
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

const itemList = () => screen.findByRole("listbox", { name: "Items" });
const optionNames = (list: HTMLElement) => within(list).getAllByRole("option").map(option => option.textContent);
const details = () => screen.getByLabelText("Item details");
const card = async (name: string) => within(await screen.findByLabelText("Item details")).findByRole("article", { name });
// See Compendium.test.tsx: in the desktop split pane, press rows with the mousedown they listen for.
const pressRow = (row: HTMLElement) => act(() => void fireEvent.mouseDown(row));

async function openItemAction(reader: HTMLElement, action: string, title: string) {
  await chooseItemAction(reader, action);
  return screen.findByRole("dialog", { name: title });
}

async function chooseItemAction(reader: HTMLElement, action: string) {
  await userEvent.click(await within(reader).findByRole("button", { name: /^Actions for/ }));
  await userEvent.click(screen.getByRole("menuitem", { name: action }));
}

type EventUser = ReturnType<typeof userEvent.setup>;
const toolbar = () => within(screen.getByRole("toolbar", { name: "Editing" }));
const saveButton = () => toolbar().getByRole("button", { name: "Save" });
// The editing sheet, wherever the reader is (the pane, or the narrow dialog).
const sheet = () => within(screen.getByRole("toolbar", { name: "Editing" }).closest("article")!);
// A target's popover editor, named "Edit <its label>".
const popover = (name: string) => within(screen.getByRole("dialog", { name }));

/** Opens an item's sheet in edit mode from its actions menu. */
async function startEditing(name: string) {
  await chooseItemAction(await card(name), "Edit");
  await screen.findByRole("toolbar", { name: "Editing" });
  return sheet();
}

// A pointer press in jsdom's zero-size panes focuses the panel separator (react-resizable-panels),
// which would blur the field; focus fields directly and type without the click.
const typeInto = async (user: EventUser, field: HTMLElement, text: string) => {
  act(() => field.focus());
  await user.type(field, text, { skipClick: true });
};
const retype = async (user: EventUser, field: HTMLElement, text: string) => {
  await user.clear(field);
  await typeInto(user, field, text);
};

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280);
});

describe("Items section and URL", () => {
  test("an item link opens Items with that item's page; entity and spell IDs take precedence", async () => {
    serveCatalog(CATALOG);
    renderAs(player, "/compendium?item=6&view=compact");

    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
    expect(await card("Bag of Holding")).toBeVisible();
    expect(within(details()).getByText("This bag has an interior space.")).toBeVisible();
    expect(currentUrl()).toBe("/compendium?item=6&view=compact");

    await go("/compendium?spell=7&item=6");
    expect(screen.getByRole("tab", { name: "Spells" })).toHaveAttribute("aria-selected", "true");
    await go("/compendium?entity=3&item=6");
    expect(screen.getByRole("tab", { name: "Entities" })).toHaveAttribute("aria-selected", "true");
  });

  test("Back returns to the previously linked item, and ?section=items opens the list without one", async () => {
    serveCatalog(CATALOG);
    renderAs(player, "/compendium?section=items");
    expect(within(await itemList()).getAllByRole("option").every(option => option.getAttribute("aria-selected") === "false")).toBe(true);
    expect(within(details()).getByText("Select an item to read it.")).toBeVisible();

    await go("/compendium?item=6");
    expect(await card("Bag of Holding")).toBeVisible();
    await go("/compendium?item=2");
    expect(await card("Longsword")).toBeVisible();
    await go(-1);
    expect(await card("Bag of Holding")).toBeVisible();
    expect(currentUrl()).toBe("/compendium?item=6");
  });

  test("a hidden item's link reads as unavailable for a player, without its details", async () => {
    serveCatalog(CATALOG, { hidden: [secretBlade.id] });
    renderAs(player, `/compendium?item=${secretBlade.id}`);

    expect(await within(await screen.findByLabelText("Item details")).findByText("That item is not available.")).toBeVisible();
    expect(screen.queryByText("Secret Blade")).not.toBeInTheDocument();
  });

  test("on a narrow screen an item link opens its page in a dialog", async () => {
    installMatchMedia(800);
    serveCatalog(CATALOG);
    renderAs(player, "/compendium?item=6");

    const dialog = await screen.findByRole("dialog", { name: "Bag of Holding" });
    expect(await within(dialog).findByText("This bag has an interior space.")).toBeVisible();
  });
});

describe("Browsing items", () => {
  test("browsing lists families but not their specifics; a search finds each specific with its base printing", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(player, "/compendium?section=items");

    const list = await itemList();
    expect(optionNames(list)).toEqual([
      expect.stringContaining("+1 Weapon"),
      expect.stringContaining("Bag of Holding"),
      expect.stringContaining("Longsword"),
      expect.stringContaining("Longsword"),
      expect.stringContaining("Secret Blade"),
    ]);
    expect(catalog.listRequests[0].has("specifics")).toBe(false);

    screen.getByRole("searchbox", { name: "Search items by name" }).focus();
    await user.keyboard("+1 long");
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(2));
    // Same name and source; the base printing tells them apart.
    expect(optionNames(list)).toEqual([
      expect.stringContaining("Longsword (PHB)"),
      expect.stringContaining("Longsword (XPHB)"),
    ]);
    expect(catalog.listRequests.at(-1)?.get("q")).toBe("+1 long");
  });

  test("the specifics filter lists specifics while browsing, and the source facet narrows the list", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(player, "/compendium?section=items");
    const list = await itemList();

    await user.click(screen.getByRole("checkbox", { name: "Show specific variants" }));
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(7));
    expect(catalog.listRequests.at(-1)?.get("specifics")).toBe("true");

    await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), "XPHB");
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(1));
    expect(catalog.listRequests.at(-1)?.getAll("sources")).toEqual(["XPHB"]);
    expect(screen.getByText("1 items")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(5));
  });

  test("a long catalog is listed in full from one request", async () => {
    const many = Array.from({ length: 120 }, (_, index) => item(200 + index, `Trinket ${String(index).padStart(3, "0")}`));
    const catalog = serveCatalog(many);
    renderAs(player, "/compendium?section=items");
    const list = await itemList();

    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(120));
    expect(screen.getByText("120 items")).toBeVisible();
    expect(catalog.listRequests).toHaveLength(1);
    expect(catalog.listRequests[0].has("limit")).toBe(false);
  });

  test("a family's page lists its specifics; choosing one opens that exact printing, which links back", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    renderAs(player, "/compendium?section=items");
    await pressRow(within(await itemList()).getByRole("option", { name: /^\+1 Weapon/ }));

    const family = await card("+1 Weapon");
    const specifics = await within(family).findByRole("region", { name: "Specific items" });
    const xphbRow = within(specifics).getByText("Longsword (XPHB)").closest("li")!;
    await user.click(within(xphbRow).getByRole("button", { name: "+1 Longsword" }));

    await waitFor(() => expect(currentUrl()).toBe(`/compendium?item=${plusOneXphb.id}`));
    const specific = await card("+1 Longsword");
    expect(within(specific).getByRole("button", { name: "Longsword (XPHB)" })).toBeVisible();
    await user.click(within(specific).getByRole("button", { name: "+1 Weapon (DMG)" }));
    expect(await card("+1 Weapon")).toBeVisible();
  });
});

describe("Item controls by role", () => {
  test("players get no GM controls", async () => {
    serveCatalog(CATALOG);
    renderAs(player, "/compendium?item=2");

    expect(await card("Longsword")).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New item" })).not.toBeInTheDocument();
  });

  test("a GM hides an item from players; its page and row say so, and showing it again clears that", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?item=6");
    const page = await card("Bag of Holding");

    await user.click(within(page).getByRole("button", { name: "Actions for Bag of Holding" }));
    await user.click(screen.getByRole("menuitem", { name: "Hide from players" }));

    expect(await within(page).findByText("Hidden from players.")).toBeVisible();
    expect(catalog.writes).toEqual([{ method: "VISIBILITY", id: 6, body: { hidden: true } }]);
    const row = within(await itemList()).getByRole("option", { name: /^Bag of Holding/ });
    await waitFor(() => expect(within(row).getByText("Hidden")).toBeVisible());

    await user.click(within(page).getByRole("button", { name: "Actions for Bag of Holding" }));
    await user.click(screen.getByRole("menuitem", { name: "Show to players" }));
    await waitFor(() => expect(within(page).queryByText("Hidden from players.")).not.toBeInTheDocument());
  });

  test("a hidden family marks its specifics hidden for the GM", async () => {
    serveCatalog(CATALOG, { hidden: [weaponFamily.id] });
    renderAs(gm, `/compendium?item=${plusOnePhb.id}`);

    expect(await within(await card("+1 Longsword")).findByText("Hidden from players with its family.")).toBeVisible();
  });

  test("only concrete items offer Duplicate, and editing a family explains that its specifics keep their text", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${weaponFamily.id}`);

    const family = await card("+1 Weapon");
    await user.click(within(family).getByRole("button", { name: "Actions for +1 Weapon" }));
    expect(screen.queryByRole("menuitem", { name: "Duplicate as homebrew" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(await screen.findByRole("toolbar", { name: "Editing" })).toBeVisible();
    expect(sheet().getByRole("note")).toHaveTextContent("Specific items made from it keep their current text.");
  });
});

// The item sheet is the edit surface (step 04). With a mouse on a wide pane its values are inputs;
// on touch or a narrow pane each value opens its own editor. Both draw the same field specs.
describe("GM editing on the item sheet", () => {
  const longswordSnapshot = (patch: Partial<ItemInput>): ItemInput => ({
    name: "Longsword",
    source: "PHB",
    category: "melee weapon",
    rarity: "none",
    requiresAttunement: false,
    valueCp: 1500,
    weightLb: 3,
    aliases: [],
    details: { damage: { dice: "1d8", type: "slashing", versatileDice: "1d10" } },
    ...patch,
  });

  test("editing an imported item's rarity and weight in place saves its full snapshot; the page then says it was edited", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    const fields = await startEditing("Longsword");
    expect(currentUrl()).toBe(`/compendium?item=${longswordPhb.id}&edit=1`);

    expect(fields.queryByRole("button", { name: /^Edit Weight/ })).not.toBeInTheDocument();
    await user.selectOptions(fields.getByRole("combobox", { name: "Rarity" }), "rare");
    await retype(user, fields.getByRole("textbox", { name: "Weight (lb.)" }), "3.5");
    await user.keyboard("{Enter}");
    expect(toolbar().getByText("Editing · 2 changes")).toBeVisible();
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0]).toEqual({ method: "PUT", id: longswordPhb.id, body: longswordSnapshot({ rarity: "rare", weightLb: 3.5 }) });
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?item=${longswordPhb.id}`));
    const page = await card("Longsword");
    expect(within(page).getByText("PHB · edited")).toBeVisible();
    expect(within(page).getByText("3.5 lb.")).toBeVisible();
  });

  test("on touch the same edit goes through each value's editor", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    const fields = await startEditing("Longsword");

    expect(fields.queryByRole("textbox", { name: "Weight (lb.)" })).not.toBeInTheDocument();
    await user.click(fields.getByRole("button", { name: "Edit Type, Melee weapon" }));
    await user.selectOptions(popover("Edit Type, Melee weapon").getByRole("combobox", { name: "Rarity" }), "rare");
    await user.click(popover("Edit Type, Melee weapon").getByRole("button", { name: "Done" }));
    await user.click(fields.getByRole("button", { name: "Edit Weight, 3 lb." }));
    await retype(user, popover("Edit Weight, 3 lb.").getByRole("textbox", { name: "Weight (lb.)" }), "3.5");
    await user.click(popover("Edit Weight, 3 lb.").getByRole("button", { name: "Done" }));
    expect(fields.getByRole("button", { name: "Edit Weight, 3.5 lb." })).toBeVisible();
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0]).toEqual({ method: "PUT", id: longswordPhb.id, body: longswordSnapshot({ rarity: "rare", weightLb: 3.5 }) });
    expect(within(await card("Longsword")).getByText("PHB · edited")).toBeVisible();
  });

  test("an invalid weight keeps its text and message and holds Save; a stored invalid weight is an issue that jumps to the field", async () => {
    const user = userEvent.setup();
    // Five decimal places: more than the shared rules store.
    const anvil = item(9, "Anvil", { source: "homebrew", origin: "homebrew", weightLb: 0.00001 });
    const catalog = serveCatalog([...CATALOG, anvil]);
    renderAs(gm, `/compendium?item=${anvil.id}`);
    const fields = await startEditing("Anvil");

    const weight = fields.getByRole("textbox", { name: "Weight (lb.)" });
    await retype(user, weight, "heavy");
    await user.keyboard("{Enter}");
    expect(weight).toHaveValue("heavy");
    expect(weight).toHaveAccessibleDescription(/^Weight must be a number from 0 to/);
    expect(toolbar().getByText("1 field holds unapplied text")).toBeVisible();
    expect(saveButton()).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(weight).toHaveValue("0.00001");
    await user.selectOptions(fields.getByRole("combobox", { name: "Rarity" }), "rare");
    await user.click(saveButton());

    expect(await screen.findByText("Not saved. Fix 1 issue first.")).toBeVisible();
    const issue = within(screen.getByRole("list", { name: "Issues" })).getByRole("button", { name: /^Weight: Weight must be a number/ });
    await waitFor(() => expect(weight).toHaveFocus());
    act(() => issue.focus());
    await user.click(issue);
    expect(weight).toHaveFocus();
    expect(catalog.writes).toEqual([]);
  });

  test("a server 400 on details.damage.dice focuses the live Damage dice field", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG, { rejectPut: [{ path: "details.damage.dice", message: "Damage dice must be dice." }] });
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    const fields = await startEditing("Longsword");
    await user.selectOptions(fields.getByRole("combobox", { name: "Rarity" }), "rare");
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    const issue = await within(screen.getByRole("list", { name: "Issues" }))
      .findByRole("button", { name: "Damage dice: Damage dice must be dice." });
    expect(issue).toBeVisible();
    await waitFor(() => expect(fields.getByRole("textbox", { name: "Damage dice" })).toHaveFocus());
  });

  test.each([
    { width: 1500, pointer: "coarse", layout: "popover", role: "dialog" },
    { width: 700, pointer: "fine", layout: "inline panel", role: "group" },
  ] as const)("a server 400 focuses Damage type in the $layout", async ({ width, pointer, role }) => {
    installMatchMedia(width, { pointer });
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG, { rejectPut: [{ path: "details.damage.type", message: "Damage type rejected." }] });
    renderAs(gm, `/compendium?item=${longswordPhb.id}&edit=1`);
    await screen.findByRole("toolbar", { name: "Editing" });
    const fields = sheet();
    const name = "Edit Type, Melee weapon";
    await user.click(fields.getByRole("button", { name }));
    const editor = within(screen.getByRole(role, { name }));
    await user.selectOptions(editor.getByRole("combobox", { name: "Rarity" }), "rare");
    await user.click(editor.getByRole("button", { name: "Done" }));
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    const issue = await within(screen.getByRole("list", { name: "Issues" }))
      .findByRole("button", { name: "Damage type: Damage type rejected." });
    const damageType = screen.getByRole("textbox", { name: "Damage type" });
    await waitFor(() => expect(damageType).toHaveFocus());

    const trigger = fields.getByRole("button", { name: /^Edit Damage/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const dice = screen.getByRole("textbox", { name: "Damage dice" });
    await retype(user, dice, "2d8");
    await user.click(issue);
    expect(damageType).toHaveFocus();
    expect(dice).toHaveValue("2d8");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Damage dice" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Damage dice" })).toHaveValue("1d8");
  });

  test("New item creates a homebrew item from the sheet; the URL then names it and the list shows it", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?section=items");
    const list = await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    expect(await toolbar().findByText("New item")).toBeVisible();
    expect(currentUrl()).toBe("/compendium?item=new");
    await typeInto(user, sheet().getByRole("textbox", { name: "Name" }), "Lantern of Truth");
    await user.keyboard("{Enter}");
    await user.selectOptions(sheet().getByRole("combobox", { name: "Add a stat" }), "valueCp");
    const value = sheet().getByRole("textbox", { name: "Value (gp)" });
    await waitFor(() => expect(value).toHaveFocus());
    await user.type(value, "12.5{Enter}", { skipClick: true });
    await user.click(saveButton());

    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=100"));
    expect(catalog.writes[0].body).toMatchObject({ name: "Lantern of Truth", source: "homebrew", valueCp: 1250 });
    expect(await card("Lantern of Truth")).toBeVisible();
    await waitFor(() => expect(within(list).getByRole("option", { name: /^Lantern of Truth/ })).toBeVisible());
  });

  test("a failed create keeps the draft and shows the server's message", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG, { failCreate: "An item named Lantern of Truth already exists in homebrew." });
    renderAs(gm, "/compendium?section=items");
    await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    const name = await sheet().findByRole("textbox", { name: "Name" });
    await typeInto(user, name, "Lantern of Truth");
    await user.keyboard("{Enter}");
    await user.click(saveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("already exists in homebrew");
    expect(sheet().getByRole("textbox", { name: "Name" })).toHaveValue("Lantern of Truth");
    expect(catalog.writes).toHaveLength(1);
    expect(currentUrl()).toBe("/compendium?item=new");
  });

  test("Duplicate as homebrew opens ?item=new&from=<id> as homebrew without a page, keeps the base and creates on Save", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${plusOnePhb.id}`);

    await chooseItemAction(await card("+1 Longsword"), "Duplicate as homebrew");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?item=new&from=${plusOnePhb.id}`));
    const fields = await screen.findByRole("toolbar", { name: "Editing" }).then(() => sheet());
    expect(toolbar().getByText("New item")).toBeVisible();
    expect(fields.getByRole("textbox", { name: "Source" })).toHaveValue("homebrew");
    expect(fields.getByRole("textbox", { name: "Page" })).toHaveValue("");
    // A standalone copy may change its base.
    expect(fields.getByRole("button", { name: "Edit Base item, Longsword (PHB)" })).toBeVisible();
    await user.click(saveButton());

    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=100"));
    expect(catalog.writes[0]).toMatchObject({ method: "POST", body: { name: "+1 Longsword", source: "homebrew", baseItemId: longswordPhb.id } });
    expect(catalog.writes[0].body).not.toHaveProperty("page");
  });

  test.each(["fine", "coarse"] as const)("a generated specific's base is shown but cannot be changed, and is never sent (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${plusOnePhb.id}`);
    const fields = await startEditing("+1 Longsword");

    expect(fields.getByText("Longsword (PHB)")).toBeVisible();
    expect(fields.getByText("(fixed for a generated item)")).toBeVisible();
    expect(fields.queryByRole("button", { name: /Base item/ })).not.toBeInTheDocument();
    if (pointer === "coarse") await user.click(fields.getByRole("button", { name: "Edit Name, +1 Longsword" }));
    await retype(user, screen.getByRole("textbox", { name: "Name" }), "Keen Longsword");
    await user.keyboard("{Enter}");
    await user.click(saveButton());

    expect(await card("Keen Longsword")).toBeVisible();
    expect(catalog.writes[0]).toMatchObject({ method: "PUT", id: plusOnePhb.id });
    expect(catalog.writes[0].body).not.toHaveProperty("baseItemId");
  });

  test("unapplied text survives selecting another item and Resume", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${bagOfHolding.id}`);
    const list = await itemList();
    const fields = await startEditing("Bag of Holding");

    await user.selectOptions(fields.getByRole("combobox", { name: "Add a stat" }), "weightLb");
    const weight = fields.getByRole("textbox", { name: "Weight (lb.)" });
    await waitFor(() => expect(weight).toHaveFocus());
    await user.type(weight, "heavy{Enter}", { skipClick: true });
    expect(weight).toHaveAttribute("aria-invalid", "true");

    pressRow(within(list).getAllByRole("option", { name: /^Longsword/ })[0]);
    expect(await card("Longsword")).toBeVisible();
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(bar).toHaveTextContent("Unsaved changes to Bag of Holding");
    await user.click(within(bar).getByRole("button", { name: "Resume" }));

    await waitFor(() => expect(currentUrl()).toBe(`/compendium?item=${bagOfHolding.id}&edit=1`));
    const resumed = (await screen.findByRole("toolbar", { name: "Editing" })) && sheet().getByRole("textbox", { name: "Weight (lb.)" });
    expect(resumed).toHaveValue("heavy");
    expect(resumed).toHaveAccessibleDescription(/^Weight must be a number/);
    expect(saveButton()).toBeDisabled();
    expect(catalog.writes).toEqual([]);
  });

  test("deleting an item clears the selection and removes it from the list", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?item=6");
    const list = await itemList();
    const page = await card("Bag of Holding");

    await user.click(within(page).getByRole("button", { name: "Actions for Bag of Holding" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Bag of Holding?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete item" }));

    await waitFor(() => expect(currentUrl()).toBe("/compendium?section=items"));
    expect(within(details()).getByText("Select an item to read it.")).toBeVisible();
    await waitFor(() => expect(within(list).queryByRole("option", { name: /^Bag of Holding/ })).not.toBeInTheDocument());
    expect(catalog.writes).toEqual([{ method: "DELETE", id: 6 }]);
  });
});

describe("Viewer changes", () => {
  test("switching from a GM to a player clears the item selection and the GM's cached items", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG, { hidden: [secretBlade.id] });
    const { queryClient } = renderAs(gm, `/compendium?item=${secretBlade.id}`, player);
    expect(await card("Secret Blade")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Switch to player" }));

    await waitFor(() => expect(currentUrl()).toBe("/compendium?section=items"));
    const list = await itemList();
    await waitFor(() => expect(within(list).queryByRole("option", { name: /^Secret Blade/ })).not.toBeInTheDocument());
    expect(queryClient.getQueriesData({ queryKey: ITEM_KEYS.viewer({ userId: gm.id, isGm: true }) })).toEqual([]);
  });
});


describe("Item catalog regressions", () => {
  test("13-F003: returning as a player refreshes rows, facets, related items and a revoked specific", async () => {
    const user = userEvent.setup();
    const group = item(8, "Equipment display", { kind: "group" });
    const catalog = serveCatalog([group, weaponFamily, longswordPhb, plusOnePhb], {
      groupMembers: { [group.id]: [weaponFamily.id, plusOnePhb.id, longswordPhb.id] },
    });
    renderAs(player, `/compendium?item=${group.id}`);

    const members = () => within(screen.getByRole("region", { name: "Items in this group" }));
    await within(await card(group.name)).findByRole("region", { name: "Items in this group" });
    expect(members().getByRole("button", { name: weaponFamily.name })).toBeVisible();
    await user.click(members().getByRole("button", { name: plusOnePhb.name }));
    expect(await card(plusOnePhb.name)).toBeVisible();
    await user.click(screen.getByRole("checkbox", { name: "Show specific variants" }));
    expect(await within(await itemList()).findByRole("option", { name: /^\+1 Longsword/ })).toBeVisible();
    expect(within(screen.getByRole("combobox", { name: "Source" })).getByRole("option", { name: "DMG" })).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Spells" }));
    catalog.stored.get(weaponFamily.id)!.hidden = true;
    const readsWhileAway = catalog.listRequests.length;
    await user.click(screen.getByRole("tab", { name: "Items" }));

    expect(screen.queryByRole("article", { name: plusOnePhb.name })).not.toBeInTheDocument();
    expect(await within(details()).findByText("That item is not available.")).toBeVisible();
    const list = await itemList();
    expect(within(list).queryByRole("option", { name: /^\+1 (Weapon|Longsword)/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Source" })).queryByRole("option", { name: "DMG" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show specific variants" })).toBeChecked();
    expect(catalog.listRequests.slice(readsWhileAway).some(request => request.get("specifics") === "true")).toBe(true);

    pressRow(within(list).getByRole("option", { name: /^Equipment display/ }));
    await within(await card(group.name)).findByRole("region", { name: "Items in this group" });
    expect(members().getByRole("button", { name: longswordPhb.name })).toBeVisible();
    expect(members().queryByRole("button", { name: weaponFamily.name })).not.toBeInTheDocument();
    expect(members().queryByRole("button", { name: plusOnePhb.name })).not.toBeInTheDocument();
  });

  // Each starts a write the server holds: a save from the editing sheet, or a confirmed delete.
  const startWrite: Record<"PUT" | "DELETE", (user: EventUser) => Promise<void>> = {
    PUT: async user => {
      const fields = await startEditing(secretBlade.name);
      await retype(user, fields.getByRole("textbox", { name: "Name" }), "Secret Blade II");
      await user.keyboard("{Enter}");
      await user.click(saveButton());
    },
    DELETE: async user => {
      const dialog = await openItemAction(await card(secretBlade.name), "Delete…", "Delete Secret Blade?");
      await user.click(within(dialog).getByRole("button", { name: "Delete item" }));
    },
  };

  test.each(["PUT", "DELETE"] as const)("13-F004: a late %s cannot restore GM data or alter the player's URL", async method => {
    const user = userEvent.setup();
    let release!: () => void;
    const holdWrite = new Promise<void>(resolve => { release = resolve; });
    const catalog = serveCatalog(CATALOG, { hidden: [secretBlade.id], holdWrite });
    const { queryClient } = renderAs(gm, `/compendium?item=${secretBlade.id}`, player);
    const gmKeys = ITEM_KEYS.viewer({ userId: gm.id, isGm: true });

    try {
      await startWrite[method](user);
      await waitFor(() => expect(catalog.writes[0]).toMatchObject({ method, id: secretBlade.id }));

      await user.click(screen.getByRole("button", { name: "Switch to player", hidden: true }));
      await waitFor(() => expect(currentUrl()).toBe("/compendium?section=items"));
      pressRow(within(await itemList()).getByRole("option", { name: /^Bag of Holding/ }));
      expect(await card(bagOfHolding.name)).toBeVisible();
      expect(queryClient.getQueriesData({ queryKey: gmKeys })).toEqual([]);

      await act(async () => release());
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      expect(currentUrl()).toBe(`/compendium?item=${bagOfHolding.id}`);
      expect(await card(bagOfHolding.name)).toBeVisible();
      expect(queryClient.getQueriesData({ queryKey: gmKeys })).toEqual([]);
    } finally {
      release();
    }
  });


  test("13-F004: a late save refreshes the initiating GM cache without replacing a newer selection", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const holdWrite = new Promise<void>(resolve => { release = resolve; });
    const catalog = serveCatalog(CATALOG, { holdWrite });
    const { queryClient } = renderAs(gm, "/compendium?item=6");

    try {
      const fields = await startEditing(bagOfHolding.name);
      await retype(user, fields.getByRole("textbox", { name: "Name" }), "Bag of Holding II");
      await user.keyboard("{Enter}");
      await user.click(saveButton());
      await waitFor(() => expect(catalog.writes[0]).toMatchObject({ method: "PUT", id: bagOfHolding.id }));

      await go("/compendium?item=2");
      expect(screen.queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
      expect(await card(longswordPhb.name)).toBeVisible();
      await act(async () => release());
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));

      expect(currentUrl()).toBe("/compendium?item=2");
      const renamed = await within(await itemList()).findByRole("option", { name: /^Bag of Holding II/ });
      pressRow(renamed);
      expect(await card("Bag of Holding II")).toBeVisible();
    } finally {
      release();
    }
  });

  test.each([1280, 420])("13-F005: a missing link remains readable with an empty catalog at %i px", async width => {
    installMatchMedia(width);
    serveCatalog([]);
    renderAs(gm, "/compendium?item=999");

    const reader = width === 420 ? await screen.findByRole("dialog", { name: "Item" }) : await screen.findByLabelText("Item details");
    expect(await within(reader).findByText("That item is not available.")).toBeVisible();
    if (width === 420) await userEvent.click(within(reader).getByRole("button", { name: "Close" }));
    expect(await screen.findByText("No items are in the catalog yet.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "New item" }));
    // The new item's sheet opens in edit mode: in the reader, or in the narrow reader's dialog.
    const editing = await screen.findByRole("toolbar", { name: "Editing" });
    expect(within(editing).getByText("New item")).toBeVisible();
    expect(width === 420 ? screen.getByRole("dialog", { name: "New item" }) : details()).toContainElement(editing);
  });

  test("13-F005: search stays bounded and editable after a failed index request while the reader stays open", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(player, "/compendium?item=6");
    expect(await card(bagOfHolding.name)).toBeVisible();
    await itemList();

    const input = screen.getByRole("searchbox", { name: "Search items by name" });
    fireEvent.change(input, { target: { value: "x".repeat(ITEM_LIST_LIMITS.query + 1) } });
    expect(input).toHaveValue("x".repeat(ITEM_LIST_LIMITS.query));
    await waitFor(() => expect(catalog.listRequests.at(-1)?.get("q")).toHaveLength(ITEM_LIST_LIMITS.query));

    const validIndex = { items: [summaryOf(catalog.stored.get(6)!, false)], total: 1, offset: 0, limit: 50 };
    let available = false;
    server.use(http.get("/api/dnd5e/items", () =>
      available ? json(validIndex) : apiError(400, "Unable to read the item index")
    ));
    fireEvent.change(input, { target: { value: "Bag" } });
    expect(input).toHaveValue("Bag");
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to read the item index");
    expect(input).toBeVisible();
    expect(input).toHaveValue("Bag");
    expect(await card(bagOfHolding.name)).toBeVisible();

    available = true;
    await user.click(screen.getByRole("button", { name: "Retry items" }));
    expect(await within(await itemList()).findByRole("option", { name: /^Bag of Holding/ })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("13-F006: narrow Back leaves the editing sheet for the item, then the item for Spells; Forward returns to both", async () => {
    installMatchMedia(420);
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { container } = renderAs(gm, "/compendium?section=spells");
    await user.click(screen.getByRole("tab", { name: "Items" }));
    await user.click(screen.getByRole("checkbox", { name: "Show specific variants" }));
    pressRow(within(await itemList()).getByRole("option", { name: /^Bag of Holding/ }));
    const reader = await screen.findByRole("dialog", { name: bagOfHolding.name });
    await chooseItemAction(reader, "Edit");
    expect(await within(reader).findByRole("toolbar", { name: "Editing" })).toBeVisible();
    expect(currentUrl()).toBe("/compendium?item=6&edit=1");

    await go(-1);
    expect(currentUrl()).toBe("/compendium?item=6");
    const read = await screen.findByRole("dialog", { name: bagOfHolding.name });
    await waitFor(() => expect(within(read).queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument());

    await go(-1);
    expect(currentUrl()).toBe("/compendium?section=spells");
    expect(screen.getByRole("tab", { name: "Spells" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(container.inert).toBeFalsy();
    expect(container).not.toHaveAttribute("aria-hidden");

    await go(1);
    expect(currentUrl()).toBe("/compendium?item=6");
    expect(await screen.findByRole("dialog", { name: bagOfHolding.name })).toBeVisible();
    await go(1);
    expect(currentUrl()).toBe("/compendium?item=6&edit=1");
    expect(await within(screen.getByRole("dialog", { name: bagOfHolding.name })).findByRole("toolbar", { name: "Editing" })).toBeVisible();
    await user.click(toolbar().getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=6"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show specific variants" })).toBeChecked();
  });

  test("13-F007: on a narrow screen Edit and Duplicate keep the editing sheet in the reader dialog; Cancel and Save return to the item", async () => {
    installMatchMedia(420);
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    const { container } = renderAs(gm, "/compendium?item=6");
    const reader = () => screen.findByRole("dialog", { name: bagOfHolding.name });

    await chooseItemAction(await reader(), "Edit");
    const editing = await within(await reader()).findByRole("toolbar", { name: "Editing" });
    expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
    await user.click(within(editing).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=6"));
    expect(within(await reader()).queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();

    await chooseItemAction(await reader(), "Duplicate as homebrew");
    const copy = await screen.findByRole("dialog", { name: "New item" });
    await user.click(within(copy).getByRole("button", { name: "Edit Name, Bag of Holding" }));
    await retype(user, within(copy).getByRole("textbox", { name: "Name" }), "Spare Bag");
    await user.keyboard("{Enter}");
    await user.click(within(copy).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=100"));
    const saved = await screen.findByRole("dialog", { name: "Spare Bag" });
    await within(saved).findByRole("article", { name: "Spare Bag" });
    expect(catalog.writes).toMatchObject([{ method: "POST", body: { name: "Spare Bag", source: "homebrew" } }]);
    await user.keyboard("{Escape}");
    expect(within(await itemList()).getAllByRole("option", { name: /^(Bag of Holding|Spare Bag)/ })).toHaveLength(2);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(container.inert).toBeFalsy();
  });

  test("13-F007: narrow Delete gives its dialog focus and supports Cancel, Escape and success", async () => {
    installMatchMedia(420);
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { container } = renderAs(gm, "/compendium?item=6");
    const reader = () => screen.findByRole("dialog", { name: bagOfHolding.name });

    for (const cancelWithEscape of [false, true]) {
      const dialog = await openItemAction(await reader(), "Delete…", "Delete Bag of Holding?");
      expect(screen.getAllByRole("dialog", { hidden: true })).toEqual([dialog]);
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
      if (cancelWithEscape) await user.keyboard("{Escape}");
      else await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      const restored = await reader();
      await waitFor(() => expect(restored).toContainElement(document.activeElement as HTMLElement));
    }

    const dialog = await openItemAction(await reader(), "Delete…", "Delete Bag of Holding?");
    await user.click(within(dialog).getByRole("button", { name: "Delete item" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(currentUrl()).toBe("/compendium?section=items"));
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "Search items by name" })).toHaveFocus());
    expect(within(await itemList()).queryAllByRole("option", { name: /^Bag of Holding/ })).toHaveLength(0);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(container.inert).toBeFalsy();
    expect(container).not.toHaveAttribute("aria-hidden");
  });

  test.each([
    ["Damage type", "slashing", "type"],
    ["Versatile damage", "1d10", "versatileDice"],
  ])("13-F008: %s without dice keeps the draft open until dice are entered", async (label, value, field) => {
    const user = userEvent.setup();
    const catalog = serveCatalog([]);
    renderAs(gm, "/compendium?section=items");
    await screen.findByText("No items are in the catalog yet.");
    await user.click(screen.getByRole("button", { name: "New item" }));
    await typeInto(user, await sheet().findByRole("textbox", { name: "Name" }), "Test weapon");
    await user.keyboard("{Enter}");
    await user.selectOptions(sheet().getByRole("combobox", { name: "Add a stat" }), "damage");
    await typeInto(user, sheet().getByRole("textbox", { name: label }), value);
    await user.keyboard("{Enter}");
    await user.click(saveButton());

    expect(await within(screen.getByRole("list", { name: "Issues" })).findByRole("button", { name: "Damage dice: Damage dice is required." })).toBeVisible();
    const dice = sheet().getByRole("textbox", { name: "Damage dice" });
    await waitFor(() => expect(dice).toHaveFocus());
    expect(sheet().getByRole("textbox", { name: label })).toHaveValue(value);
    expect(catalog.writes).toEqual([]);

    await user.type(dice, "1d8{Enter}", { skipClick: true });
    await user.click(saveButton());
    expect(await card("Test weapon")).toBeVisible();
    expect(catalog.writes[0].body).toMatchObject({ details: { damage: { dice: "1d8", [field]: value } } });
  });

  test.each(["-0.0000001", "1.0000001", "999999999.9999999"])(
    "13-F009: a price of %s gp keeps its text and message, holds Save and sends no rounded price",
    async value => {
      const user = userEvent.setup();
      const catalog = serveCatalog(CATALOG);
      renderAs(gm, "/compendium?item=6");
      const fields = await startEditing(bagOfHolding.name);
      await user.selectOptions(fields.getByRole("combobox", { name: "Add a stat" }), "valueCp");
      const price = fields.getByRole("textbox", { name: "Value (gp)" });
      await waitFor(() => expect(price).toHaveFocus());
      await user.type(price, `${value}{Enter}`, { skipClick: true });

      expect(price).toHaveValue(value);
      expect(price).toHaveAccessibleDescription(/^Value must be a number/);
      expect(saveButton()).toBeDisabled();
      expect(catalog.writes).toEqual([]);
    }
  );

  test.each([
    [100.0001, "1.000001", "1.000001 gp"],
    [0.0001, "0.000001", "0.0001 cp"],
    [99_999_999_999.9999, "999999999.999999", "999999999.999999 gp"],
  ])("13-F009: %s cp renders and round-trips at its full precision", async (valueCp, gpInput, display) => {
    const user = userEvent.setup();
    const catalog = serveCatalog([{ ...bagOfHolding, valueCp }]);
    renderAs(gm, "/compendium?item=6");
    const page = await card(bagOfHolding.name);
    expect(within(page).getByText(display)).toBeVisible();

    const fields = await startEditing(bagOfHolding.name);
    expect(fields.getByRole("textbox", { name: "Value (gp)" })).toHaveValue(gpInput);
    await retype(user, fields.getByRole("textbox", { name: "Name" }), "Bag of Holding II");
    await user.keyboard("{Enter}");
    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0].body).toMatchObject({ valueCp });
  });

  test("13-F010: rename and spell addition preserve the original typed details; an unchanged item has nothing to save", async () => {
    const user = userEvent.setup();
    const original = {
      ...bagOfHolding,
      details: {
        ...bagOfHolding.details,
        wondrous: false,
        stealthDisadvantage: false,
        properties: [],
        mastery: [],
        charges: "3",
        spells: [{ name: "A|B", source: "Book" }],
      },
    };
    const catalog = serveCatalog([original]);
    renderAs(gm, "/compendium?item=6");

    const fields = await startEditing(bagOfHolding.name);
    expect(fields.getByText("A|B (Book)")).toBeVisible();
    expect(saveButton()).toBeDisabled();
    await retype(user, fields.getByRole("textbox", { name: "Name" }), "Bag of Holding II");
    await user.keyboard("{Enter}");
    await user.click(saveButton());
    expect(await card("Bag of Holding II")).toBeVisible();
    expect(catalog.writes[0].body).toHaveProperty("details", original.details);

    const again = await startEditing("Bag of Holding II");
    await user.click(again.getByRole("button", { name: "+ spell" }));
    const search = screen.getByRole("combobox", { name: "Spell to add" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.type(search, "C|D{Enter}", { skipClick: true });
    // Missing from the index: its own name, and no source unless one is given.
    await user.click(popover("Edit spell").getByRole("button", { name: "Done" }));
    expect(again.getByText("C|D")).toBeVisible();
    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes[1]?.body).toHaveProperty("details", {
      ...original.details,
      spells: [...original.details.spells, { name: "C|D" }],
    }));
  });
});

describe("Step 04 review corrections", () => {
  const issueButton = (name: string | RegExp) => within(screen.getByRole("list", { name: "Issues" })).findByRole("button", { name });

  test.each(["Close", "Escape"] as const)("04-item-sheet-edit-R1: leaving the narrow reader with %s keeps the draft for Resume", async how => {
    installMatchMedia(700);
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    const reader = () => screen.findByRole("dialog", { name: "Longsword" });

    await chooseItemAction(await reader(), "Edit");
    const editing = within(await reader());
    await editing.findByRole("toolbar", { name: "Editing" });
    await user.click(editing.getByRole("button", { name: /^Edit Damage/ }));
    const panel = within(editing.getByRole("group", { name: /^Edit Damage/ }));
    await retype(user, panel.getByRole("textbox", { name: "Damage dice" }), "2d8");
    await user.click(panel.getByRole("button", { name: "Done" }));
    expect(editing.getByText("Editing · 1 change")).toBeVisible();
    if (how === "Close") await user.click(editing.getByRole("button", { name: "Close" }));
    else await user.keyboard("{Escape}");

    await waitFor(() => expect(currentUrl()).toBe(`/compendium?item=${longswordPhb.id}`));
    expect(screen.queryByRole("dialog", { name: "Longsword" })).not.toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(bar).toHaveTextContent("Unsaved changes to Longsword");
    await user.click(within(bar).getByRole("button", { name: "Resume" }));

    const resumed = within(await reader());
    expect(await resumed.findByRole("button", { name: "Edit Damage, 2d8 slashing (versatile 1d10)" })).toBeVisible();
    await user.click(resumed.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0].body).toMatchObject({ details: { damage: { dice: "2d8", type: "slashing", versatileDice: "1d10" } } });
  });

  test("04-item-sheet-edit-R1: a save held while the narrow reader closes settles against its kept draft", async () => {
    installMatchMedia(700);
    const user = userEvent.setup();
    let release!: () => void;
    const catalog = serveCatalog(CATALOG, { holdWrite: new Promise<void>(resolve => { release = resolve; }) });
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    const reader = () => screen.findByRole("dialog", { name: "Longsword" });

    await chooseItemAction(await reader(), "Edit");
    const editing = within(await reader());
    await user.click(await editing.findByRole("button", { name: "Edit Weight, 3 lb." }));
    const panel = within(editing.getByRole("group", { name: "Edit Weight, 3 lb." }));
    await retype(user, panel.getByRole("textbox", { name: "Weight (lb.)" }), "3.5");
    await user.click(panel.getByRole("button", { name: "Done" }));
    await user.click(editing.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    await user.click(editing.getByRole("button", { name: "Close" }));

    await waitFor(() => expect(currentUrl()).toBe(`/compendium?item=${longswordPhb.id}`));
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("Unsaved changes to Longsword");
    act(() => release());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument());
    expect(currentUrl()).toBe(`/compendium?item=${longswordPhb.id}`);

    pressRow(within(await itemList()).getAllByRole("option", { name: /^Longsword/ })[0]);
    const page = within(await reader());
    expect(await page.findByText("3.5 lb.")).toBeVisible();
    expect(page.getByText("PHB · edited")).toBeVisible();
    expect(catalog.writes).toHaveLength(1);
  });

  test("04-item-sheet-edit-R2: an open editor for a just-added stat keeps its line and text through a breakpoint and Resume", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    await startEditing("Longsword");

    await user.click(sheet().getByRole("button", { name: "+ stat" }));
    await user.selectOptions(popover("Edit stat").getByRole("combobox", { name: "stat" }), "charges");
    await typeInto(user, popover("Edit Charges").getByRole("textbox", { name: "Charges" }), "1d6 + 2");

    setViewportWidth(700);
    const reader = within(await screen.findByRole("dialog", { name: "Longsword" }));
    const narrowPanel = within(reader.getByRole("group", { name: "Edit Charges" }));
    expect(narrowPanel.getByRole("textbox", { name: "Charges" })).toHaveValue("1d6 + 2");

    setViewportWidth(1280);
    await go("/compendium?item=6");
    expect(await card("Bag of Holding")).toBeVisible();
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    const resumed = await screen.findByRole("dialog", { name: "Edit Charges" });
    expect(within(resumed).getByRole("textbox", { name: "Charges" })).toHaveValue("1d6 + 2");
    await user.click(within(resumed).getByRole("button", { name: "Done" }));
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0].body).toMatchObject({ details: { charges: "1d6 + 2" } });
  });

  test("04-item-sheet-edit-R3: a reference picked from the menu goes where the caret was, and the caret follows it", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${secretBlade.id}`);
    const fields = await startEditing("Secret Blade");
    const description = fields.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;

    await typeInto(user, description, "Glows near the dead.");
    await user.type(description, "{{", { skipClick: true, initialSelectionStart: 6, initialSelectionEnd: 6 });
    await user.keyboard("{Enter}Light");
    await screen.findByRole("option", { name: "Light (not in the spell index)" });
    await user.keyboard("{Enter}");
    expect(description).toHaveValue("Glows {@spell Light}near the dead.");
    expect(description).toHaveFocus();
    expect(description.selectionStart).toBe(6 + "{@spell Light}".length);
  });

  test.each(["fine", "coarse"] as const)("04-item-sheet-edit-R4: clearing the category and the recharge time is sent, keeping the amount (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const wand = item(10, "Wand of Sparks", {
      source: "homebrew", origin: "homebrew", category: "wand", rarity: "uncommon",
      details: { charges: "7", recharge: "dawn", rechargeAmount: "1d6 + 1" },
    });
    const catalog = serveCatalog([...CATALOG, wand]);
    renderAs(gm, `/compendium?item=${wand.id}`);
    const fields = await startEditing("Wand of Sparks");

    if (pointer === "fine") {
      await user.selectOptions(fields.getByRole("combobox", { name: "Category" }), "Item");
      await user.selectOptions(fields.getByRole("combobox", { name: "Recharge" }), "no set time");
    } else {
      await user.click(fields.getByRole("button", { name: /^Edit Type/ }));
      await user.selectOptions(within(screen.getByRole("dialog", { name: /^Edit Type/ })).getByRole("combobox", { name: "Category" }), "Item");
      await user.click(screen.getByRole("button", { name: "Done" }));
      await user.click(fields.getByRole("button", { name: /^Edit Recharge/ }));
      await user.selectOptions(screen.getByRole("combobox", { name: "Recharge" }), "no set time");
      await user.click(screen.getByRole("button", { name: "Done" }));
    }
    expect(toolbar().getByText("Editing · 2 changes")).toBeVisible();
    // Live, the "+ stat" prompt is the closed menu's text, not a choice in its list.
    const addStat = fields.queryByRole("combobox", { name: "Add a stat" });
    expect(addStat && within(addStat).queryByRole("option", { name: "+ stat" })).toBeNull();
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    const body = catalog.writes[0].body as ItemInput;
    expect(body).not.toHaveProperty("category");
    expect(body.details).toEqual({ charges: "7", rechargeAmount: "1d6 + 1" });
  });

  test("04-item-sheet-edit-R5: a description that fails on blur keeps its text and names the message as its description", async () => {
    serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${secretBlade.id}`);
    const fields = await startEditing("Secret Blade");
    const description = fields.getByRole("textbox", { name: "Description" });

    act(() => description.focus());
    fireEvent.change(description, { target: { value: "x".repeat(66_000) } });
    act(() => description.blur());

    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAccessibleDescription(/^Description can be at most/);
    expect(fields.getByRole("alert")).toHaveTextContent(/^Description can be at most/);
    expect(toolbar().getByText("1 field holds unapplied text")).toBeVisible();
  });

  const rejectNoteAfterWeightEdit = async (pointer: "fine" | "coarse") => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG, { rejectPut: [{ path: "attunementNote", message: "An attunement note needs Requires attunement." }] });
    renderAs(gm, `/compendium?item=${longswordPhb.id}`);
    const fields = await startEditing("Longsword");
    expect(fields.queryByRole("textbox", { name: "Attunement note" })).not.toBeInTheDocument();
    if (pointer === "fine") {
      await retype(user, fields.getByRole("textbox", { name: "Weight (lb.)" }), "4");
      await user.keyboard("{Enter}");
    } else {
      await user.click(fields.getByRole("button", { name: "Edit Weight, 3 lb." }));
      await retype(user, popover("Edit Weight, 3 lb.").getByRole("textbox", { name: "Weight (lb.)" }), "4");
      await user.click(popover("Edit Weight, 3 lb.").getByRole("button", { name: "Done" }));
    }
    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    return { user, fields, issue: await issueButton("Attunement note: An attunement note needs Requires attunement.") };
  };

  test("04-item-sheet-edit-R6: live, an attunement note issue focuses the Attunement choice while the note is hidden", async () => {
    const { user, fields, issue } = await rejectNoteAfterWeightEdit("fine");
    const attunement = fields.getByRole("combobox", { name: "Attunement" });
    await waitFor(() => expect(attunement).toHaveFocus());
    act(() => issue.focus());
    await user.click(issue);
    expect(attunement).toHaveFocus();
  });

  test("04-item-sheet-edit-R6: on touch, an attunement note issue opens the type editor with the attunement controls", async () => {
    const { user, issue } = await rejectNoteAfterWeightEdit("coarse");
    const editor = within(await screen.findByRole("dialog", { name: /^Edit Type/ }));
    expect(editor.getByRole("combobox", { name: "Attunement" })).toBeVisible();
    expect(editor.getByRole("textbox", { name: "Attunement note" })).toBeVisible();
    await user.click(editor.getByRole("button", { name: "Cancel" }));
    await user.click(issue);
    expect(await screen.findByRole("dialog", { name: /^Edit Type/ })).toBeVisible();
  });

  test("04-item-sheet-edit-R6: a stored note without Requires attunement is shown live, and its issue focuses it", async () => {
    const user = userEvent.setup();
    const charm = item(11, "Charm", { source: "homebrew", origin: "homebrew", attunementNote: "by a bard" });
    const catalog = serveCatalog([...CATALOG, charm]);
    renderAs(gm, `/compendium?item=${charm.id}`);
    const fields = await startEditing("Charm");
    const note = fields.getByRole("textbox", { name: "Attunement note" });
    expect(note).toHaveValue("by a bard");

    await user.selectOptions(fields.getByRole("combobox", { name: "Rarity" }), "rare");
    await user.click(saveButton());
    const issue = await issueButton("Attunement note: An attunement note needs Requires attunement.");
    await waitFor(() => expect(note).toHaveFocus());
    act(() => issue.focus());
    await user.click(issue);
    expect(note).toHaveFocus();
    expect(catalog.writes).toEqual([]);
  });

  test.each(["fine", "coarse"] as const)("04-item-sheet-edit-R6: a server issue on one listed spell focuses that spell's chip (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const staff = item(12, "Staff of Charms", {
      source: "homebrew", origin: "homebrew",
      details: { spells: [{ name: "Charm Person", source: "PHB" }, { name: "Shield", source: "PHB" }, { name: "Light" }] },
    });
    const catalog = serveCatalog([...CATALOG, staff], { rejectPut: [{ path: "details.spells.1.source", message: "Spell sources can be at most 32 characters." }] });
    renderAs(gm, `/compendium?item=${staff.id}`);
    const fields = await startEditing("Staff of Charms");
    await user.click(fields.getByRole("button", { name: "Remove spell Light" }));
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    const issue = await issueButton("Spells: Shield: Spell sources can be at most 32 characters.");
    const chip = fields.getByRole("button", { name: "Remove spell Shield (PHB)" });
    await waitFor(() => expect(chip).toHaveFocus());
    expect(screen.queryByRole("combobox", { name: "Spell to add" })).not.toBeInTheDocument();
    act(() => issue.focus());
    await user.click(issue);
    expect(chip).toHaveFocus();
  });

  const indexedSpell = (id: number, name: string, source: string) => ({
    id, name, source, level: 3, school: "evocation" as const, ritual: false, concentration: false,
    castingTime: "1 action", castingUnit: "action" as const, components: { v: true, s: true, m: false },
    classes: ["wizard"], damageTypes: [], saves: [], aliases: [],
  });
  const serveFireballs = () =>
    server.use(http.get("/api/dnd5e/spells", () => json({ spells: [indexedSpell(41, "Fireball", "PHB"), indexedSpell(42, "Fireball", "XPHB")] })));
  const staff = item(12, "Staff of Charms", { source: "homebrew", origin: "homebrew" });
  /** Opens the staff's editing sheet, in the pane or (narrow) in the reader dialog. */
  const editStaff = async (width: number) => {
    installMatchMedia(width);
    renderAs(gm, `/compendium?item=${staff.id}`);
    if (width > 800) return startEditing(staff.name);
    await chooseItemAction(await screen.findByRole("dialog", { name: staff.name }), "Edit");
    await screen.findByRole("toolbar", { name: "Editing" });
    return sheet();
  };

  test.each([1280, 700])("04-item-sheet-edit-R7: + spell adds an indexed printing, and a name missing from the index with or without its source (%i px)", async width => {
    const user = userEvent.setup();
    const catalog = serveCatalog([...CATALOG, staff]);
    serveFireballs();
    const fields = await editStaff(width);
    const editor = () => within(screen.getByRole(width > 800 ? "dialog" : "group", { name: "Edit spell" }));
    const search = async () => {
      await user.click(fields.getByRole("button", { name: "+ spell" }));
      const input = editor().getByRole("combobox", { name: "Spell to add" });
      await waitFor(() => expect(input).toHaveFocus());
      return input;
    };

    // Two printings share the name; the chosen one keeps its source.
    await user.type(await search(), "Fireball", { skipClick: true });
    await user.click(within(await screen.findByRole("listbox", { name: "Spell to add" })).getByRole("option", { name: "Fireball (XPHB)" }));
    expect(fields.getByRole("button", { name: "Remove spell Fireball (XPHB)" })).toBeVisible();

    await user.type(await search(), "Lantern of the Moon{Enter}", { skipClick: true });
    const name = editor().getByRole("textbox", { name: "Spell name" });
    expect(name).toHaveValue("Lantern of the Moon");
    await typeInto(user, editor().getByRole("textbox", { name: "Spell source" }), "HB2");
    await user.click(editor().getByRole("button", { name: "Done" }));
    expect(fields.getByRole("button", { name: "Remove spell Lantern of the Moon (HB2)" })).toBeVisible();

    // The shared validator's limit holds the form open; without a source the name stands alone.
    await user.type(await search(), "Moonbeam Song{Enter}", { skipClick: true });
    const source = editor().getByRole("textbox", { name: "Spell source" });
    await typeInto(user, source, "x".repeat(33));
    await user.click(editor().getByRole("button", { name: "Done" }));
    expect(editor().getByRole("alert")).toHaveTextContent(/source can be at most 32 characters/);
    await user.clear(source);
    await user.click(editor().getByRole("button", { name: "Done" }));
    expect(fields.getByRole("button", { name: "Remove spell Moonbeam Song" })).toBeVisible();

    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0]).toEqual({
      method: "PUT",
      id: staff.id,
      body: {
        name: staff.name, source: "homebrew", rarity: "none", requiresAttunement: false, aliases: [],
        details: { spells: [{ name: "Fireball", source: "XPHB" }, { name: "Lantern of the Moon", source: "HB2" }, { name: "Moonbeam Song" }] },
      },
    });
  });

  test("04-item-sheet-edit-R7: an unfinished custom spell keeps its name, source and message through both breakpoints and Resume", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    const catalog = serveCatalog([...CATALOG, staff]);
    serveFireballs();
    renderAs(gm, `/compendium?item=${staff.id}`);
    const fields = await startEditing(staff.name);
    const expectForm = (form: ReturnType<typeof within>, source: string) => {
      expect(form.getByRole("textbox", { name: "Spell name" })).toHaveValue("Review Pending Spell");
      expect(form.getByRole("textbox", { name: "Spell source" })).toHaveValue(source);
      expect(form.getByRole("alert")).toHaveTextContent(/source can be at most 32 characters/);
    };

    await user.click(fields.getByRole("button", { name: "+ spell" }));
    const search = popover("Edit spell").getByRole("combobox", { name: "Spell to add" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.type(search, "Review Pending{Enter}", { skipClick: true });
    await typeInto(user, popover("Edit spell").getByRole("textbox", { name: "Spell name" }), " Spell");
    await typeInto(user, popover("Edit spell").getByRole("textbox", { name: "Spell source" }), "x".repeat(33));
    await user.click(popover("Edit spell").getByRole("button", { name: "Done" }));
    expectForm(popover("Edit spell"), "x".repeat(33));

    setViewportWidth(700);
    const reader = within(await screen.findByRole("dialog", { name: staff.name }));
    expectForm(within(reader.getByRole("group", { name: "Edit spell" })), "x".repeat(33));

    setViewportWidth(1280);
    expectForm(within(await screen.findByRole("dialog", { name: "Edit spell" })), "x".repeat(33));

    await go("/compendium?item=6");
    expect(await card("Bag of Holding")).toBeVisible();
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    const resumed = within(await screen.findByRole("dialog", { name: "Edit spell" }));
    expectForm(resumed, "x".repeat(33));
    await retype(user, resumed.getByRole("textbox", { name: "Spell source" }), "HB3");
    await user.click(resumed.getByRole("button", { name: "Done" }));
    expect(sheet().getByRole("button", { name: "Remove spell Review Pending Spell (HB3)" })).toBeVisible();

    // Done ends the custom step: the next + spell starts from an empty search.
    await user.click(sheet().getByRole("button", { name: "+ spell" }));
    expect(popover("Edit spell").getByRole("combobox", { name: "Spell to add" })).toHaveValue("");
    await user.keyboard("{Escape}");

    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0].body).toMatchObject({ details: { spells: [{ name: "Review Pending Spell", source: "HB3" }] } });
  });

  test("04-item-sheet-edit-R11: + spell keeps an unfinished query through breakpoints and Back, then clears it on Escape and completed choices", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    // Chrome has layout: let the reader's focus management see the description control, which
    // must not steal focus from the spell search that restored when the dialog mounted.
    const visible = vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (this: HTMLElement) {
      return this.parentElement;
    });
    const user = userEvent.setup();
    const catalog = serveCatalog([...CATALOG, staff]);
    serveFireballs();
    renderAs(gm, `/compendium?item=${staff.id}`);
    await startEditing(staff.name);
    const openSearch = async () => {
      await user.click(sheet().getByRole("button", { name: "+ spell" }));
      const input = await screen.findByRole("combobox", { name: "Spell to add" });
      await waitFor(() => expect(input).toHaveFocus());
      return input;
    };

    await user.type(await openSearch(), "Review Before Resize", { skipClick: true });
    setViewportWidth(700);
    await act(async () => {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    });
    expect(await screen.findByRole("combobox", { name: "Spell to add" })).toHaveValue("Review Before Resize");
    setViewportWidth(1280);
    expect(await screen.findByRole("combobox", { name: "Spell to add" })).toHaveValue("Review Before Resize");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox", { name: "Spell to add" })).not.toBeInTheDocument();
    expect(sheet().getByRole("button", { name: "+ spell" })).toHaveFocus();
    expect(await openSearch()).toHaveValue("");

    await user.type(screen.getByRole("combobox", { name: "Spell to add" }), "Fireball", { skipClick: true });
    await user.click(within(await screen.findByRole("listbox", { name: "Spell to add" })).getByRole("option", { name: "Fireball (XPHB)" }));
    expect(sheet().getByRole("button", { name: "Remove spell Fireball (XPHB)" })).toBeVisible();
    expect(await openSearch()).toHaveValue("");
    await user.type(screen.getByRole("combobox", { name: "Spell to add" }), "Review Resumable", { skipClick: true });

    await go(-1);
    expect(await card(staff.name)).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Spell to add" })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    expect(await screen.findByRole("combobox", { name: "Spell to add" })).toHaveValue("Review Resumable");

    await user.keyboard("{Enter}");
    let editor = popover("Edit spell");
    expect(editor.getByRole("textbox", { name: "Spell name" })).toHaveValue("Review Resumable");
    await user.type(editor.getByRole("textbox", { name: "Spell source" }), "HB4");
    await user.click(editor.getByRole("button", { name: "Done" }));
    expect(sheet().getByRole("button", { name: "Remove spell Review Resumable (HB4)" })).toBeVisible();

    await user.type(await openSearch(), "Moonbeam Song{Enter}", { skipClick: true });
    editor = popover("Edit spell");
    expect(editor.getByRole("textbox", { name: "Spell name" })).toHaveValue("Moonbeam Song");
    await user.click(editor.getByRole("button", { name: "Done" }));
    expect(sheet().getByRole("button", { name: "Remove spell Moonbeam Song" })).toBeVisible();

    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0].body).toMatchObject({
      details: {
        spells: [
          { name: "Fireball", source: "XPHB" },
          { name: "Review Resumable", source: "HB4" },
          { name: "Moonbeam Song" },
        ],
      },
    });
    visible.mockRestore();
  });

  test("04-item-sheet-edit-R8: the narrow Source, Also called and + spell editors expand without invalid nesting", async () => {
    const errors = vi.spyOn(console, "error");
    const user = userEvent.setup();
    serveCatalog([...CATALOG, staff]);
    serveFireballs();
    const fields = await editStaff(700);

    await user.click(fields.getByRole("button", { name: "Edit Source, homebrew" }));
    expect(within(fields.getByRole("group", { name: "Edit Source, homebrew" })).getByRole("textbox", { name: "Source" })).toHaveValue("homebrew");
    await user.click(fields.getByRole("button", { name: "+ Also called" }));
    expect(fields.getByRole("group", { name: "Edit Also called" })).toBeVisible();
    await user.click(fields.getByRole("button", { name: "+ spell" }));
    const search = within(fields.getByRole("group", { name: "Edit spell" })).getByRole("combobox", { name: "Spell to add" });
    await waitFor(() => expect(search).toHaveFocus());
    await user.type(search, "Fire", { skipClick: true });
    expect(await screen.findByRole("option", { name: "Fireball (PHB)" })).toBeVisible();

    const nesting = errors.mock.calls.filter(call => /cannot (be a descendant|be a child|contain a nested)/.test(call.map(String).join(" ")));
    errors.mockRestore();
    expect(nesting).toEqual([]);
  });
});

describe("Choosing a base item (05-R1)", () => {
  const silvered = item(8, "Silvered Longsword", { source: "homebrew", origin: "homebrew", category: "melee weapon", base: link(longswordPhb) });
  const pickerResults = () => screen.findByRole("list", { name: "Matching items" });
  const resultNames = (list: HTMLElement) => within(list).getAllByRole("button").map(button => button.textContent);

  test("a new homebrew item takes a base from the concrete items that are not generated specifics", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?section=items");
    await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    await user.click(await sheet().findByRole("button", { name: "+ Base item" }));
    await user.type(screen.getByRole("searchbox", { name: "Search the item catalog" }), "longsword");

    // Both Longsword printings, but neither +1 Longsword specific.
    const results = await pickerResults();
    await waitFor(() => expect(resultNames(results)).toEqual(["LongswordPHB", "LongswordXPHB"]));
    const search = catalog.listRequests.at(-1)!;
    expect([search.get("q"), search.getAll("kinds"), search.get("specifics")]).toEqual(["longsword", ["concrete"], "false"]);
    await user.click(within(results).getByRole("button", { name: /XPHB/ }));
    const base = sheet().getByRole("button", { name: "Edit Base item, Longsword (XPHB)" });
    await waitFor(() => expect(base).toHaveFocus());

    await typeInto(user, sheet().getByRole("textbox", { name: "Name" }), "Moonblade");
    await user.keyboard("{Enter}");
    await user.click(saveButton());
    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=100"));
    expect(catalog.writes[0]).toMatchObject({ method: "POST", body: { name: "Moonblade", baseItemId: longswordXphb.id } });
  });

  test("editing a base never offers the item itself; Escape closes only the picker, and the new base is sent", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog([...CATALOG, silvered]);
    renderAs(gm, `/compendium?item=${silvered.id}`);

    const fields = await startEditing("Silvered Longsword");
    const change = fields.getByRole("button", { name: "Edit Base item, Longsword (PHB)" });
    await user.click(change);
    await user.type(screen.getByRole("searchbox", { name: "Search the item catalog" }), "longsword");
    const results = await pickerResults();
    await waitFor(() => expect(resultNames(results)).toEqual(["LongswordPHB", "LongswordXPHB"]));

    act(() => within(results).getAllByRole("button")[1].focus());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Choose a base item" })).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Editing" })).toBeVisible();
    expect(change).toHaveFocus();

    await user.click(change);
    await user.type(screen.getByRole("searchbox", { name: "Search the item catalog" }), "longsword");
    await user.click(within(await pickerResults()).getByRole("button", { name: /XPHB/ }));
    await user.click(saveButton());

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0]).toMatchObject({ method: "PUT", id: silvered.id, body: { baseItemId: longswordXphb.id } });
  });
});

describe("Giving an item to a character", () => {
  const character = (templateId: number, name: string, role: DnD5eEntitySummary["role"], featuredNpc = false): DnD5eEntitySummary => ({
    templateId, name, role, hp: 10, size: "medium", inParty: false, featuredNpc,
    source: "homebrew", imported: false, locallyEdited: false,
  });
  const CHARACTERS = [character(11, "Bram", "pc"), character(12, "Wolf", "creature"), character(13, "Nyx", "npc", true), character(14, "Mara", "npc")];

  // The append endpoint as the server answers it: the whole stored list, with the new row last.
  function serveAppend(options: { fail?: string } = {}) {
    const appends: Array<{ id: number; body: unknown }> = [];
    server.use(
      http.get("/api/dnd5e/entities/summary", () => json({ entities: CHARACTERS })),
      http.post("/api/dnd5e/entities/:id/inventory/items", async ({ params, request }) => {
        const body = await request.json();
        appends.push({ id: Number(params.id), body });
        if (options.fail) return apiError(404, options.fail);
        const saved: DnD5eInventory = {
          items: [
            { name: "Rope", quantity: 1 },
            { name: "+1 Longsword", quantity: 2, notes: "From the vault", itemId: plusOnePhb.id, item: { name: "+1 Longsword", source: "DMG" } },
          ],
          revision: 4,
        };
        return json(saved, 201);
      })
    );
    return appends;
  }

  test("a GM gives an exact printing to a PC; one append is sent and becomes that character's cached inventory", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const appends = serveAppend();
    const { queryClient } = renderAs(gm, `/compendium?item=${plusOnePhb.id}`);

    const dialog = within(await openItemAction(await card("+1 Longsword"), "Give to character…", "Give +1 Longsword"));
    expect(dialog.getByText(/made from Longsword \(PHB\)/)).toBeVisible();
    const select = dialog.getByRole("combobox", { name: "Character" });
    // Only player characters and featured NPCs carry an inventory.
    await waitFor(() => expect(within(select).getAllByRole("option").map(option => option.textContent))
      .toEqual(["Choose a character", "Bram", "Nyx (featured NPC)"]));
    expect(dialog.getByRole("button", { name: "Give item" })).toBeDisabled();

    await user.selectOptions(select, "Bram");
    await user.clear(dialog.getByRole("spinbutton", { name: "Quantity" }));
    await user.type(dialog.getByRole("spinbutton", { name: "Quantity" }), "2");
    await user.type(dialog.getByRole("textbox", { name: "Notes" }), "From the vault");
    await user.click(dialog.getByRole("button", { name: "Give item" }));

    expect(await dialog.findByRole("status")).toHaveTextContent("Added +1 Longsword to Bram’s inventory.");
    expect(appends).toEqual([{ id: 11, body: { itemId: plusOnePhb.id, quantity: 2, notes: "From the vault" } }]);
    expect(queryClient.getQueryData<DnD5eInventory>(INVENTORY_KEYS.detail({ userId: gm.id, isGm: true }, 11))?.items.map(row => row.name))
      .toEqual(["Rope", "+1 Longsword"]);
    expect(dialog.getByRole("link", { name: "Open Bram" })).toHaveAttribute("href", "/compendium?entity=11");
  });

  test("a family offers no Give, and a failed give keeps the dialog open with the server's message", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const appends = serveAppend({ fail: "Item not found" });
    renderAs(gm, `/compendium?item=${weaponFamily.id}`);

    await user.click(within(await card("+1 Weapon")).getByRole("button", { name: "Actions for +1 Weapon" }));
    expect(screen.queryByRole("menuitem", { name: "Give to character…" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await go(`/compendium?item=${bagOfHolding.id}`);
    const dialog = within(await openItemAction(await card("Bag of Holding"), "Give to character…", "Give Bag of Holding"));
    await waitFor(() => expect(dialog.getAllByRole("option")).toHaveLength(3));
    await user.selectOptions(dialog.getByRole("combobox", { name: "Character" }), "Nyx (featured NPC)");
    await user.click(dialog.getByRole("button", { name: "Give item" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent("Item not found");
    expect(dialog.getByRole("combobox", { name: "Character" })).toHaveValue("13");
    expect(appends).toEqual([{ id: 13, body: { itemId: bagOfHolding.id, quantity: 1 } }]);
  });
});

describe("Item references in text", () => {
  // A homebrew item whose description names a visible item (with display text), a hidden one, an
  // ambiguous one (two Longsword printings) and one the catalog lacks.
  const quiver = item(20, "Quiver", {
    source: "HB",
    origin: "homebrew",
    details: {
      description: "Holds a {@item Longsword|PHB|long blade}, a {@item Secret Blade|homebrew|hidden blade}, any {@item Longsword} and a {@item Vorpal Sword|DMG}.",
    },
  });

  test("a player gets links only for references to items they can see; hidden, ambiguous and missing ones read as authored", async () => {
    const catalog = serveCatalog([...CATALOG, quiver], { hidden: [secretBlade.id] });
    renderAs(player, `/compendium?item=${quiver.id}`);

    const page = await card("Quiver");
    expect(await within(page).findByRole("button", { name: "long blade" })).toBeVisible();
    for (const text of ["hidden blade", "Longsword", "Vorpal Sword"]) {
      expect(within(page).queryByRole("button", { name: text })).not.toBeInTheDocument();
    }
    expect(page).toHaveTextContent("Holds a long blade, a hidden blade, any Longsword and a Vorpal Sword.");
    // One request for the whole description, one entry per distinct reference.
    expect(catalog.resolveRequests).toHaveLength(1);
    expect(catalog.resolveRequests[0]).toHaveLength(4);
    expect(catalog.resolveRequests[0]).toEqual(expect.arrayContaining([
      { name: "Longsword", source: "PHB" },
      { name: "Secret Blade", source: "homebrew" },
      { name: "Longsword" },
      { name: "Vorpal Sword", source: "DMG" },
    ]));
  });

  test("a GM previews a referenced item, hidden ones included, with its own mentions as plain text; Open in Compendium shows it and Back returns", async () => {
    const user = userEvent.setup();
    const blade = { ...secretBlade, details: { description: "Forged beside a {@item Bag of Holding|DMG}." } };
    serveCatalog([...CATALOG.filter(entry => entry.id !== secretBlade.id), blade, quiver], { hidden: [secretBlade.id] });
    renderAs(gm, `/compendium?item=${quiver.id}`);

    await user.click(await within(await card("Quiver")).findByRole("button", { name: "hidden blade" }));
    const preview = await screen.findByRole("dialog", { name: "Secret Blade" });
    expect(within(preview).getByText("Hidden from players.")).toBeVisible();
    expect(await within(preview).findByText("Forged beside a Bag of Holding.")).toBeVisible();
    expect(within(preview).queryByRole("button", { name: "Bag of Holding" })).not.toBeInTheDocument();

    await user.click(within(preview).getByRole("link", { name: "Open in Compendium" }));
    expect(currentUrl()).toBe(`/compendium?item=${secretBlade.id}`);
    expect(screen.queryByRole("dialog", { name: "Secret Blade" })).not.toBeInTheDocument();
    // On the item's own page its mention is a link again.
    expect(await within(await card("Secret Blade")).findByRole("button", { name: "Bag of Holding" })).toBeVisible();

    await go(-1);
    expect(currentUrl()).toBe(`/compendium?item=${quiver.id}`);
    expect(await card("Quiver")).toBeVisible();
  });

  test("a description with more than 100 distinct references resolves them in batches of at most 100", async () => {
    const names = Array.from({ length: 101 }, (_, index) => `Trinket ${String(index).padStart(3, "0")}`);
    const trinkets = names.map((name, index) => item(200 + index, name, { source: "HB" }));
    const ledger = item(30, "Ledger", { details: { description: names.map(name => `{@item ${name}|HB}`).join(", ") } });
    const catalog = serveCatalog([...CATALOG, ...trinkets, ledger]);
    renderAs(player, `/compendium?item=${ledger.id}`);

    const page = await card("Ledger");
    expect(await within(page).findByRole("button", { name: "Trinket 100" })).toBeVisible();
    expect(within(page).getAllByRole("button", { name: /^Trinket \d+$/ })).toHaveLength(101);
    expect(catalog.resolveRequests.map(refs => refs.length).sort((a, b) => a - b)).toEqual([1, 100]);
    expect(new Set(catalog.resolveRequests.flat().map(ref => ref.name)).size).toBe(101);
  });

  const arcaneLock = {
    id: 40, name: "Arcane Lock", source: "XPHB", level: 2, school: "abjuration" as const, ritual: false, concentration: false,
    castingTime: "1 action", castingUnit: "action" as const, components: { v: true, s: true, m: false },
    classes: ["wizard"], damageTypes: [], saves: [], aliases: [],
  };
  // The catalog, plus Arcane Lock, whose text names the bag (as "bag") and the PHB longsword.
  const serveSpellCatalog = () => {
    const catalog = serveCatalog(CATALOG);
    server.use(
      http.get("/api/dnd5e/spells", () => json({ spells: [arcaneLock] })),
      http.get("/api/dnd5e/spells/:id", () => json({ spell: {
        ...arcaneLock, range: "Touch", materialConsumed: false, duration: "Until dispelled", conditions: [], locallyEdited: false,
        description: "You seal a {@item Bag of Holding|DMG|bag}.",
        higherLevels: "It also seals a {@item Longsword|PHB}.",
      } }))
    );
    return catalog;
  };
  const spellCard = async () =>
    within(await screen.findByLabelText("Spell details")).findByRole("article", { name: "Arcane Lock" });
  const hold = () => {
    let release = () => {};
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
  };

  test("a spell's description and higher-level text link the items they name, and the link opens Items", async () => {
    const user = userEvent.setup();
    const catalog = serveSpellCatalog();
    renderAs(player, `/compendium?spell=${arcaneLock.id}`);

    const spell = await spellCard();
    expect(await within(spell).findByRole("button", { name: "Longsword" })).toBeVisible();
    expect(catalog.resolveRequests).toHaveLength(1);
    expect(catalog.resolveRequests[0]).toHaveLength(2);

    await user.click(within(spell).getByRole("button", { name: "bag" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Bag of Holding" })).getByRole("link", { name: "Open in Compendium" }));
    expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe("/compendium?item=6");
    expect(await card("Bag of Holding")).toBeVisible();
  });

  test.each(["its Open in Compendium link", "a direct link"])(
    "13-F017: after a preview outside Items, a player entering Items by %s waits for a fresh answer and never shows the since-hidden description",
    async entry => {
      const user = userEvent.setup();
      const catalog = serveSpellCatalog();
      renderAs(player, `/compendium?spell=${arcaneLock.id}`);

      await user.click(await within(await spellCard()).findByRole("button", { name: "bag" }));
      const preview = await screen.findByRole("dialog", { name: "Bag of Holding" });
      expect(await within(preview).findByText("This bag has an interior space.")).toBeVisible();
      // The GM hides the bag; the player's next item page read is slow.
      catalog.stored.get(bagOfHolding.id)!.hidden = true;
      const detail = hold();
      catalog.holds.detail = detail.promise;

      if (entry === "a direct link") {
        await user.click(within(preview).getByRole("button", { name: "Close item preview" }));
        await go(`/compendium?item=${bagOfHolding.id}`);
      } else {
        await user.click(within(preview).getByRole("link", { name: "Open in Compendium" }));
      }
      expect(screen.getByRole("tab", { name: "Items" })).toHaveAttribute("aria-selected", "true");
      await itemList();
      expect(within(details()).queryByText("This bag has an interior space.")).not.toBeInTheDocument();
      expect(within(details()).queryByRole("article", { name: "Bag of Holding" })).not.toBeInTheDocument();

      detail.release();
      expect(await within(details()).findByText("That item is not available.")).toBeVisible();
      expect(within(details()).queryByText("This bag has an interior space.")).not.toBeInTheDocument();
    }
  );

  test("13-F018: back on Spells, a player's item links wait for a fresh answer and a since-hidden item reads as authored", async () => {
    const user = userEvent.setup();
    const catalog = serveSpellCatalog();
    renderAs(player, `/compendium?spell=${arcaneLock.id}`);

    const spell = await spellCard();
    for (const [mention, name] of [["bag", "Bag of Holding"], ["Longsword", "Longsword"]]) {
      await user.click(await within(spell).findByRole("button", { name: mention }));
      expect(await screen.findByRole("dialog", { name })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Close item preview" }));
    }
    await waitFor(() => expect(catalog.detailRequests).toEqual([bagOfHolding.id, longswordPhb.id]));
    expect(catalog.resolveRequests).toHaveLength(1);

    // Away on Entities, the GM hides the bag; the player's next lookup is slow.
    await user.click(screen.getByRole("tab", { name: "Entities" }));
    catalog.stored.get(bagOfHolding.id)!.hidden = true;
    const resolve = hold();
    catalog.holds.resolve = resolve.promise;
    await user.click(screen.getByRole("tab", { name: "Spells" }));

    expect(spell).toHaveTextContent("You seal a bag.");
    expect(within(spell).queryByRole("button", { name: "bag" })).not.toBeInTheDocument();
    expect(within(spell).queryByRole("button", { name: "Longsword" })).not.toBeInTheDocument();
    await waitFor(() => expect(catalog.resolveRequests).toHaveLength(2));

    resolve.release();
    // The longsword is still visible: its link returns, and its preview is read again for this visit.
    await user.click(await within(spell).findByRole("button", { name: "Longsword" }));
    expect(await screen.findByRole("dialog", { name: "Longsword" })).toBeVisible();
    await waitFor(() => expect(catalog.detailRequests).toEqual([bagOfHolding.id, longswordPhb.id, longswordPhb.id]));
    expect(within(spell).queryByRole("button", { name: "bag" })).not.toBeInTheDocument();
    expect(spell).toHaveTextContent("You seal a bag.");
  });
});

// Step 07: typing `{` in a rich-text source field opens a reference menu under it. One letter picks
// Spell or Item, then the text after it searches; a pick replaces the typed run with a canonical tag.
describe("The { reference menu in an item description", () => {
  const fireballs = () =>
    server.use(http.get("/api/dnd5e/spells", () => json({ spells: [
      { id: 41, name: "Fireball", source: "PHB", level: 3, school: "evocation", ritual: false, concentration: false,
        castingTime: "1 action", castingUnit: "action", components: { v: true, s: true, m: false }, classes: [], damageTypes: [], saves: [], aliases: [] },
      { id: 42, name: "Fireball", source: "XPHB", level: 3, school: "evocation", ritual: false, concentration: false,
        castingTime: "1 action", castingUnit: "action", components: { v: true, s: true, m: false }, classes: [], damageTypes: [], saves: [], aliases: [] },
    ] })));
  const menu = () => screen.queryByRole("listbox", { name: "References" });
  const options = () => within(screen.getByRole("listbox", { name: "References" })).getAllByRole("option").map(option => option.textContent);
  const openDescription = async () => {
    renderAs(gm, `/compendium?item=${secretBlade.id}`);
    const fields = await startEditing("Secret Blade");
    return { fields, description: fields.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement };
  };

  test.each(["fine", "coarse"] as const)("typing picks a spell and an item, and Save sends both tags (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    fireballs();
    const { description } = await openDescription();

    await typeInto(user, description, "Casts {{");
    expect(description).not.toHaveAttribute("role");
    expect(description).not.toHaveAttribute("aria-expanded");
    expect(description).toHaveAttribute("aria-autocomplete", "list");
    expect(options()).toEqual(["Spell", "Item"]);
    await user.keyboard("s fireb");
    await screen.findByRole("option", { name: "Fireball (PHB)" });
    // "fireb" names no spell exactly, so it is also offered as written (a homebrew name), last.
    expect(options()).toEqual(["Fireball (PHB)", "Fireball (XPHB)", "fireb (not in the spell index)"]);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(description).toHaveValue("Casts {@spell Fireball|XPHB}");
    expect(description.selectionStart).toBe(description.value.length);
    expect(menu()).not.toBeInTheDocument();

    // Tab locks the type and picks too; a specific's row names its base printing.
    await user.keyboard(" from {{i{Tab}long");
    await screen.findByRole("option", { name: "Longsword (XPHB)" });
    expect(options()).toEqual(["+1 Longsword (DMG)Longsword (PHB)", "+1 Longsword (DMG)Longsword (XPHB)", "Longsword (PHB)", "Longsword (XPHB)"]);
    await user.keyboard("{ArrowUp}{Tab}");
    expect(description).toHaveValue("Casts {@spell Fireball|XPHB} from {@item Longsword|XPHB}");
    expect(description).toHaveFocus();

    act(() => description.blur());
    await user.click(saveButton());
    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0].body).toMatchObject({ details: { description: "Casts {@spell Fireball|XPHB} from {@item Longsword|XPHB}" } });
  });

  test("Escape closes the menu and leaves the text; the next Escape reverts the field", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { description } = await openDescription();

    await typeInto(user, description, "Hums {{s fi");
    expect(menu()).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(menu()).not.toBeInTheDocument();
    expect(description).toHaveValue("Hums {s fi");
    expect(description).not.toHaveAttribute("aria-expanded");
    await user.keyboard("{Escape}");
    expect(description).toHaveValue("");
    expect(screen.getByRole("toolbar", { name: "Editing" })).toBeInTheDocument();
  });

  test.each([1280, 700])("a composing Escape leaves dirty menu text and the reader open (%s px)", async width => {
    installMatchMedia(width);
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${secretBlade.id}`);
    if (width <= 800) await chooseItemAction(await screen.findByRole("dialog", { name: "Secret Blade" }), "Edit");
    else await startEditing("Secret Blade");
    const description = sheet().getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement;

    await typeInto(user, description, "Hums {{s fi");
    const before = description.value;
    expect(menu()).toBeInTheDocument();
    expect(fireEvent.keyDown(description, { key: "Escape", code: "Escape", isComposing: true })).toBe(true);
    expect(description).toHaveValue(before);
    expect(menu()).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Editing" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Secret Blade" }) !== null).toBe(width <= 800);
  });

  test("an unclosed run with no options keeps an empty menu open and takes Enter, Tab and Up/Down", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { description } = await openDescription();

    await typeInto(user, description, "Line one{Enter}two {{x");
    expect(menu()).toBeInTheDocument();
    expect(within(menu()!).queryAllByRole("option")).toHaveLength(0);
    expect(description).toHaveAttribute("aria-controls", menu()!.id);
    await user.keyboard("{Enter}{Tab}{ArrowDown}{ArrowUp}");
    expect(description).toHaveValue("Line one\ntwo {x");
    expect(description).toHaveFocus();
    expect(menu()).toBeInTheDocument();
    expect(description.selectionStart).toBe(description.value.length);
  });

  test("Enter inserts a newline when the menu is closed", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { description } = await openDescription();

    await typeInto(user, description, "Line one{Enter}two");
    expect(menu()).not.toBeInTheDocument();
    expect(description).toHaveValue("Line one\ntwo");
  });

  test("Shift+Tab acts as Tab while the menu is open, and moves focus back once it is closed", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { description } = await openDescription();

    await typeInto(user, description, "{{s");
    expect(options()).toEqual(["Spell"]);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(description).toHaveValue("{s ");
    expect(description).toHaveFocus();
    expect(description.selectionStart).toBe(3);

    await user.keyboard("{Escape}");
    expect(menu()).not.toBeInTheDocument();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(description).not.toHaveFocus();
  });

  test("moving the caret into a complete tag does not open the menu; back into an unclosed run does", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { description } = await openDescription();

    await typeInto(user, description, "A {{@spell Light} and {{s li");
    expect(menu()).toBeInTheDocument();
    act(() => description.setSelectionRange(5, 5));
    await user.keyboard("{ArrowRight}");
    expect(menu()).not.toBeInTheDocument();
    await user.keyboard("{End}");
    expect(menu()).toBeInTheDocument();
  });

  test("a click on a row picks it without committing; the text applies when it is left", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    fireballs();
    const { fields, description } = await openDescription();

    await typeInto(user, description, "{{s fire");
    const row = await screen.findByRole("option", { name: "Fireball (XPHB)" });
    // The press is cancelled, so a browser keeps focus (and the unapplied text) in the textarea.
    // Pressed directly: user-event's press would land on jsdom's zero-size panel separator.
    expect(fireEvent.mouseDown(row)).toBe(false);
    fireEvent.click(row);
    expect(description).toHaveValue("{@spell Fireball|XPHB}");
    expect(description).toHaveFocus();
    expect(toolbar().getByText("Editing")).toBeVisible();
    expect(toolbar().queryByText(/change/)).not.toBeInTheDocument();

    act(() => fields.getByRole("textbox", { name: "Name" }).focus());
    expect(toolbar().getByText("Editing · 1 change")).toBeVisible();
  });

  test("a spell name the index does not know is inserted as written; an item has no such pick", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    fireballs();
    const { description } = await openDescription();

    await typeInto(user, description, "{{s Moonbeam Glow");
    await screen.findByRole("option", { name: "Moonbeam Glow (not in the spell index)" });
    await user.keyboard("{Enter}");
    expect(description).toHaveValue("{@spell Moonbeam Glow}");

    await user.keyboard(" {{i moonbeam");
    expect(await screen.findByRole("option", { name: "No items match." })).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Enter}");
    expect(description).toHaveValue("{@spell Moonbeam Glow} {i moonbeam");
  });

  test("on a coarse pointer, { opens the menu with focus kept in the text, and Space chooses the highlighted type", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { description } = await openDescription();

    // Closed: the popup relationship is stable, the listbox exists but is hidden, nothing is active.
    const closedList = description.parentElement!.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(description).toHaveAttribute("aria-haspopup", "listbox");
    expect(description).toHaveAttribute("aria-controls", closedList.id);
    expect(closedList).not.toBeVisible();
    expect(description).not.toHaveAttribute("aria-activedescendant");
    const status = within(description.parentElement!).getByRole("status", { name: "Reference menu status" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");

    await typeInto(user, description, "{{");
    expect(description).toHaveValue("{");
    expect(description).toHaveFocus();
    expect(description).toHaveAttribute("aria-haspopup", "listbox");
    expect(description).toHaveAttribute("aria-controls", screen.getByRole("listbox", { name: "References" }).id);
    expect(screen.getByRole("listbox", { name: "References" }).id).toBe(closedList.id);
    expect(status).toHaveTextContent("Reference menu open. Spell");
    expect(options()).toEqual(["Spell", "Item"]);
    await user.keyboard("{ArrowDown}");
    const references = within(screen.getByRole("listbox", { name: "References" }));
    expect(description).toHaveAttribute("aria-activedescendant", references.getByRole("option", { name: "Item" }).id);
    expect(references.getByRole("option", { name: "Item" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard(" ");
    expect(description).toHaveValue("{item ");
    expect(options()).toEqual(["Type an item name"]);
  });

  test("an unclosed run kept through selecting another item and Resume reopens the menu when the caret is back in it", async () => {
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    fireballs();
    const { description } = await openDescription();

    await typeInto(user, description, "Hums {{s fire");
    pressRow(within(await itemList()).getByRole("option", { name: /^Bag of Holding/ }));
    expect(await card("Bag of Holding")).toBeVisible();
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));

    await screen.findByRole("toolbar", { name: "Editing" });
    const resumed = sheet().getByRole("textbox", { name: "Description" });
    expect(resumed).toHaveValue("Hums {s fire");
    expect(menu()).not.toBeInTheDocument();
    act(() => resumed.focus());
    await user.keyboard("{End}");
    expect(await screen.findByRole("option", { name: "Fireball (XPHB)" })).toBeVisible();
  });
});
