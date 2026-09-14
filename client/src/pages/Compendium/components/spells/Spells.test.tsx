import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { StrictMode } from "react";
import { beforeEach, describe, expect, test } from "vitest";
import type { ItemRef, ItemSummary } from "shared/domain/dnd5e/item.js";
import type { Spell, SpellInput } from "shared/domain/dnd5e/spell.js";
import type { WriteIssue } from "shared/domain/writeValidation.js";
import { installLayoutApis, installMatchMedia } from "src/test/fakes/matchMedia.js";
import { apiError, json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl } from "src/test/routerProbe.js";
import { Compendium } from "../Compendium.js";

const gm = testUser({ id: 1, username: "gm", isGm: true });

const fireball: Spell = {
  id: 7,
  name: "Fireball",
  source: "XPHB",
  page: 241,
  level: 3,
  school: "evocation",
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  castingUnit: "action",
  components: { v: true, s: true, m: true },
  material: "a ball of bat guano and sulfur",
  materialConsumed: false,
  range: "150 feet",
  rangeFeet: 150,
  duration: "Instantaneous",
  description: "A bright streak flashes from you.",
  higherLevels: "The damage increases by 1d6.",
  classes: ["Sorcerer", "Wizard"],
  damageTypes: ["fire"],
  saves: ["dexterity"],
  conditions: [],
  aliases: [],
  locallyEdited: false,
};

const raiseDead: Spell = {
  ...fireball,
  id: 9,
  name: "Raise Dead",
  page: 311,
  level: 5,
  school: "necromancy",
  castingTime: "1 hour",
  castingUnit: "hour",
  material: "a diamond worth 500+ GP",
  materialCostCp: 50000,
  materialConsumed: true,
  range: "Touch",
  rangeFeet: undefined,
  description: "You return a dead creature to life.",
  higherLevels: undefined,
  classes: ["Bard", "Cleric"],
  damageTypes: [],
  saves: [],
};

// Stored before the shared rules: a level the sheet's choice does not offer.
const oldWish: Spell = { ...fireball, id: 11, name: "Old Wish", source: "homebrew", page: undefined, level: 12, higherLevels: undefined };

/** The PUT a Fireball edit sends: the full snapshot, with the derived fields recomputed. */
const fireballInput = (patch: Partial<SpellInput> = {}): SpellInput => ({
  name: "Fireball",
  source: "XPHB",
  page: 241,
  level: 3,
  school: "evocation",
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  castingUnit: "action",
  range: "150 feet",
  rangeFeet: 150,
  components: { v: true, s: true, m: true },
  material: "a ball of bat guano and sulfur",
  materialConsumed: false,
  duration: "Instantaneous",
  description: "A bright streak flashes from you.",
  higherLevels: "The damage increases by 1d6.",
  classes: ["Sorcerer", "Wizard"],
  damageTypes: ["fire"],
  saves: ["dexterity"],
  conditions: [],
  aliases: [],
  ...patch,
});

type Library = {
  stored: Map<number, Spell>;
  writes: Array<{ method: string; id?: number; body: SpellInput }>;
};

// The spell API: a full snapshot per write, which the server marks as edited (spells.md).
function serveSpells(spells: Spell[], options: { rejectPut?: WriteIssue[]; casters?: Record<number, string[]> } = {}): Library {
  const library: Library = { stored: new Map(spells.map(spell => [spell.id, spell])), writes: [] };
  let nextId = 100;
  const fromInput = (id: number, input: SpellInput): Spell => ({ ...input, id, locallyEdited: true });
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: [...library.stored.values()] })),
    http.get("/api/dnd5e/spells/:id", ({ params }) => {
      const spell = library.stored.get(Number(params.id));
      return spell ? json({ spell }) : apiError(404, "Spell not found");
    }),
    http.get("/api/dnd5e/spells/:id/casters", ({ params }) =>
      json({ entities: (options.casters?.[Number(params.id)] ?? []).map((name, index) => ({ id: index + 1, name })) })),
    http.post("/api/dnd5e/spells", async ({ request }) => {
      const body = (await request.json()) as SpellInput;
      library.writes.push({ method: "POST", body });
      const created = fromInput(nextId++, body);
      library.stored.set(created.id, created);
      return json({ spell: created }, 201);
    }),
    http.put("/api/dnd5e/spells/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const body = (await request.json()) as SpellInput;
      library.writes.push({ method: "PUT", id, body });
      if (options.rejectPut) return json({ message: "Invalid spell data.", details: options.rejectPut }, 400);
      const saved = fromInput(id, body);
      library.stored.set(id, saved);
      return json({ spell: saved });
    }),
    // The other tabs stay mounted; they are covered in their own tests.
    http.get("/api/dnd5e/entities/summary", () => json({ entities: [] })),
    http.get("/api/dnd5e/items", () =>
      json({ items: [], total: 0, offset: 0, limit: 50, facets: { kinds: [], categories: [], origins: [], rarities: [], sources: [] } })),
  );
  return library;
}

const renderAsGm = (route: string, strict = false) =>
  renderWithProviders(
    <StrictModeMount strict={strict}>
      <Compendium />
      <RouterProbe />
    </StrictModeMount>,
    { route, user: gm },
  );

const StrictModeMount = ({ strict, children }: { strict: boolean; children: React.ReactNode }) =>
  strict ? <StrictMode>{children}</StrictMode> : <>{children}</>;

type EventUser = ReturnType<typeof userEvent.setup>;
const spellList = () => screen.findByRole("listbox", { name: "Spells" });
const card = async (name: string) => within(await screen.findByLabelText("Spell details")).findByRole("article", { name });
const toolbar = () => within(screen.getByRole("toolbar", { name: "Editing" }));
const saveButton = () => toolbar().getByRole("button", { name: "Save" });
// The editing sheet, wherever the reader is (the pane, or the narrow dialog).
const sheet = () => within(screen.getByRole("toolbar", { name: "Editing" }).closest("article")!);
// A target's popover editor, named "Edit <its label>".
const popover = (name: string) => within(screen.getByRole("dialog", { name }));
// See Compendium.test.tsx: in the desktop split pane, press rows with the mousedown they listen for.
const pressRow = (row: HTMLElement) => act(() => void fireEvent.mouseDown(row));

async function chooseSpellAction(name: string, action: string) {
  const user = userEvent.setup();
  await user.click(within(await card(name)).getByRole("button", { name: `Options for ${name}` }));
  await user.click(screen.getByRole("menuitem", { name: action }));
}

/** Opens a spell's sheet in edit mode from its options menu, once the full spell has loaded. */
async function startEditing(name: string) {
  await chooseSpellAction(name, "Edit");
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

// The spell sheet is the edit surface (step 05). With a mouse on a wide pane its values are inputs;
// on touch or a narrow pane each value opens its own editor. Both draw the same field specs.
describe("GM editing on the spell sheet", () => {
  test.each(["fine", "coarse"] as const)(
    "editing an imported spell's range and duration saves the full snapshot with feet and concentration derived (%s pointer)",
    async pointer => {
      installMatchMedia(1280, { pointer });
      const user = userEvent.setup();
      const library = serveSpells([fireball, raiseDead]);
      renderAsGm(`/compendium?spell=${fireball.id}`);
      const fields = await startEditing("Fireball");
      expect(currentUrl()).toBe(`/compendium?spell=${fireball.id}&edit=1`);

      // Live, the values are the inputs; on touch, each value is a target that opens its editor.
      expect(fields.queryByRole("button", { name: "Edit Range, 150 feet" }) === null).toBe(pointer === "fine");
      const setText = async (label: string, shown: string, text: string) => {
        if (pointer === "fine") {
          await retype(user, fields.getByRole("combobox", { name: label }), text);
          await user.keyboard("{Enter}");
          return;
        }
        const target = `Edit ${label}, ${shown}`;
        await user.click(fields.getByRole("button", { name: target }));
        await retype(user, popover(target).getByLabelText(label), text);
        await user.click(popover(target).getByRole("button", { name: "Done" }));
      };
      await setText("Range", "150 feet", "120 feet");
      await setText("Duration", "Instantaneous", "Concentration, up to 1 minute");
      expect(toolbar().getByText("Editing · 2 changes")).toBeVisible();
      await user.click(saveButton());

      await waitFor(() => expect(library.writes).toHaveLength(1));
      expect(library.writes[0]).toEqual({
        method: "PUT",
        id: fireball.id,
        body: fireballInput({ range: "120 feet", rangeFeet: 120, duration: "Concentration, up to 1 minute", concentration: true }),
      });
      await waitFor(() => expect(currentUrl()).toBe(`/compendium?spell=${fireball.id}`));
      const page = await card("Fireball");
      expect(within(page).getByText("XPHB, page 241 · edited")).toBeVisible();
      expect(within(page).getByText("Concentration, up to 1 minute")).toBeVisible();
    },
  );

  test.each(["fine", "coarse"] as const)("turning M off leaves the material, its cost and consumed out of the request (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const library = serveSpells([fireball, raiseDead]);
    renderAsGm(`/compendium?spell=${raiseDead.id}`);
    const fields = await startEditing("Raise Dead");

    const target = "Edit Components, V, S, M (a diamond worth 500+ GP)";
    // Live, M is a toggle drawn as its letter; on touch, the components editor holds it.
    const turnOffM = pointer === "fine"
      ? () => user.click(fields.getByRole("button", { name: "Material component", pressed: true }))
      : async () => {
        await user.click(fields.getByRole("button", { name: target }));
        await user.selectOptions(popover(target).getByRole("combobox", { name: "Material component" }), "no");
        await user.click(popover(target).getByRole("button", { name: "Done" }));
      };
    await turnOffM();
    // The material's fields go with it.
    expect(fields.queryByRole("textbox", { name: "Material cost (gp)" })).not.toBeInTheDocument();
    expect(fields.queryByRole("button", { name: "Edit Components, V, S" }) !== null).toBe(pointer === "coarse");
    expect(fields.queryByRole("button", { name: "Material component", pressed: false }) !== null).toBe(pointer === "fine");
    await user.click(saveButton());

    await waitFor(() => expect(library.writes).toHaveLength(1));
    const { body } = library.writes[0];
    expect(body.components).toEqual({ v: true, s: true, m: false });
    expect(body.materialConsumed).toBe(false);
    expect(body).not.toHaveProperty("material");
    expect(body).not.toHaveProperty("materialCostCp");
  });

  test.each(["fine", "coarse"] as const)("a stored invalid level is an issue at Save whose jump reaches the level; nothing is sent (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const library = serveSpells([fireball, oldWish]);
    renderAsGm(`/compendium?spell=${oldWish.id}`);
    const fields = await startEditing("Old Wish");

    if (pointer === "fine") {
      await retype(user, fields.getByRole("textbox", { name: "Name" }), "Older Wish");
      await user.keyboard("{Enter}");
    } else {
      await user.click(fields.getByRole("button", { name: "Edit Name, Old Wish" }));
      await retype(user, screen.getByRole("textbox", { name: "Name" }), "Older Wish");
      await user.keyboard("{Enter}");
    }
    await user.click(saveButton());

    expect(await screen.findByText("Not saved. Fix 1 issue first.")).toBeVisible();
    const issues = within(screen.getByRole("list", { name: "Issues" }));
    expect(issues.getByRole("button", { name: "Level: Level must be a whole number from 0 (cantrip) to 9." })).toBeVisible();
    // Live, the level choice itself; on touch, the level and school editor opens on it.
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Level" })).toHaveFocus());
    expect(fields.queryByRole("button", { name: "Edit Level and school, Level 12 Evocation" })?.getAttribute("aria-expanded") ?? null)
      .toBe(pointer === "coarse" ? "true" : null);
    expect(library.writes).toEqual([]);
  });

  test.each(["fine", "coarse"] as const)("a server 400 on rangeFeet places its issue on the range (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const library = serveSpells([fireball], { rejectPut: [{ path: "rangeFeet", message: "Range in feet must be a whole number." }] });
    renderAsGm(`/compendium?spell=${fireball.id}`);
    const fields = await startEditing("Fireball");
    if (pointer === "fine") {
      await user.selectOptions(fields.getByRole("combobox", { name: "School" }), "conjuration");
    } else {
      const target = "Edit Level and school, Level 3 Evocation";
      await user.click(fields.getByRole("button", { name: target }));
      await user.selectOptions(popover(target).getByRole("combobox", { name: "School" }), "conjuration");
      await user.click(popover(target).getByRole("button", { name: "Done" }));
    }
    await user.click(saveButton());

    await waitFor(() => expect(library.writes).toHaveLength(1));
    expect(await within(screen.getByRole("list", { name: "Issues" })).findByRole("button", { name: "Range: Range in feet must be a whole number." })).toBeVisible();
    // Live, the range field; on touch, the range editor opens on it.
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Range" })).toHaveFocus());
    expect(fields.queryByRole("button", { name: "Edit Range, 150 feet" })?.getAttribute("aria-expanded") ?? null)
      .toBe(pointer === "coarse" ? "true" : null);
    expect(screen.getByText("Invalid spell data.")).toBeVisible();
  });

  test.each([
    { width: 1280, presentation: "touch popover" },
    { width: 700, presentation: "narrow inline editor" },
  ])("R1: a grouped editor focuses the exact server issue field in a $presentation", async ({ width }) => {
    installMatchMedia(width, { pointer: "coarse" });
    const user = userEvent.setup();
    const library = serveSpells([fireball], {
      rejectPut: [{ path: "materialCostCp", message: "Review fixture error." }],
    });
    renderAsGm(`/compendium?spell=${fireball.id}&edit=1`, true);
    await screen.findByRole("toolbar", { name: "Editing" });
    const fields = sheet();
    const headerName = "Edit Level and school, Level 3 Evocation";
    const header = fields.getByRole("button", { name: headerName });
    await user.click(header);
    const headerEditor = within(screen.getByRole(width <= 800 ? "group" : "dialog", { name: headerName }));
    await user.selectOptions(headerEditor.getByRole("combobox", { name: "School" }), "conjuration");
    await user.click(headerEditor.getByRole("button", { name: "Done" }));
    await user.click(saveButton());

    await waitFor(() => expect(library.writes).toHaveLength(1));
    const issue = await within(screen.getByRole("list", { name: "Issues" }))
      .findByRole("button", { name: "Material cost: Review fixture error." });
    const materialCost = screen.getByRole("textbox", { name: "Material cost (gp)" });
    await waitFor(() => expect(materialCost).toHaveFocus());
    expect(fields.getByRole("button", { name: /Edit Components,/ })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("combobox", { name: "Verbal component" }));
    expect(screen.getByRole("combobox", { name: "Verbal component" })).toHaveFocus();
    await user.click(issue);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Material cost (gp)" })).toHaveFocus());

    const componentsName = /Edit Components,/;
    let editor = within(screen.getByRole(width <= 800 ? "group" : "dialog", { name: componentsName }));
    await user.click(editor.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(fields.getByRole("button", { name: componentsName })).toHaveFocus());
    await user.click(issue);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Material cost (gp)" })).toHaveFocus());

    editor = within(screen.getByRole(width <= 800 ? "group" : "dialog", { name: componentsName }));
    await user.click(editor.getByRole("button", { name: "Cancel" }));
    const otherGroup = fields.getByRole("button", { name: /^Edit Level and school,/ });
    await user.click(otherGroup);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Level" })).toHaveFocus());
    await user.click(issue);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Material cost (gp)" })).toHaveFocus());
  });

  test("Duplicate as homebrew opens ?spell=new&from=<id> as homebrew without a page and creates on Save", async () => {
    const user = userEvent.setup();
    const library = serveSpells([fireball, raiseDead]);
    renderAsGm(`/compendium?spell=${fireball.id}`);
    const list = await spellList();

    await chooseSpellAction("Fireball", "Duplicate as homebrew");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?spell=new&from=${fireball.id}`));
    const fields = await screen.findByRole("toolbar", { name: "Editing" }).then(() => sheet());
    expect(toolbar().getByText("New spell")).toBeVisible();
    expect(fields.getByRole("textbox", { name: "Source" })).toHaveValue("homebrew");
    expect(fields.getByRole("textbox", { name: "Page" })).toHaveValue("");
    await retype(user, fields.getByRole("textbox", { name: "Name" }), "Ember Ball");
    await user.keyboard("{Enter}");
    await user.click(saveButton());

    await waitFor(() => expect(currentUrl()).toBe("/compendium?spell=100"));
    expect(library.writes).toHaveLength(1);
    expect(library.writes[0]).toEqual({ method: "POST", body: fireballInput({ name: "Ember Ball", source: "homebrew", page: undefined }) });
    expect(library.writes[0].body).not.toHaveProperty("page");
    expect(await card("Ember Ball")).toBeVisible();
    await waitFor(() => expect(within(list).getByRole("option", { name: /^Ember Ball/ })).toBeVisible());
  });

  test("New spell needs a description; the created spell is then selected", async () => {
    const user = userEvent.setup();
    const library = serveSpells([fireball]);
    renderAsGm("/compendium?section=spells");
    await spellList();

    await user.click(screen.getByRole("button", { name: "New spell" }));
    expect(currentUrl()).toBe("/compendium?spell=new");
    const fields = await screen.findByRole("toolbar", { name: "Editing" }).then(() => sheet());
    await typeInto(user, fields.getByRole("textbox", { name: "Name" }), "Glimmer");
    await user.keyboard("{Enter}");
    await user.click(saveButton());
    expect(await within(screen.getByRole("list", { name: "Issues" })).findByRole("button", { name: "Description: Description is required." })).toBeVisible();
    await waitFor(() => expect(fields.getByRole("textbox", { name: "Description" })).toHaveFocus());
    await user.type(fields.getByRole("textbox", { name: "Description" }), "A mote of light.", { skipClick: true });
    await user.click(saveButton());

    await waitFor(() => expect(currentUrl()).toBe("/compendium?spell=100"));
    expect(library.writes).toHaveLength(1);
    expect(library.writes[0].body).toMatchObject({ name: "Glimmer", source: "homebrew", description: "A mote of light.", level: 1 });
    expect(await card("Glimmer")).toBeVisible();
  });

  test("unapplied text survives selecting another spell and Resume", async () => {
    const user = userEvent.setup();
    const library = serveSpells([fireball, raiseDead]);
    renderAsGm(`/compendium?spell=${fireball.id}`);
    const list = await spellList();
    const fields = await startEditing("Fireball");

    const page = fields.getByRole("textbox", { name: "Page" });
    await retype(user, page, "abc");
    await user.keyboard("{Enter}");
    expect(page).toHaveAttribute("aria-invalid", "true");

    pressRow(within(list).getByRole("option", { name: /^Raise Dead/ }));
    expect(await card("Raise Dead")).toBeVisible();
    const bar = screen.getByRole("region", { name: "Unsaved changes" });
    expect(bar).toHaveTextContent("Unsaved changes to Fireball");
    await user.click(within(bar).getByRole("button", { name: "Resume" }));

    await waitFor(() => expect(currentUrl()).toBe(`/compendium?spell=${fireball.id}&edit=1`));
    const resumed = (await screen.findByRole("toolbar", { name: "Editing" })) && sheet().getByRole("textbox", { name: "Page" });
    expect(resumed).toHaveValue("abc");
    expect(resumed).toHaveAccessibleDescription("Page must be a whole number of at least 1.");
    expect(saveButton()).toBeDisabled();
    expect(library.writes).toEqual([]);
  });

  test("renaming a spell that creatures name warns that their lists will show it as plain text", async () => {
    const user = userEvent.setup();
    serveSpells([fireball], { casters: { [fireball.id]: ["Archmage", "Mage"] } });
    renderAsGm(`/compendium?spell=${fireball.id}`);
    const fields = await startEditing("Fireball");

    expect(fields.queryByText(/creatures name this spell/)).not.toBeInTheDocument();
    await retype(user, fields.getByRole("textbox", { name: "Name" }), "Flame Ball");
    await user.keyboard("{Enter}");
    expect(fields.getByText(/creatures name this spell/)).toHaveTextContent("2 creatures name this spell as “Fireball”.");
  });
});

// Step 07: the `{` reference menu in a spell's rich text (see Items.test.tsx for the full key set).
describe("The { reference menu in a spell's higher levels", () => {
  const bagOfHolding: ItemSummary = { id: 6, kind: "concrete", origin: "imported", name: "Bag of Holding", source: "DMG", rarity: "uncommon", requiresAttunement: false, aliases: [] };
  // The item catalog search and item link resolution, with one item.
  const serveBag = () =>
    server.use(
      http.get("/api/dnd5e/items", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
        const items = q && bagOfHolding.name.toLowerCase().includes(q) ? [bagOfHolding] : [];
        return json({ items, total: items.length, offset: 0, limit: 20, facets: { kinds: [], categories: [], origins: [], rarities: [], sources: [] } });
      }),
      http.post("/api/dnd5e/items/resolve", async ({ request }) => {
        const { refs } = (await request.json()) as { refs: ItemRef[] };
        return json({ results: refs.map(ref => ({ ref, item: ref.name === bagOfHolding.name ? bagOfHolding : null })) });
      }),
    );
  const higherLevels = () => sheet().getByRole("textbox", { name: "Using a Higher-Level Spell Slot" }) as HTMLTextAreaElement;
  /** Types at the end of the stored text, as after clicking past its last line. */
  const typeAtEnd = async (user: EventUser, field: HTMLTextAreaElement, typed: string) => {
    act(() => field.focus());
    const end = field.value.length;
    await user.type(field, typed, { skipClick: true, initialSelectionStart: end, initialSelectionEnd: end });
  };

  test.each(["fine", "coarse"] as const)("{ s Space fireb Enter inserts the tag; { i bag adds an item; view mode links both (%s pointer)", async pointer => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const library = serveSpells([fireball, raiseDead]);
    serveBag();
    renderAsGm(`/compendium?spell=${fireball.id}`);
    await startEditing("Fireball");
    const text = higherLevels();

    await typeAtEnd(user, text, " {{s fireb");
    expect(text).not.toHaveAttribute("role");
    expect(text).not.toHaveAttribute("aria-expanded");
    expect(text).toHaveAttribute("aria-autocomplete", "list");
    expect(text).toHaveAttribute("aria-haspopup", "listbox");
    expect(text).toHaveAttribute("aria-controls", screen.getByRole("listbox", { name: "References" }).id);
    expect(within(text.parentElement!).getByRole("status", { name: "Reference menu status" })).toHaveAttribute("aria-live", "polite");
    await screen.findByRole("option", { name: "Fireball (XPHB)" });
    expect(text).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "Fireball (XPHB)" }).id);
    await user.keyboard("{Enter}");
    const withSpell = "The damage increases by 1d6. {@spell Fireball|XPHB}";
    expect(text).toHaveValue(withSpell);
    expect(text.selectionStart).toBe(withSpell.length);

    await user.keyboard(" in a {{i bag");
    // The catalog answers after typing pauses; until then a row holds the results' place.
    expect(screen.getByRole("option", { name: "Searching…" })).toHaveAttribute("aria-disabled", "true");
    await screen.findByRole("option", { name: "Bag of Holding (DMG)" });
    await user.keyboard("{Enter}");
    expect(text).toHaveValue(`${withSpell} in a {@item Bag of Holding|DMG}`);

    act(() => text.blur());
    await user.click(saveButton());
    await waitFor(() => expect(library.writes).toHaveLength(1));
    expect(library.writes[0].body).toEqual(fireballInput({ higherLevels: `${withSpell} in a {@item Bag of Holding|DMG}` }));
    const section = within(within(await card("Fireball")).getByRole("heading", { name: "Using a Higher-Level Spell Slot" }).parentElement!);
    expect(section.getByRole("button", { name: "Fireball" })).toBeVisible();
    expect(await section.findByRole("button", { name: "Bag of Holding" })).toBeVisible();
  });

  test("Escape closes the menu first and reverts the text second", async () => {
    const user = userEvent.setup();
    serveSpells([fireball]);
    renderAsGm(`/compendium?spell=${fireball.id}`);
    await startEditing("Fireball");
    const text = higherLevels();

    await typeAtEnd(user, text, " {{i");
    expect(screen.getByRole("listbox", { name: "References" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "References" })).not.toBeInTheDocument();
    expect(text).toHaveValue("The damage increases by 1d6. {i");
    await user.keyboard("{Escape}");
    expect(text).toHaveValue("The damage increases by 1d6.");
  });
});
