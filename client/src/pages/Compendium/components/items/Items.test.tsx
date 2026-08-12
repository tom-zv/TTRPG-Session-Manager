import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
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
import { installLayoutApis, installMatchMedia } from "src/test/fakes/matchMedia.js";
import { apiError, json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl, go } from "src/test/routerProbe.js";
import type { DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
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

type Stored = { item: Item; hidden: boolean; deleted: boolean };

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
    ? { ...stored.item, gm: { hidden: stored.hidden, hiddenByFamily: familyOf(stored)?.hidden ?? false, locallyEdited: false } }
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
      const limit = Number(params.get("limit") ?? 50);
      const unique = <Value,>(values: Value[]) => [...new Set(values)];
      const facets: ItemFacets = {
        kinds: unique(scoped.map(stored => stored.item.kind)),
        categories: unique(scoped.flatMap(stored => (stored.item.category ? [stored.item.category] : []))),
        origins: unique(scoped.map(stored => stored.item.origin)),
        rarities: unique(scoped.map(stored => stored.item.rarity)),
        sources: unique(scoped.map(stored => stored.item.source)).sort(),
      };
      const result: ItemListResult = {
        items: matching.slice(offset, offset + limit).map(stored => summaryOf(stored, viewerIsGm(), familyOf(stored))),
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
      stored.item = fromInput(stored.item.id, body, stored.item);
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
  await userEvent.click(await within(reader).findByRole("button", { name: /^Actions for/ }));
  await userEvent.click(screen.getByRole("menuitem", { name: action }));
  return screen.findByRole("dialog", { name: title });
}

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

  test("a long catalog loads one page at a time", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 60 }, (_, index) => item(200 + index, `Trinket ${String(index).padStart(2, "0")}`));
    const catalog = serveCatalog(many);
    renderAs(player, "/compendium?section=items");
    const list = await itemList();

    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(50));
    expect(screen.getByText("50 of 60 items")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load more items" }));
    await waitFor(() => expect(within(list).getAllByRole("option")).toHaveLength(60));
    expect(catalog.listRequests.at(-1)?.get("offset")).toBe("50");
    expect(screen.queryByRole("button", { name: "Load more items" })).not.toBeInTheDocument();
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

    const dialog = await screen.findByRole("dialog", { name: "Edit +1 Weapon" });
    expect(within(dialog).getByText(/Specific items made from it keep their current text/)).toBeVisible();
  });
});

describe("GM authoring", () => {
  test("a failed create keeps the draft and shows the server's message", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG, { failCreate: "An item named Lantern of Truth already exists in homebrew." });
    renderAs(gm, "/compendium?section=items");
    await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    const dialog = await screen.findByRole("dialog", { name: "New item" });
    await user.type(within(dialog).getByLabelText("Name"), "Lantern of Truth");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("already exists in homebrew");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Lantern of Truth");
    expect(catalog.writes).toHaveLength(1);
  });

  test("the shared rules reject an invalid draft before anything is sent", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?section=items");
    await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    const dialog = await screen.findByRole("dialog", { name: "New item" });
    await user.type(within(dialog).getByLabelText("Name"), "Coin");
    await user.type(within(dialog).getByLabelText("Value (gp)"), "lots");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Value must be a number");
    expect(catalog.writes).toEqual([]);
  });

  test("creating an item selects it and lists it", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?section=items");
    const list = await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    const dialog = await screen.findByRole("dialog", { name: "New item" });
    await user.type(within(dialog).getByLabelText("Name"), "Lantern of Truth");
    await user.type(within(dialog).getByLabelText("Value (gp)"), "12.5");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(catalog.writes[0].body).toMatchObject({ name: "Lantern of Truth", source: "homebrew", valueCp: 1250 });
    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=100"));
    expect(await card("Lantern of Truth")).toBeVisible();
    await waitFor(() => expect(within(list).getByRole("option", { name: /^Lantern of Truth/ })).toBeVisible());
  });

  test("duplicating an imported item creates a homebrew copy that keeps its base and drops its page", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${plusOnePhb.id}`);

    const page = await card("+1 Longsword");
    await user.click(within(page).getByRole("button", { name: "Actions for +1 Longsword" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate as homebrew" }));
    const dialog = await screen.findByRole("dialog", { name: "Duplicate +1 Longsword" });
    expect(within(dialog).getByLabelText("Source")).toHaveValue("homebrew");
    expect(within(dialog).getByLabelText("Page")).toHaveValue("");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));

    await waitFor(() => expect(currentUrl()).toBe("/compendium?item=100"));
    expect(catalog.writes[0]).toMatchObject({ method: "POST", body: { name: "+1 Longsword", source: "homebrew", baseItemId: longswordPhb.id } });
    expect(catalog.writes[0].body).not.toHaveProperty("page");
  });

  test("editing a generated specific never sends a base change", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, `/compendium?item=${plusOnePhb.id}`);

    const page = await card("+1 Longsword");
    await user.click(within(page).getByRole("button", { name: "Actions for +1 Longsword" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit +1 Longsword" });
    // 05-R1: a generated specific's base is its identity, so it offers no base picker.
    expect(within(dialog).getByText("Base item: Longsword (PHB) (fixed for a generated item)")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /base item/ })).not.toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Keen Longsword");
    await user.click(within(dialog).getByRole("button", { name: "Save item" }));

    expect(await card("Keen Longsword")).toBeVisible();
    expect(catalog.writes[0]).toMatchObject({ method: "PUT", id: plusOnePhb.id });
    expect(catalog.writes[0].body).not.toHaveProperty("baseItemId");
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

  test.each([
    ["PUT", "Edit", "Edit Secret Blade", "Save item"],
    ["DELETE", "Delete…", "Delete Secret Blade?", "Delete item"],
  ])("13-F004: a late %s cannot restore GM data or alter the player's URL", async (method, action, title, submit) => {
    const user = userEvent.setup();
    let release!: () => void;
    const holdWrite = new Promise<void>(resolve => { release = resolve; });
    const catalog = serveCatalog(CATALOG, { hidden: [secretBlade.id], holdWrite });
    const { queryClient } = renderAs(gm, `/compendium?item=${secretBlade.id}`, player);
    const gmKeys = ITEM_KEYS.viewer({ userId: gm.id, isGm: true });

    try {
      const dialog = await openItemAction(await card(secretBlade.name), action, title);
      await user.click(within(dialog).getByRole("button", { name: submit }));
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
      const editor = await openItemAction(await card(bagOfHolding.name), "Edit", "Edit Bag of Holding");
      await user.type(within(editor).getByLabelText("Name"), " II");
      await user.click(within(editor).getByRole("button", { name: "Save item" }));
      await waitFor(() => expect(catalog.writes[0]).toMatchObject({ method: "PUT", id: bagOfHolding.id }));

      await go("/compendium?item=2");
      expect(editor).not.toBeInTheDocument();
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
    expect(await screen.findByRole("dialog", { name: "New item" })).toBeVisible();
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

  test("13-F006: narrow Back closes authoring over Spells, and Forward reopens the remembered item and filters", async () => {
    installMatchMedia(420);
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { container } = renderAs(gm, "/compendium?section=spells");
    await user.click(screen.getByRole("tab", { name: "Items" }));
    await user.click(screen.getByRole("checkbox", { name: "Show specific variants" }));
    pressRow(within(await itemList()).getByRole("option", { name: /^Bag of Holding/ }));
    const reader = await screen.findByRole("dialog", { name: bagOfHolding.name });
    await openItemAction(reader, "Edit", "Edit Bag of Holding");

    await go(-1);
    expect(currentUrl()).toBe("/compendium?section=spells");
    expect(screen.getByRole("tab", { name: "Spells" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(container.inert).toBeFalsy();
    expect(container).not.toHaveAttribute("aria-hidden");
    await user.click(await screen.findByRole("button", { name: "New spell" }));
    expect(await screen.findByRole("dialog", { name: "New spell" })).toBeVisible();
    await user.keyboard("{Escape}");

    await go(1);
    expect(currentUrl()).toBe("/compendium?item=6");
    expect(await screen.findByRole("dialog", { name: bagOfHolding.name })).toBeVisible();
    await go(-1);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(container.inert).toBeFalsy();
    await go(1);
    expect(await screen.findByRole("dialog", { name: bagOfHolding.name })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("checkbox", { name: "Show specific variants" })).toBeChecked();
  });

  test.each([
    ["Edit", "Edit Bag of Holding", "Save item", "Bag of Holding", "?item=6"],
    ["Duplicate as homebrew", "Duplicate Bag of Holding", "Create item", "Spare Bag", "?item=100"],
    ["Delete…", "Delete Bag of Holding?", "Delete item", null, "?section=items"],
  ])("13-F007: narrow %s gives the active dialog focus and supports Cancel, Escape and success", async (action, title, submit, result, location) => {
    installMatchMedia(420);
    const user = userEvent.setup();
    serveCatalog(CATALOG);
    const { container } = renderAs(gm, "/compendium?item=6");
    const reader = () => screen.findByRole("dialog", { name: bagOfHolding.name });

    for (const cancelWithEscape of [false, true]) {
      const dialog = await openItemAction(await reader(), action, title);
      expect(screen.getAllByRole("dialog", { hidden: true })).toEqual([dialog]);
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
      if (cancelWithEscape) await user.keyboard("{Escape}");
      else await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      const restored = await reader();
      await waitFor(() => expect(restored).toContainElement(document.activeElement as HTMLElement));
    }

    const dialog = await openItemAction(await reader(), action, title);
    if (action === "Duplicate as homebrew") {
      const name = within(dialog).getByLabelText("Name");
      await user.clear(name);
      await user.type(name, "Spare Bag");
    }
    await user.click(within(dialog).getByRole("button", { name: submit }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(currentUrl()).toBe(`/compendium${location}`));
    const focusTarget = result
      ? await screen.findByRole("dialog", { name: result })
      : screen.getByRole("searchbox", { name: "Search items by name" });
    await waitFor(() => expect(focusTarget).toContainElement(document.activeElement as HTMLElement));
    if (result) {
      await within(focusTarget).findByRole("article", { name: result });
      await user.keyboard("{Escape}");
    }
    expect(within(await itemList()).queryAllByRole("option", { name: /^Bag of Holding/ })).toHaveLength(result ? 1 : 0);
    expect(screen.queryByRole("dialog", { hidden: true })).not.toBeInTheDocument();
    expect(container.inert).toBeFalsy();
    expect(container).not.toHaveAttribute("aria-hidden");
    await user.click(screen.getByRole("button", { name: "New item" }));
    expect(await screen.findByRole("dialog", { name: "New item" })).toBeVisible();
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
    const dialog = within(await screen.findByRole("dialog", { name: "New item" }));
    await user.type(dialog.getByLabelText("Name"), "Test weapon");
    await user.type(dialog.getByLabelText(label), value);
    await user.click(dialog.getByRole("button", { name: "Create item" }));

    expect(await dialog.findByRole("alert")).toHaveTextContent("Damage dice is required");
    expect(dialog.getByLabelText(label)).toHaveValue(value);
    expect(catalog.writes).toEqual([]);

    await user.type(dialog.getByLabelText("Damage dice"), "1d8");
    await user.click(dialog.getByRole("button", { name: "Create item" }));
    expect(await card("Test weapon")).toBeVisible();
    expect(catalog.writes[0].body).toMatchObject({ details: { damage: { dice: "1d8", [field]: value } } });
  });

  test.each(["-0.0000001", "1.0000001", "999999999.9999999"])(
    "13-F009: saving %s gp keeps the draft open and sends no rounded price",
    async value => {
      const user = userEvent.setup();
      const catalog = serveCatalog(CATALOG);
      renderAs(gm, "/compendium?item=6");
      const dialog = within(await openItemAction(await card(bagOfHolding.name), "Edit", "Edit Bag of Holding"));
      const price = dialog.getByLabelText("Value (gp)");
      await user.type(price, value);
      await user.click(dialog.getByRole("button", { name: "Save item" }));

      expect(await dialog.findByRole("alert")).toHaveTextContent("Value must be a number");
      expect(price).toHaveValue(value);
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

    const dialog = await openItemAction(page, "Edit", "Edit Bag of Holding");
    const price = within(dialog).getByLabelText("Value (gp)");
    expect(price).toHaveValue(gpInput);
    await user.click(within(dialog).getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(catalog.writes[0].body).toMatchObject({ valueCp });
  });

  test("13-F010: no-op, rename and spell addition preserve the original typed details", async () => {
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
    const edit = () => openItemAction(screen.getByRole("article", { name: bagOfHolding.name }), "Edit", "Edit Bag of Holding");

    expect(await card(bagOfHolding.name)).toBeVisible();
    const noOp = await edit();
    expect(within(noOp).getByLabelText("Spell 1 name")).toHaveValue("A|B");
    expect(within(noOp).getByLabelText("Spell 1 source")).toHaveValue("Book");
    await user.click(within(noOp).getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(noOp).not.toBeInTheDocument());
    expect(catalog.writes[0].body).toHaveProperty("details", original.details);

    const rename = within(await edit());
    await user.type(rename.getByLabelText("Name"), " II");
    await user.click(rename.getByRole("button", { name: "Save item" }));
    const renamed = await card("Bag of Holding II");
    expect(catalog.writes[1].body).toHaveProperty("details", original.details);

    const add = within(await openItemAction(renamed, "Edit", "Edit Bag of Holding II"));
    await user.click(add.getByRole("button", { name: "Add spell" }));
    await user.type(add.getByLabelText("Spell 2 name"), "C|D");
    await user.type(add.getByLabelText("Spell 2 source"), "Volume|2");
    await user.click(add.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(catalog.writes[2]?.body).toHaveProperty("details", {
      ...original.details,
      spells: [...original.details.spells, { name: "C|D", source: "Volume|2" }],
    }));
  });
});

describe("Choosing a base item (05-R1)", () => {
  const silvered = item(8, "Silvered Longsword", { source: "homebrew", origin: "homebrew", category: "melee weapon", base: link(longswordPhb) });
  const pickerResults = (dialog: HTMLElement) => within(dialog).findByRole("list", { name: "Matching items" });
  const resultNames = (list: HTMLElement) => within(list).getAllByRole("button").map(button => button.textContent);

  test("a new homebrew item takes a base from the concrete items that are not generated specifics", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog(CATALOG);
    renderAs(gm, "/compendium?section=items");
    await itemList();

    await user.click(screen.getByRole("button", { name: "New item" }));
    const dialog = await screen.findByRole("dialog", { name: "New item" });
    expect(within(dialog).getByText(/No base item\./)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Choose a base item" }));
    await user.type(within(dialog).getByRole("searchbox", { name: "Search the item catalog" }), "longsword");

    // Both Longsword printings, but neither +1 Longsword specific.
    const results = await pickerResults(dialog);
    await waitFor(() => expect(resultNames(results)).toEqual(["LongswordPHB", "LongswordXPHB"]));
    const search = catalog.listRequests.at(-1)!;
    expect([search.get("q"), search.getAll("kinds"), search.get("specifics")]).toEqual(["longsword", ["concrete"], "false"]);
    await user.click(within(results).getByRole("button", { name: /XPHB/ }));
    expect(within(dialog).getByText(/Base item: Longsword \(XPHB\)/)).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Change base item" })).toHaveFocus();

    await user.type(within(dialog).getByLabelText("Name"), "Moonblade");
    await user.click(within(dialog).getByRole("button", { name: "Create item" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(catalog.writes[0]).toMatchObject({ method: "POST", body: { name: "Moonblade", baseItemId: longswordXphb.id } });
  });

  test("editing a base never offers the item itself; Escape closes only the picker, and the new base is sent", async () => {
    const user = userEvent.setup();
    const catalog = serveCatalog([...CATALOG, silvered]);
    renderAs(gm, `/compendium?item=${silvered.id}`);

    const dialog = await openItemAction(await card("Silvered Longsword"), "Edit", "Edit Silvered Longsword");
    expect(within(dialog).getByText(/Base item: Longsword \(PHB\)/)).toBeVisible();
    const change = within(dialog).getByRole("button", { name: "Change base item" });
    await user.click(change);
    await user.type(within(dialog).getByRole("searchbox", { name: "Search the item catalog" }), "longsword");
    const results = await pickerResults(dialog);
    await waitFor(() => expect(resultNames(results)).toEqual(["LongswordPHB", "LongswordXPHB"]));

    act(() => within(results).getAllByRole("button")[1].focus());
    await user.keyboard("{Escape}");
    expect(within(dialog).queryByRole("group", { name: "Choose a base item" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit Silvered Longsword" })).toBeVisible();
    expect(change).toHaveFocus();

    await user.click(change);
    await user.type(within(dialog).getByRole("searchbox", { name: "Search the item catalog" }), "longsword");
    await user.click(within(await pickerResults(dialog)).getByRole("button", { name: /XPHB/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(catalog.writes).toHaveLength(1));
    expect(catalog.writes[0]).toMatchObject({ method: "PUT", id: silvered.id, body: { baseItemId: longswordXphb.id } });
  });
});

describe("Giving an item to a character", () => {
  const character = (templateId: number, name: string, role: DnD5eEntitySummary["role"], featuredNpc = false): DnD5eEntitySummary => ({
    templateId, name, role, hp: 10, size: "medium", inParty: false, featuredNpc,
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
