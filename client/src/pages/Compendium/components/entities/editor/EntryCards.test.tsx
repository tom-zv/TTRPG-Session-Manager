import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { ENTITY_LIMITS, validateDnD5eEntityWrite, type EntityWriteIssue, type UpdateEntityRequest } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { installLayoutApis, installMatchMedia } from "src/test/fakes/matchMedia.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { Compendium } from "../../Compendium.js";

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
  abilityScores: { str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
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
  inParty: false,
  featuredNpc: false,
  source: entity.source,
  imported: entity.imported,
  locallyEdited: entity.locallyEdited,
});

const spell = (id: number, name: string, source: string): SpellSummary => ({
  id, name, source, level: 3, school: "evocation", ritual: false, concentration: false, castingTime: "1 action",
  castingUnit: "action", components: { v: true, s: true, m: true }, classes: ["wizard"], damageTypes: ["fire"], saves: ["dexterity"], aliases: [],
});
const SPELLS = [spell(1, "Fireball", "PHB"), spell(2, "Fireball", "XPHB"), spell(3, "Fire Bolt", "XPHB"), spell(4, "Magic Missile", "XPHB")];

// Stored out of display order on purpose: Tail (legendary) sits between the two actions.
const drake = template(21, "Drake", {
  cr: "2",
  traits: [{ name: "Keen Smell", description: "Advantage on smell checks.", sortOrder: 0 }],
  actions: [
    { name: "Bite", description: "Melee attack.", actionType: "action", sortOrder: 0 },
    { name: "Tail", description: "Sweeps.", actionType: "legendary", sortOrder: 1 },
    { name: "Claw", description: "Rakes {@spell Fireball|XPHB} style.", actionType: "action", sortOrder: 2 },
  ],
  legendaryActionCount: 3,
});
const wyrm = template(24, "Wyrm", {
  legendaryActionCount: 3,
  legendaryHeader: ["The wyrm casts {@spell Fireball|XPHB} or swings a {@item Longsword|XPHB}."],
});
const mage = template(22, "Mage", {
  cr: "6",
  actions: [{ name: "Rend", description: "Tears at the target.", actionType: "action", sortOrder: 0 }],
  spellcasting: [{
    name: "Spellcasting",
    ability: "int",
    saveDc: 14,
    spellAttackBonus: 6,
    descriptions: ["The mage casts one of the following spells."],
    levels: [{ level: 1, slots: 4, spells: [{ name: "Magic Missile", source: "XPHB" }] }],
  }],
});
// INT 250 (+120) works out a save DC of 130, past the column's 127.
const titan = template(23, "Titan", { cr: "1", abilityScores: { str: 10, dex: 10, con: 10, int: 250, wis: 10, cha: 10 } });
// INT 250 at CR 1: the stored attack +122 is the automatic one; at CR 25 (PB +8) it would be +128.
const colossus = template(25, "Colossus", {
  cr: "1",
  abilityScores: { str: 10, dex: 10, con: 10, int: 250, wis: 10, cha: 10 },
  spellcasting: [{ name: "Spellcasting", ability: "int", spellAttackBonus: 122, descriptions: ["It casts spells."] }],
});
const CATALOG = [drake, mage, titan, wyrm, colossus];

const gm = testUser({ id: 1, username: "gm", isGm: true });

function serveCatalog({ rejectPut }: { rejectPut?: EntityWriteIssue[] } = {}) {
  const puts: UpdateEntityRequest[] = [];
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: SPELLS })),
    // The view-mode sheet looks up item mentions; none is in this catalog.
    http.post("/api/dnd5e/items/resolve", async ({ request }) => {
      const { refs } = (await request.json()) as { refs: unknown[] };
      return json({ results: refs.map(ref => ({ ref, item: null })) });
    }),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: CATALOG.map(toSummary) })),
    http.post("/api/dnd5e/entities/batch", async ({ request }) => {
      const { entityIds } = (await request.json()) as { entityIds: number[] };
      return json({ entities: CATALOG.filter(entity => entityIds.includes(entity.templateId)) });
    }),
    http.put("/api/dnd5e/entities/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const { data } = (await request.json()) as { data: UpdateEntityRequest };
      puts.push(data);
      if (rejectPut) return json({ message: "Invalid entity data.", details: rejectPut }, 400);
      const base = CATALOG.find(entity => entity.templateId === id)!;
      return json({ entity: { ...base, ...data, templateId: id } });
    }),
  );
  return puts;
}

type User = ReturnType<typeof userEvent.setup>;

// In jsdom the resizable reader cancels a press, so a click does not move focus into a field (as
// in the sheet's other tests). Focus the field, select what it holds, and type over it.
const fill = async (user: User, field: HTMLElement, text: string) => {
  act(() => {
    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.select();
  });
  await user.keyboard(text);
};

const startEditing = async (user: User, entity: DnD5eEntityDetails) => {
  localStorage.setItem("test-user-id", String(gm.id));
  localStorage.setItem("test-user-gm", "true");
  renderWithProviders(<Compendium />, { route: `/compendium?entity=${entity.templateId}`, user: gm });
  const article = await screen.findByRole("article", { name: entity.name });
  await user.click(within(article).getByRole("button", { name: `Actions for ${entity.name}` }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  return within(screen.getByRole("article", { name: entity.name }));
};

const save = async (user: User, puts: UpdateEntityRequest[]) => {
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(puts).toHaveLength(1));
  const data = puts[0];
  // Whatever the cards wrote is a body the server accepts.
  expect(validateDnD5eEntityWrite(data, "update").ok).toBe(true);
  return data;
};

const sectionNamed = (sheet: ReturnType<typeof within>, title: string) =>
  sheet.getByRole("heading", { name: title }).closest("section")!;

// jsdom's zero-size panes make react-resizable-panels cancel clicks; press rows with mousedown.
const pressRow = (name: string) => act(() => void fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(`^${name}`) })));
const toolbar = () => within(screen.getByRole("toolbar", { name: "Editing" }));
/** The mage's one spell list, as its label's button and editor are named. */
const LEVEL_1_LIST = "Edit Spell list 1st level (4 slots), Spellcasting, Spellcasting";
/** Focus leaves the entries for the Armor Class (a live field, or its target on touch). */
const leaveEntries = (sheet: ReturnType<typeof within>) =>
  act(() => (sheet.queryByRole("textbox", { name: "Armor Class" }) ?? sheet.getByRole("button", { name: /^Edit Armor Class/ })).focus());
const chooseOption = async (user: User, entry: string, ...path: string[]) => {
  await user.click(screen.getByRole("button", { name: `Entry options for ${entry}` }));
  for (const label of path) await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: label }));
};

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280, { pointer: "coarse" });
});

describe("traits and actions in edit mode", () => {
  test("a name and a text are separate fields in place, edited and saved where the entry is stored", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    // An untouched field adds no change.
    act(() => sheet.getByRole("textbox", { name: "Name of Bite, Actions" }).focus());
    leaveEntries(sheet);
    expect(toolbar().getByText(/^Editing/)).not.toHaveTextContent("·");

    await fill(user, sheet.getByRole("textbox", { name: "Name of Bite, Actions" }), "Big Bite");
    await fill(user, sheet.getByRole("textbox", { name: "Text of Bite, Actions" }), "Melee attack, 2d6.");
    leaveEntries(sheet);
    expect(sheet.getByRole("textbox", { name: "Text of Big Bite, Actions" })).toHaveValue("Melee attack, 2d6.");
    expect(screen.getByRole("toolbar", { name: "Editing" })).toHaveTextContent("Editing · 2 changes");

    const data = await save(user, puts);
    // A content edit keeps the stored order: Tail (legendary) still sits between the two actions.
    expect(data.actions).toEqual([
      { name: "Big Bite", description: "Melee attack, 2d6.", actionType: "action", sortOrder: 0 },
      drake.actions![1],
      drake.actions![2],
    ]);
    expect(data.traits).toEqual(drake.traits);
  });

  test("a new entry left blank is dropped with its section; one with a name and text is a change Undo and Redo replay", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Reactions" }));
    expect(sheet.getByRole("heading", { name: "Reactions" })).toBeVisible();
    expect(sheet.getByRole("textbox", { name: "Name of new entry, Reactions" })).toHaveFocus();
    leaveEntries(sheet);
    expect(sheet.queryByRole("heading", { name: "Reactions" })).not.toBeInTheDocument();
    expect(toolbar().getByText(/^Editing/)).not.toHaveTextContent("·");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Bonus Actions" }));
    // Tab goes from the name to the text, then to the entry's options.
    await user.keyboard("Nimble Escape{Tab}");
    expect(sheet.getByRole("textbox", { name: "Text of Nimble Escape, Bonus Actions" })).toHaveFocus();
    await user.keyboard("Disengages or hides.{Tab}");
    expect(sheet.getByRole("button", { name: "Entry options for Nimble Escape" })).toHaveFocus();
    leaveEntries(sheet);
    const bonus = () => within(sectionNamed(sheet, "Bonus Actions"));
    expect(bonus().getByRole("textbox", { name: "Name of Nimble Escape, Bonus Actions" })).toHaveValue("Nimble Escape");
    expect(bonus().getByRole("textbox", { name: "Text of Nimble Escape, Bonus Actions" })).toHaveValue("Disengages or hides.");

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(sheet.queryByRole("heading", { name: "Bonus Actions" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(bonus().getByRole("textbox", { name: "Text of Nimble Escape, Bonus Actions" })).toHaveValue("Disengages or hides.");

    const data = await save(user, puts);
    // Sheet order: Actions, then Bonus Actions, then Legendary Actions.
    expect(data.actions!.map(action => [action.name, action.actionType, action.sortOrder])).toEqual([
      ["Bite", "action", 0], ["Claw", "action", 1], ["Nimble Escape", "bonus action", 2], ["Tail", "legendary", 3],
    ]);
  });

  test("08-R1: an invalid added entry remains reachable when another entry or section is requested", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add trait" }));
    const longName = "x".repeat(65);
    await user.keyboard(`${longName}{Enter}`);
    const invalid = sheet.getByRole("textbox", { name: "Name of new entry, Traits" });
    expect(invalid).toHaveAccessibleDescription("Name: At most 64 characters.");

    await user.click(sheet.getByRole("button", { name: "+ Add action" }));
    expect(invalid).toBeVisible();
    await waitFor(() => expect(invalid).toHaveFocus());

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Reactions" }));
    expect(sheet.queryByRole("heading", { name: "Reactions" })).not.toBeInTheDocument();
    expect(invalid).toBeVisible();

    await user.keyboard("{Escape}");
    leaveEntries(sheet);
    expect(sheet.queryByRole("textbox", { name: "Name of new entry, Traits" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Reactions" }));
    await user.keyboard("Retaliate{Tab}");
    expect(sheet.getByRole("textbox", { name: "Text of Retaliate, Reactions" })).toHaveFocus();
    await user.keyboard("Strikes back.");
    leaveEntries(sheet);
    expect(sheet.getByRole("textbox", { name: "Text of Retaliate, Reactions" })).toHaveValue("Strikes back.");
  });

  test("08-R2: an added row keeps its invalid name live after landing, moving and Resume", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add action" }));
    const longName = "x".repeat(65);
    await user.keyboard(`${longName}{Enter}`);
    await fill(user, sheet.getByRole("textbox", { name: "Text of new entry, Actions" }), "Strikes from behind.");
    await user.keyboard("{Tab}");

    let name = await sheet.findByRole("textbox", { name: "Name of unnamed entry, Actions" });
    expect(name).toHaveValue(longName);
    expect(name).toHaveAccessibleDescription("Name: At most 64 characters.");

    await chooseOption(user, "unnamed entry", "Move to section ▸", "Traits");
    name = sheet.getByRole("textbox", { name: "Name of unnamed entry, Traits" });
    expect(name).toHaveValue(longName);
    expect(name).toHaveAccessibleDescription("Name: At most 64 characters.");
    expect(sheet.getByRole("textbox", { name: "Text of unnamed entry, Traits" })).toHaveValue("Strikes from behind.");

    pressRow("Mage");
    expect(await screen.findByRole("article", { name: "Mage" })).toBeVisible();
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));

    const resumed = within(await screen.findByRole("article", { name: "Drake" }));
    name = resumed.getByRole("textbox", { name: "Name of unnamed entry, Traits" });
    expect(name).toHaveValue(longName);
    expect(name).toHaveAccessibleDescription("Name: At most 64 characters.");
    expect(resumed.getByRole("textbox", { name: "Text of unnamed entry, Traits" })).toHaveValue("Strikes from behind.");

    await fill(user, name, "Ambush{Enter}");
    const data = await save(user, puts);
    expect(data.traits).toContainEqual(expect.objectContaining({ name: "Ambush", description: "Strikes from behind." }));
  });

  test("08-R3: an invalid spell list editor keeps its focus and blocks an entry menu until corrected", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: LEVEL_1_LIST }));
    const editor = screen.getByRole("dialog", { name: LEVEL_1_LIST });
    const slots = within(editor).getByRole("textbox", { name: "Slots" });
    await fill(user, slots, "many");
    const options = sheet.getByRole("button", { name: "Entry options for Rend" });

    await user.click(options);
    expect(await within(editor).findByRole("alert")).toHaveTextContent("Slots are a whole number from 0.");
    expect(editor).toContainElement(document.activeElement as HTMLElement);
    expect(screen.queryByRole("menu", { name: "Entry options for Rend" })).not.toBeInTheDocument();

    await fill(user, slots, "3");
    await user.click(options);
    expect(screen.queryByRole("dialog", { name: /^Edit Spell list/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Entry options for Rend" })).toBeVisible();
  });

  test("08-R4: deleting a pending entry clears its unapplied fields and a later edit can save", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    const addTrait = sheet.getByRole("button", { name: "+ Add trait" });
    await user.click(addTrait);
    await user.keyboard(`${"x".repeat(ENTITY_LIMITS.entryName + 1)}{Enter}{Tab}`);
    const name = sheet.getByRole("textbox", { name: "Name of new entry, Traits" });
    const text = sheet.getByRole("textbox", { name: "Text of new entry, Traits" });
    expect(text).toHaveFocus();
    await user.paste("x".repeat(ENTITY_LIMITS.descriptionBytes + 1));
    await user.tab();
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(text).toHaveAttribute("aria-invalid", "true");
    expect(toolbar().getByText("2 fields hold unapplied text")).toBeVisible();

    await chooseOption(user, "new entry", "Delete");
    expect(name).not.toBeInTheDocument();
    expect(text).not.toBeInTheDocument();
    expect(addTrait).toHaveFocus();
    expect(toolbar().queryByText(/^[12] fields? holds? unapplied text$/)).not.toBeInTheDocument();
    expect(toolbar().getByRole("button", { name: "Undo" })).toBeDisabled();

    await fill(user, sheet.getByRole("textbox", { name: "Name of Bite, Actions" }), "Snap{Enter}");
    const data = await save(user, puts);
    expect(data.traits).toEqual(drake.traits);
    expect(data.actions?.[0]).toMatchObject({ name: "Snap" });
  });

  test("08-R5: one mouse click on entry options settles a valid spell list editor on activation", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: LEVEL_1_LIST }));
    const editor = screen.getByRole("dialog", { name: LEVEL_1_LIST });
    const slots = within(editor).getByRole("textbox", { name: "Slots" });
    await fill(user, slots, "3");
    const options = sheet.getByRole("button", { name: "Entry options for Rend" });

    // The resizable pane cancels the pointer sequence in jsdom. Apply the browser's
    // default focus change manually if the mouse press is not canceled by the trigger.
    if (fireEvent.mouseDown(options, { button: 0 })) act(() => options.focus());
    expect(slots).toHaveFocus();
    expect(editor).toBeVisible();
    fireEvent.mouseUp(options, { button: 0 });
    fireEvent.click(options);
    expect(editor).not.toBeInTheDocument();
    const menu = sheet.getByRole("menu", { name: "Entry options for Rend" });
    expect(within(menu).getByRole("menuitem", { name: "Move up" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(options).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("menu", { name: "Entry options for Rend" })).toBeVisible();
    await user.keyboard("{Escape}");

    const data = await save(user, puts);
    expect(data.spellcasting?.[0].levels?.[0]).toMatchObject({ level: 1, slots: 3 });
  });

  test("on touch an added entry's name is typed in place, then becomes its edit button like every other name", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add trait" }));
    expect(sheet.getByRole("textbox", { name: "Name of new entry, Traits" })).toHaveFocus();
    await user.keyboard("Amphibious");
    await fill(user, sheet.getByRole("textbox", { name: "Text of new entry, Traits" }), "Breathes air and water.");
    leaveEntries(sheet);
    expect(sheet.getByRole("button", { name: "Edit Name of Amphibious, Traits" })).toBeVisible();
    expect(sheet.queryByRole("textbox", { name: "Name of Amphibious, Traits" })).not.toBeInTheDocument();

    const data = await save(user, puts);
    expect(data.traits).toEqual([
      drake.traits![0],
      { name: "Amphibious", description: "Breathes air and water.", sortOrder: 1 },
    ]);
  });

  test("Delete in the entry options is one change: focus goes to the section's add button, and Undo restores the entry", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await chooseOption(user, "Bite", "Delete");
    expect(sheet.queryByRole("button", { name: "Edit Name of Bite, Actions" })).not.toBeInTheDocument();
    expect(screen.getByText("Deleted Bite. Undo restores it.")).toHaveAttribute("role", "status");
    expect(sheet.getByRole("button", { name: "+ Add action" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(sheet.getByRole("button", { name: "Edit Name of Bite, Actions" })).toBeVisible();

    // Back to the loaded entity: a later edit saves Bite where it was.
    await user.click(sheet.getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("13{Enter}");
    const data = await save(user, puts);
    expect(data.actions).toEqual(drake.actions);
  });

  test("Move up, Move down and Move to section in the entry options move the entry, and focus stays on its options", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);
    const names = (title: string) =>
      within(sectionNamed(sheet, title)).getAllByRole("button", { name: new RegExp(`^Edit Name of .*, ${title}$`) }).map(button => button.textContent);

    await user.click(screen.getByRole("button", { name: "Entry options for Claw" }));
    const menu = within(screen.getByRole("menu", { name: "Entry options for Claw" }));
    // The last entry cannot move down; the item is still listed.
    expect(menu.getByRole("menuitem", { name: "Move down" })).toHaveAttribute("aria-disabled", "true");
    await user.click(menu.getByRole("menuitem", { name: "Move down" }));
    expect(screen.getByRole("menu", { name: "Entry options for Claw" })).toBeVisible();
    await user.click(menu.getByRole("menuitem", { name: "Move up" }));
    expect(names("Actions")).toEqual(["Claw", "Bite"]);
    expect(sheet.getByRole("button", { name: "Entry options for Claw" })).toHaveFocus();

    await chooseOption(user, "Claw", "Move down");
    expect(names("Actions")).toEqual(["Bite", "Claw"]);
    expect(sheet.getByRole("button", { name: "Entry options for Claw" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Entry options for Bite" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Move to section ▸" }));
    const sections = within(screen.getByRole("menu", { name: "Move to section" }));
    expect(sections.getByRole("menuitem", { name: "Actions" })).toHaveAttribute("aria-disabled", "true");
    await user.click(sections.getByRole("menuitem", { name: "Traits" }));
    expect(names("Traits")).toEqual(["Keen Smell", "Bite"]);
    expect(within(sectionNamed(sheet, "Traits")).getByRole("button", { name: "Entry options for Bite" })).toHaveFocus();

    const data = await save(user, puts);
    expect(data.traits!.map(trait => trait.name)).toEqual(["Keen Smell", "Bite"]);
    expect(data.traits![1]).not.toHaveProperty("actionType");
    expect(data.actions!.map(action => [action.name, action.actionType])).toEqual([["Claw", "action"], ["Tail", "legendary"]]);
  });

  test("on a focused entry grip, Alt+Up and Alt+Down move the entry with focus kept on its grip, and Delete removes it", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);
    const names = () =>
      within(sectionNamed(sheet, "Actions")).getAllByRole("button", { name: /^Edit Name of .*, Actions$/ }).map(button => button.textContent);
    const grip = (entry: string) => sheet.getByRole("button", { name: `Entry options for ${entry}` });

    act(() => grip("Claw").focus());
    expect(grip("Claw")).toHaveAccessibleDescription(/Alt\+Up or Alt\+Down moves it, Delete removes it/);
    // The last entry cannot move down: nothing changes and no menu opens.
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(names()).toEqual(["Bite", "Claw"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(names()).toEqual(["Claw", "Bite"]);
    expect(grip("Claw")).toHaveFocus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(names()).toEqual(["Bite", "Claw"]);
    expect(grip("Claw")).toHaveFocus();

    await user.keyboard("{Delete}");
    expect(sheet.queryByRole("button", { name: "Edit Name of Claw, Actions" })).not.toBeInTheDocument();
    expect(screen.getByText("Deleted Claw. Undo restores it.")).toHaveAttribute("role", "status");
    expect(sheet.getByRole("button", { name: "+ Add action" })).toHaveFocus();

    const data = await save(user, puts);
    expect(data.actions!.map(action => action.name)).toEqual(["Bite", "Tail"]);
  });

  test("typing { in a trait's text picks a spell reference and saves its canonical tag", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    const text = sheet.getByRole("textbox", { name: "Text of Keen Smell, Traits" }) as HTMLTextAreaElement;
    act(() => {
      text.focus();
      text.setSelectionRange(text.value.length, text.value.length);
    });
    await user.keyboard(" Smells {{s fire b");
    expect(await screen.findByRole("option", { name: "Fire Bolt (XPHB)" })).toBeVisible();
    await user.keyboard("{Enter}");
    expect(text).toHaveValue("Advantage on smell checks. Smells {@spell Fire Bolt|XPHB}");
    expect(text).toHaveFocus();

    const data = await save(user, puts);
    expect(data.traits![0].description).toBe("Advantage on smell checks. Smells {@spell Fire Bolt|XPHB}");
  });

  test.each([
    ["live", "fine"],
    ["targets", "coarse"],
  ] as const)("a server issue on an action's text focuses that text area (%s)", async (_presentation, pointer) => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const puts = serveCatalog({ rejectPut: [{ path: "actions.2.description", message: "The server rejects this text." }] });
    const sheet = await startEditing(user, drake);

    if (pointer === "coarse") {
      await user.click(sheet.getByRole("button", { name: "Edit Armor Class, 12" }));
      await user.keyboard("13{Enter}");
    } else {
      await fill(user, sheet.getByRole("textbox", { name: "Armor Class" }), "13{Enter}");
    }
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    // Stored at index 2, Claw is the second action on the sheet.
    expect(await sheet.findByRole("textbox", { name: "Text of Claw, Actions" })).toHaveFocus();
    const issues = within(screen.getByRole("list", { name: "Issues" }));
    expect(issues.getByRole("button", { name: "Actions: Claw: The server rejects this text." })).toBeVisible();
  });

  test("unapplied name and text survive selecting another entity and Resume, and the invalid name holds Save", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await fill(user, sheet.getByRole("textbox", { name: "Name of Bite, Actions" }), "{Backspace}");
    await fill(user, sheet.getByRole("textbox", { name: "Text of Bite, Actions" }), "Chomps.");
    expect(sheet.getByRole("textbox", { name: "Name of Bite, Actions" })).toHaveAccessibleDescription("Name: This can't be empty.");
    pressRow("Mage");
    expect(await screen.findByRole("article", { name: "Mage" })).toBeVisible();
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));

    const resumed = within(await screen.findByRole("article", { name: "Drake" }));
    const name = resumed.getByRole("textbox", { name: "Name of Bite, Actions" });
    expect(name).toHaveValue("");
    expect(name).toHaveAccessibleDescription("Name: This can't be empty.");
    expect(resumed.getByRole("textbox", { name: "Text of Bite, Actions" })).toHaveValue("Chomps.");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await fill(user, name, "Bite{Enter}");
    const data = await save(user, puts);
    expect(data.actions![0]).toMatchObject({ name: "Bite", description: "Chomps." });
  });

  test("a spell mention in an action is plain text while editing: the text area holds its tag as written", async () => {
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, drake);

    expect(sheet.getByRole("textbox", { name: "Text of Claw, Actions" })).toHaveValue("Rakes {@spell Fireball|XPHB} style.");
    expect(sheet.queryByRole("button", { name: "Fireball" })).not.toBeInTheDocument();
  });
});

describe("spellcasting blocks and the legendary section in edit mode", () => {
  test("a block's name, text and ability are edited in place; a blank line in the text starts a paragraph", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await fill(user, sheet.getByRole("textbox", { name: "Name of Spellcasting, Spellcasting" }), "Arcane Spellcasting{Enter}");
    await fill(user, sheet.getByRole("textbox", { name: "Text of Arcane Spellcasting, Spellcasting" }), "The mage casts spells.{Enter}{Enter}It prepares them each day.");
    leaveEntries(sheet);
    expect(sheet.getByRole("textbox", { name: "Paragraph 2 of Arcane Spellcasting, Spellcasting" })).toHaveValue("It prepares them each day.");
    await fill(user, sheet.getByRole("combobox", { name: "Spellcasting ability of Arcane Spellcasting, Spellcasting" }), "Wisdom{Enter}");
    // WIS 10 (+0) and PB +3: the automatic values follow the new ability.
    expect(sheet.getByRole("combobox", { name: "Save DC of Arcane Spellcasting, Spellcasting, automatic" })).toHaveValue("11");
    expect(sheet.getByRole("combobox", { name: "Spell attack of Arcane Spellcasting, Spellcasting, automatic" })).toHaveValue("+3");

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({
      name: "Arcane Spellcasting",
      ability: "wis",
      saveDc: 11,
      spellAttackBonus: 3,
      descriptions: ["The mage casts spells.", "It prepares them each day."],
    });
  });

  test("a typed save DC stays through an ability score change; its list offers Automatic, which follows again", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await fill(user, sheet.getByRole("combobox", { name: "Save DC of Spellcasting, Spellcasting, automatic" }), "16{Enter}");
    const dc = sheet.getByRole("combobox", { name: "Save DC of Spellcasting, Spellcasting" });
    await fill(user, sheet.getByRole("textbox", { name: "Intelligence score" }), "18{Enter}");
    expect(dc).toHaveValue("16");
    expect(sheet.getByRole("combobox", { name: "Spell attack of Spellcasting, Spellcasting, automatic" })).toHaveValue("+7");

    act(() => dc.focus());
    await user.keyboard("{ArrowDown}");
    const automatic = within(screen.getByRole("listbox", { name: "Save DC of Spellcasting, Spellcasting" })).getByRole("option");
    expect(automatic).toHaveTextContent("Automatic (15)");
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("combobox", { name: "Save DC of Spellcasting, Spellcasting, automatic" })).toHaveValue("15");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(sheet.getByRole("combobox", { name: "Save DC of Spellcasting, Spellcasting" })).toHaveValue("16");
    await user.click(screen.getByRole("button", { name: "Redo" }));

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({ saveDc: 15, spellAttackBonus: 7 });
  });

  test("05-R4: on touch the ability line opens one editor; automatic values follow Undo and Redo, a typed DC stays", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);
    const metaName = "Edit Spellcasting ability, save DC and spell attack of Spellcasting, Spellcasting";
    const meta = () => sheet.getByRole("button", { name: metaName });
    expect(meta()).toHaveTextContent("Spellcasting Ability Intelligence; Save DC 14; Spell Attack +6");

    await user.click(sheet.getByRole("button", { name: "Edit Intelligence score, 16" }));
    await user.keyboard("18{Enter}");
    expect(meta()).toHaveTextContent("Save DC 15; Spell Attack +7");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(meta()).toHaveTextContent("Save DC 14; Spell Attack +6");
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(meta()).toHaveTextContent("Save DC 15; Spell Attack +7");

    await user.click(meta());
    const editor = within(screen.getByRole("dialog", { name: metaName }));
    const dc = within(editor.getByRole("group", { name: "Save DC" }));
    expect(dc.getByRole("checkbox", { name: "Automatic" })).toBeChecked();
    expect(within(editor.getByRole("group", { name: "Spell attack" })).getByRole("checkbox", { name: "Automatic" })).toBeChecked();
    await user.click(dc.getByRole("checkbox", { name: "Automatic" }));
    await fill(user, dc.getByRole("textbox", { name: "Save DC" }), "16");
    await user.click(editor.getByRole("button", { name: "Done" }));

    // INT 20 works out DC 16 too, but the typed DC stays typed, and stays put at INT 22.
    await user.click(sheet.getByRole("button", { name: "Edit Intelligence score, 18" }));
    await user.keyboard("20{Enter}");
    expect(meta()).toHaveTextContent("Save DC 16; Spell Attack +8");
    await user.click(meta());
    const reopened = within(screen.getByRole("dialog", { name: metaName }));
    expect(within(reopened.getByRole("group", { name: "Save DC" })).getByRole("checkbox", { name: "Automatic" })).not.toBeChecked();
    await user.click(reopened.getByRole("button", { name: "Cancel" }));
    await user.click(sheet.getByRole("button", { name: "Edit Intelligence score, 20" }));
    await user.keyboard("22{Enter}");
    expect(meta()).toHaveTextContent("Save DC 16; Spell Attack +9");

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({ saveDc: 16, spellAttackBonus: 9 });
  });

  test("+ spell adds the printing picked from the index; two printings have their own remove buttons; removing one is one change", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);
    const where = "the 1st level (4 slots) list of Spellcasting, Spellcasting";
    const search = sheet.getByRole("combobox", { name: `Add a spell to ${where}` });

    await fill(user, search, "fireb");
    const options = within(await screen.findByRole("listbox", { name: `Add a spell to ${where}` })).getAllByRole("option");
    expect(options.map(option => option.textContent)).toEqual(["Fireball (PHB)", "Fireball (XPHB)"]);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
    await fill(user, search, "fireb");
    await screen.findByRole("listbox", { name: `Add a spell to ${where}` });
    await user.keyboard("{ArrowDown}{Enter}");

    await user.click(sheet.getByRole("button", { name: `Remove Fireball (PHB) from ${where}` }));
    await user.click(sheet.getByRole("button", { name: `Remove Magic Missile from ${where}` }));
    // The next spell takes the removed one's place, and its button keeps focus.
    expect(sheet.getByRole("button", { name: `Remove Fireball from ${where}` })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(sheet.getByRole("button", { name: `Remove Magic Missile from ${where}` })).toBeVisible();

    const data = await save(user, puts);
    expect(data.spellcasting![0].levels![0].spells).toEqual([{ name: "Magic Missile", source: "XPHB" }, { name: "Fireball", source: "XPHB" }]);
  });

  test("+ Spell list adds a line and opens its editor; a line's kind, uses, level and pact magic save; deleting a line is one change", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: "+ Spell list" }));
    // The mage has 1st level slots, so the new line is the next free level.
    const added = screen.getByRole("dialog", { name: "Edit Spell list 2nd level, Spellcasting, Spellcasting" });
    const kind = within(added).getByRole("combobox", { name: "Spell list" });
    expect(kind).toHaveFocus();
    await user.selectOptions(kind, "Per day");
    await fill(user, within(added).getByRole("textbox", { name: "Uses" }), "2");
    await user.click(within(added).getByRole("checkbox", { name: "Each spell" }));
    await user.click(within(added).getByRole("button", { name: "Done" }));
    await fill(user, sheet.getByRole("combobox", { name: "Add a spell to the 2/day each list of Spellcasting, Spellcasting" }), "Fire Bolt{Enter}");

    await user.click(sheet.getByRole("button", { name: LEVEL_1_LIST }));
    const level = within(screen.getByRole("dialog", { name: LEVEL_1_LIST }));
    await user.selectOptions(level.getByRole("combobox", { name: "Level" }), "3rd level");
    await fill(user, level.getByRole("textbox", { name: "Pact magic from level" }), "1");
    await user.click(level.getByRole("button", { name: "Done" }));
    const pact = "the 1st–3rd level (4 slots) list of Spellcasting, Spellcasting";
    expect(sheet.getByRole("button", { name: `Remove Magic Missile from ${pact}` })).toBeVisible();

    await user.click(sheet.getByRole("button", { name: "Delete the 2/day each list of Spellcasting, Spellcasting" }));
    expect(sheet.queryByRole("button", { name: /^Edit Spell list 2\/day each/ })).not.toBeInTheDocument();
    expect(sheet.getByRole("button", { name: "+ Spell list" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Undo" }));

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({
      levels: [{ level: 3, lowerLevel: 1, slots: 4 }],
      frequencyGroups: [{ frequency: "daily", count: 2, each: true, spells: [{ name: "Fire Bolt", source: "XPHB" }] }],
    });
  });

  test("a block's options hide its spell list and move it to another section, after that section's \"+ Add\", focus staying on its options", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await chooseOption(user, "Spellcasting", "Hide spell list");
    expect(screen.getByRole("button", { name: "Entry options for Spellcasting" })).toHaveFocus();
    await chooseOption(user, "Spellcasting", "Move to section ▸", "Actions");
    expect(sheet.queryByRole("heading", { name: "Spellcasting" })).not.toBeInTheDocument();
    const actions = within(sectionNamed(sheet, "Actions"));
    expect(actions.getByRole("button", { name: "Entry options for Spellcasting" })).toHaveFocus();
    // "+ Add action" adds before the block, so it is listed after the actions and before the block.
    const addAction = actions.getByRole("button", { name: "+ Add action" });
    expect(actions.getByRole("button", { name: "Entry options for Rend" }).compareDocumentPosition(addAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(addAction.compareDocumentPosition(actions.getByRole("button", { name: "Entry options for Spellcasting" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({ displayAs: "action", hideSpellList: true });
  });

  test("links inside edited text are plain text", async () => {
    const user = userEvent.setup();
    serveCatalog();
    localStorage.setItem("test-user-id", String(gm.id));
    localStorage.setItem("test-user-gm", "true");
    renderWithProviders(<Compendium />, { route: `/compendium?entity=${mage.templateId}`, user: gm });
    const view = within(await screen.findByRole("article", { name: "Mage" }));
    // In view mode the spell list links to the spell.
    expect(await view.findByRole("button", { name: "Magic Missile" })).toBeVisible();
    await user.click(view.getByRole("button", { name: "Actions for Mage" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    const sheet = within(screen.getByRole("article", { name: "Mage" }));
    expect(sheet.queryByRole("button", { name: "Magic Missile" })).not.toBeInTheDocument();
    await user.click(sheet.getByText("Magic Missile"));
    expect(screen.queryByRole("dialog", { name: "Magic Missile" })).not.toBeInTheDocument();
  });

  test.each([
    ["live", "fine"],
    ["targets", "coarse"],
  ] as const)("a server issue on a spell list's slots opens that list's editor at its slots (%s)", async (_presentation, pointer) => {
    installMatchMedia(1280, { pointer });
    const user = userEvent.setup();
    const puts = serveCatalog({ rejectPut: [{ path: "spellcasting.0.levels.0.slots", message: "The server rejects these slots." }] });
    const sheet = await startEditing(user, mage);

    if (pointer === "coarse") {
      await user.click(sheet.getByRole("button", { name: "Edit Armor Class, 12" }));
      await user.keyboard("13{Enter}");
    } else {
      await fill(user, sheet.getByRole("textbox", { name: "Armor Class" }), "13{Enter}");
    }
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    const editor = within(await screen.findByRole("dialog", { name: LEVEL_1_LIST }));
    await waitFor(() => expect(editor.getByRole("textbox", { name: "Slots" })).toHaveFocus());
  });

  test("a server issue on a save DC focuses its field on a live sheet", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog({ rejectPut: [{ path: "spellcasting.0.saveDc", message: "The server rejects this DC." }] });
    const sheet = await startEditing(user, mage);

    await fill(user, sheet.getByRole("textbox", { name: "Armor Class" }), "13{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    await waitFor(() => expect(sheet.getByRole("combobox", { name: "Save DC of Spellcasting, Spellcasting, automatic" })).toHaveFocus());
  });

  test("the legendary count is edited inside the legendary section", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    const legendary = within(sectionNamed(sheet, "Legendary Actions"));
    await user.click(legendary.getByRole("button", { name: "Edit Legendary actions per round, 3" }));
    await user.keyboard("2{Enter}");
    await user.click(legendary.getByRole("button", { name: "+ Legendary introduction" }));
    await fill(user, screen.getByRole("textbox", { name: "Legendary introduction" }), "The drake can take 2 legendary actions.");
    await user.click(screen.getByRole("button", { name: "Done" }));

    const data = await save(user, puts);
    expect(data).toMatchObject({ legendaryActionCount: 2, legendaryHeader: ["The drake can take 2 legendary actions."] });
  });

  test("05-R3: a spell name over 64 characters is refused with a message and adds nothing; 64 saves", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);
    const search = sheet.getByRole("combobox", { name: "Add a spell to the 1st level (4 slots) list of Spellcasting, Spellcasting" });

    await fill(user, search, `${"x".repeat(65)}{Enter}`);
    expect(sheet.getByRole("alert")).toHaveTextContent("Spell name: At most 64 characters.");
    expect(sheet.queryByRole("button", { name: /^Remove x+ from/ })).not.toBeInTheDocument();

    await fill(user, search, `${"y".repeat(64)}{Enter}`);
    const data = await save(user, puts);
    expect(data.spellcasting![0].levels![0].spells).toEqual([{ name: "Magic Missile", source: "XPHB" }, { name: "y".repeat(64) }]);
  });

  test("05-R3: an ability whose automatic save DC passes 127 is refused, and with a typed DC it applies", async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, titan);

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Spellcasting" }));
    const name = sheet.getByRole("textbox", { name: "Name of Spellcasting, Spellcasting" });
    expect(name).toHaveFocus();
    await fill(user, name, "Innate Spellcasting{Enter}");
    const ability = sheet.getByRole("combobox", { name: "Spellcasting ability of Innate Spellcasting, Spellcasting" });
    // A name's first letters choose it; the field's list offers the six by name.
    await fill(user, ability, "Intel{Enter}");
    expect(sheet.getByRole("alert")).toHaveTextContent("The automatic save DC of Innate Spellcasting would be 130");
    expect(ability).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Save" })).toBeDisabled();

    await fill(user, sheet.getByRole("combobox", { name: "Save DC of Innate Spellcasting, Spellcasting, automatic" }), "20{Enter}");
    await fill(user, ability, "Intelligence{Enter}");
    expect(ability).toHaveValue("Intelligence");
    const data = await save(user, puts);
    expect(data.spellcasting).toEqual([expect.objectContaining({ name: "Innate Spellcasting", ability: "int", saveDc: 20, spellAttackBonus: 122 })]);
  });

  test("05-R5: the legendary introduction shows reference text, not tags, and its editor shows the tags", async () => {
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, wyrm);

    const intro = sheet.getByRole("button", { name: "Edit Legendary introduction" });
    expect(intro).toHaveTextContent("The wyrm casts Fireball or swings a Longsword.");
    expect(intro).not.toHaveTextContent("{@");
    expect(within(intro).queryByRole("button")).not.toBeInTheDocument();
    await user.click(intro);
    expect(screen.getByRole("textbox", { name: "Legendary introduction" }))
      .toHaveValue("The wyrm casts {@spell Fireball|XPHB} or swings a {@item Longsword|XPHB}.");
  });

  test("05-R6: deleting the last spellcasting block in the narrow reader puts focus on “+ Add section”", async () => {
    installMatchMedia(720);
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, mage);

    await chooseOption(user, "Spellcasting", "Delete");
    expect(sheet.queryByRole("heading", { name: "Spellcasting" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Mage" })).toBeVisible();
    expect(sheet.getByRole("button", { name: "+ Add section" })).toHaveFocus();
  });

  test("05-R3: a CR change that would push an automatic spell attack past +127 is refused", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, colossus);

    await user.click(sheet.getByRole("button", { name: "Edit Challenge Rating, 1" }));
    await user.keyboard("{Backspace}25{Enter}");
    expect(sheet.getByRole("alert")).toHaveTextContent("The automatic spell attack of Spellcasting would be 128");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(puts).toHaveLength(0);
  });
});
