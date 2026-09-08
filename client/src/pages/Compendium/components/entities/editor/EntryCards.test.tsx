import { act, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { validateDnD5eEntityWrite, type UpdateEntityRequest } from "shared/domain/encounters/dnd5e/entityValidation.js";
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

function serveCatalog() {
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

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280, { pointer: "coarse" });
});

describe("entry cards in edit mode", () => {
  test("“+ Add section” → Bonus Actions creates an entry under Bonus Actions", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Bonus Actions" }));
    const card = sheet.getByRole("form", { name: "Edit new entry, Bonus Actions" });
    expect(within(card).getByRole("textbox", { name: "Name" })).toHaveFocus();
    await user.keyboard("Nimble Escape");
    await fill(user, within(card).getByRole("textbox", { name: "Text" }), "Disengages or hides.");
    await user.click(within(card).getByRole("button", { name: "Done" }));

    const bonus = within(sectionNamed(sheet, "Bonus Actions"));
    expect(bonus.getByRole("button", { name: "Edit Nimble Escape, Bonus Actions" })).toHaveFocus();
    expect(bonus.getByText("Disengages or hides.")).toBeVisible();

    const data = await save(user, puts);
    expect(data.actions).toContainEqual(expect.objectContaining({
      name: "Nimble Escape", description: "Disengages or hides.", actionType: "bonus action",
    }));
  });

  test("a new entry abandoned empty is dropped, and its section does not appear", async () => {
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Reactions" }));
    expect(sheet.getByRole("heading", { name: "Reactions" })).toBeVisible();
    await user.click(within(sheet.getByRole("form", { name: "Edit new entry, Reactions" })).getByRole("button", { name: "Done" }));

    expect(sheet.queryByRole("heading", { name: "Reactions" })).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Editing" })).toHaveTextContent(/^Editing(?! ·)/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("moving an action up changes its order in the saved body", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "Edit Claw, Actions" }));
    const card = sheet.getByRole("form", { name: "Edit Claw, Actions" });
    expect(within(card).getByRole("button", { name: "Move down" })).toBeDisabled();
    await user.click(within(card).getByRole("button", { name: "Move up" }));

    // The card follows the entry to its new place and keeps focus on the control.
    const moved = sheet.getByRole("form", { name: "Edit Claw, Actions" });
    expect(within(moved).getByRole("button", { name: "Move up" })).toBeDisabled();
    expect(within(moved).getByRole("button", { name: "Move down" })).toHaveFocus();
    await user.click(within(moved).getByRole("button", { name: "Done" }));

    const names = within(sectionNamed(sheet, "Actions")).getAllByRole("button", { name: /^Edit .*, Actions$/ });
    expect(names.map(button => button.textContent)).toEqual(["Claw.", "Bite."]);

    const data = await save(user, puts);
    const byOrder = [...data.actions!].sort((left, right) => left.sortOrder! - right.sortOrder!);
    expect(byOrder.filter(action => action.actionType === "action").map(action => action.name)).toEqual(["Claw", "Bite"]);
    // The array itself is in sheet order too, and the legendary action is untouched.
    expect(data.actions!.map(action => action.name)).toEqual(["Claw", "Bite", "Tail"]);
    expect(data.actions!.find(action => action.name === "Tail")).toMatchObject({ actionType: "legendary", description: "Sweeps." });
  });

  test("moving an action to Traits makes it a trait", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "Edit Bite, Actions" }));
    const card = sheet.getByRole("form", { name: "Edit Bite, Actions" });
    await user.selectOptions(within(card).getByRole("combobox", { name: "Section" }), "Traits");
    await user.click(within(card).getByRole("button", { name: "Done" }));

    expect(within(sectionNamed(sheet, "Traits")).getByRole("button", { name: "Edit Bite, Traits" })).toHaveFocus();
    const data = await save(user, puts);
    expect(data.traits!.map(trait => trait.name)).toEqual(["Keen Smell", "Bite"]);
    expect(data.actions!.map(action => action.name)).toEqual(["Claw", "Tail"]);
  });

  test("delete then Undo restores the entry", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "Edit Bite, Actions" }));
    await user.click(within(sheet.getByRole("form", { name: "Edit Bite, Actions" })).getByRole("button", { name: "Delete" }));
    expect(sheet.queryByRole("button", { name: "Edit Bite, Actions" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Deleted Bite. Undo restores it.");
    expect(sheet.getByRole("button", { name: "+ Add action" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(sheet.getByRole("button", { name: "Edit Bite, Actions" })).toBeVisible();

    // Back to the loaded entity: a later edit saves Bite where it was.
    await user.click(sheet.getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("13{Enter}");
    const data = await save(user, puts);
    expect(data.actions).toEqual(drake.actions);
  });

  test("a spell picked from the autocomplete saves with its source", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    const card = within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" }));
    await fill(user, card.getByRole("combobox", { name: "Add a spell to spell list 1" }), "fireb");
    // Two printings match; the second is the 2024 one.
    const options = within(await card.findByRole("listbox", { name: "Add a spell to spell list 1" })).getAllByRole("option");
    expect(options.map(option => option.textContent)).toEqual(["Fireball (PHB)", "Fireball (XPHB)"]);
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(card.getByRole("list", { name: "Spells in spell list 1" })).toHaveTextContent("Fireball (XPHB)");
    await fill(user, card.getByRole("textbox", { name: "Note for Fireball" }), "level 5 version");
    await user.click(card.getByRole("button", { name: "Done" }));

    const data = await save(user, puts);
    expect(data.spellcasting![0].levels![0].spells).toEqual([
      { name: "Magic Missile", source: "XPHB" },
      { name: "Fireball", source: "XPHB", note: "level 5 version" },
    ]);
  });

  test("the spellcasting card saves pact magic levels and a typed save DC", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    const card = within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" }));
    // Mage: INT 16 (+3) and CR 6 (PB +3) make DC 14 and +6, so both start automatic.
    expect(within(card.getByRole("group", { name: "Spell attack" })).getByRole("textbox", { name: "Spell attack" })).toHaveValue("+6");
    const level = within(card.getByRole("group", { name: "Spell list 1" }));
    await fill(user, level.getByRole("textbox", { name: "Level" }), "3");
    await fill(user, level.getByRole("textbox", { name: "Pact magic from level" }), "1");
    const dc = within(card.getByRole("group", { name: "Save DC" }));
    expect(dc.getByRole("textbox", { name: "Save DC" })).toHaveValue("14");
    await user.click(dc.getByRole("checkbox", { name: "Automatic" }));
    await fill(user, dc.getByRole("textbox", { name: "Save DC" }), "15");
    await user.click(card.getByRole("button", { name: "Done" }));

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({ saveDc: 15, spellAttackBonus: 6, levels: [{ level: 3, lowerLevel: 1, slots: 4 }] });
  });

  test("links inside edited text are plain text, and a click there opens the card", async () => {
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
    expect(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" })).toBeVisible();
  });

  test("a spell mention in an action is plain text while editing, and the card shows its tag as written", async () => {
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, drake);

    expect(sheet.getByText(/Rakes Fireball style\./)).toBeVisible();
    expect(sheet.queryByRole("button", { name: "Fireball" })).not.toBeInTheDocument();
    await user.click(sheet.getByText(/Rakes Fireball style\./));
    expect(within(sheet.getByRole("form", { name: "Edit Claw, Actions" })).getByRole("textbox", { name: "Text" }))
      .toHaveValue("Rakes {@spell Fireball|XPHB} style.");
  });

  test("Insert spell puts a canonical tag with the picked source at the cursor", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "Edit Bite, Actions" }));
    const card = within(sheet.getByRole("form", { name: "Edit Bite, Actions" }));
    const text = card.getByRole("textbox", { name: "Text" }) as HTMLTextAreaElement;
    text.setSelectionRange(6, 6);
    await user.click(card.getByRole("button", { name: "Insert spell" }));
    await user.keyboard("fire b");
    expect(await card.findByRole("option", { name: "Fire Bolt (XPHB)" })).toBeVisible();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(text).toHaveValue("Melee {@spell Fire Bolt|XPHB}attack.");
    await user.click(card.getByRole("button", { name: "Done" }));

    const data = await save(user, puts);
    expect(data.actions!.find(action => action.name === "Bite")?.description).toBe("Melee {@spell Fire Bolt|XPHB}attack.");
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

  test("05-R1: an entry clicked while another card moves sections opens that entry, and its edit saves to it", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    // Bite to Bonus Actions, then straight to Claw: the move renumbers the actions.
    await user.click(sheet.getByRole("button", { name: "Edit Bite, Actions" }));
    await user.selectOptions(within(sheet.getByRole("form", { name: "Edit Bite, Actions" })).getByRole("combobox", { name: "Section" }), "Bonus Actions");
    await user.click(sheet.getByRole("button", { name: "Edit Claw, Actions" }));
    const claw = within(sheet.getByRole("form", { name: "Edit Claw, Actions" }));
    expect(claw.getByRole("textbox", { name: "Name" })).toHaveValue("Claw");
    await fill(user, claw.getByRole("textbox", { name: "Text" }), "Rakes twice.");
    await user.click(claw.getByRole("button", { name: "Done" }));

    // Then Bite to Traits, and Tail opens.
    await user.click(sheet.getByRole("button", { name: "Edit Bite, Bonus Actions" }));
    await user.selectOptions(within(sheet.getByRole("form", { name: "Edit Bite, Bonus Actions" })).getByRole("combobox", { name: "Section" }), "Traits");
    await user.click(sheet.getByRole("button", { name: "Edit Tail, Legendary Actions" }));
    expect(within(sheet.getByRole("form", { name: "Edit Tail, Legendary Actions" })).getByRole("textbox", { name: "Name" })).toHaveValue("Tail");

    // An invalid card still stays open, and the clicked entry does not open.
    const tail = within(sheet.getByRole("form", { name: "Edit Tail, Legendary Actions" }));
    await fill(user, tail.getByRole("textbox", { name: "Name" }), "{Backspace}");
    await user.click(sheet.getByRole("button", { name: "Edit Claw, Actions" }));
    expect(tail.getByRole("alert")).toHaveTextContent("Name: This can't be empty.");
    expect(sheet.queryByRole("form", { name: "Edit Claw, Actions" })).not.toBeInTheDocument();
    await user.click(tail.getByRole("button", { name: "Cancel" }));

    const data = await save(user, puts);
    expect(data.traits!.map(trait => trait.name)).toEqual(["Keen Smell", "Bite"]);
    expect(data.actions!.map(action => [action.name, action.actionType, action.description])).toEqual([
      ["Claw", "action", "Rakes twice."],
      ["Tail", "legendary", "Sweeps."],
    ]);
  });

  test("05-R2: an untouched card adds no change, and a content edit keeps the stored order", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "Edit Bite, Actions" }));
    await user.click(within(sheet.getByRole("form", { name: "Edit Bite, Actions" })).getByRole("button", { name: "Done" }));
    expect(screen.getByRole("toolbar", { name: "Editing" })).toHaveTextContent(/^Editing(?! ·)/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // Editing a trait leaves the actions, stored Bite, Tail, Claw, exactly as they are.
    await user.click(sheet.getByRole("button", { name: "Edit Keen Smell, Traits" }));
    const card = within(sheet.getByRole("form", { name: "Edit Keen Smell, Traits" }));
    await fill(user, card.getByRole("textbox", { name: "Text" }), "Advantage on smell.");
    await user.click(card.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("toolbar", { name: "Editing" })).toHaveTextContent("Editing · 1 change");

    const data = await save(user, puts);
    expect(data.actions).toEqual(drake.actions);
    expect(data.traits).toEqual([{ name: "Keen Smell", description: "Advantage on smell.", sortOrder: 0 }]);
  });

  test("05-R2: the first entry of a new section is saved where the sheet shows it", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Bonus Actions" }));
    const card = within(sheet.getByRole("form", { name: "Edit new entry, Bonus Actions" }));
    await user.keyboard("Nimble Escape");
    await user.click(card.getByRole("button", { name: "Done" }));

    const data = await save(user, puts);
    // Sheet order: Actions, then Bonus Actions, then Legendary Actions.
    expect(data.actions!.map(action => [action.name, action.sortOrder])).toEqual([
      ["Bite", 0], ["Claw", 1], ["Nimble Escape", 2], ["Tail", 3],
    ]);
  });

  test("05-R3: a spell name over 64 characters keeps the card open and sends nothing; 64 saves", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    const card = within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" }));
    const search = card.getByRole("combobox", { name: "Add a spell to spell list 1" });
    await fill(user, search, `${"x".repeat(65)}{Enter}`);
    await user.click(card.getByRole("button", { name: "Done" }));
    expect(card.getByRole("alert")).toHaveTextContent("Spell list 1, spell 2: Name: At most 64 characters.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(card.getByRole("alert")).toBeVisible();
    expect(puts).toHaveLength(0);

    await user.click(card.getByRole("button", { name: `Remove ${"x".repeat(65)}` }));
    await fill(user, search, `${"y".repeat(64)}{Enter}`);
    await user.click(card.getByRole("button", { name: "Done" }));
    const data = await save(user, puts);
    expect(data.spellcasting![0].levels![0].spells).toEqual([{ name: "Magic Missile", source: "XPHB" }, { name: "y".repeat(64) }]);
  });

  test("05-R3: an automatic save DC past 127 keeps the card open, and a typed one saves", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, titan);

    await user.click(sheet.getByRole("button", { name: "+ Add section" }));
    await user.click(sheet.getByRole("button", { name: "Spellcasting" }));
    const card = within(sheet.getByRole("form", { name: "Edit new entry, Spellcasting" }));
    await user.keyboard("Innate Spellcasting");
    await user.selectOptions(card.getByRole("combobox", { name: "Spellcasting ability" }), "Intelligence");
    await user.click(card.getByRole("button", { name: "Done" }));
    expect(card.getByRole("alert")).toHaveTextContent("Save DC: the automatic value would be 130");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(puts).toHaveLength(0);

    const dc = within(card.getByRole("group", { name: "Save DC" }));
    await user.click(dc.getByRole("checkbox", { name: "Automatic" }));
    await fill(user, dc.getByRole("textbox", { name: "Save DC" }), "20");
    await user.click(card.getByRole("button", { name: "Done" }));
    const data = await save(user, puts);
    expect(data.spellcasting).toEqual([expect.objectContaining({ name: "Innate Spellcasting", ability: "int", saveDc: 20, spellAttackBonus: 122 })]);
  });

  test("05-R4: automatic DC and attack follow an ability change through Undo and Redo; a typed DC stays", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);
    const meta = () => sheet.getByText(/^Spellcasting Ability Intelligence/);
    expect(meta()).toHaveTextContent("Save DC 14; Spell Attack +6");

    await user.click(sheet.getByRole("button", { name: "Edit Intelligence score, 16" }));
    await user.keyboard("18{Enter}");
    expect(meta()).toHaveTextContent("Save DC 15; Spell Attack +7");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(meta()).toHaveTextContent("Save DC 14; Spell Attack +6");
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(meta()).toHaveTextContent("Save DC 15; Spell Attack +7");

    // Reopened, both are still automatic; type the DC, then raise INT again.
    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    const card = within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" }));
    const dc = within(card.getByRole("group", { name: "Save DC" }));
    expect(dc.getByRole("checkbox", { name: "Automatic" })).toBeChecked();
    expect(within(card.getByRole("group", { name: "Spell attack" })).getByRole("checkbox", { name: "Automatic" })).toBeChecked();
    await user.click(dc.getByRole("checkbox", { name: "Automatic" }));
    await fill(user, dc.getByRole("textbox", { name: "Save DC" }), "16");
    await user.click(card.getByRole("button", { name: "Done" }));

    // INT 20 works out DC 16 too, but the typed DC stays typed, and stays put at INT 22.
    await user.click(sheet.getByRole("button", { name: "Edit Intelligence score, 18" }));
    await user.keyboard("20{Enter}");
    expect(meta()).toHaveTextContent("Save DC 16; Spell Attack +8");
    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    const reopened = within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" }));
    expect(within(reopened.getByRole("group", { name: "Save DC" })).getByRole("checkbox", { name: "Automatic" })).not.toBeChecked();
    await user.click(reopened.getByRole("button", { name: "Cancel" }));
    await user.click(sheet.getByRole("button", { name: "Edit Intelligence score, 20" }));
    await user.keyboard("22{Enter}");
    expect(meta()).toHaveTextContent("Save DC 16; Spell Attack +9");

    const data = await save(user, puts);
    expect(data.spellcasting![0]).toMatchObject({ saveDc: 16, spellAttackBonus: 9 });
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

    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    await user.click(within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" })).getByRole("button", { name: "Delete" }));
    expect(sheet.queryByRole("heading", { name: "Spellcasting" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Mage" })).toBeVisible();
    expect(sheet.getByRole("button", { name: "+ Add section" })).toHaveFocus();
  });

  test("05-R6: Escape in Insert spell closes only the picker and returns focus to its button", async () => {
    const user = userEvent.setup();
    serveCatalog();
    const sheet = await startEditing(user, drake);

    await user.click(sheet.getByRole("button", { name: "Edit Bite, Actions" }));
    const card = within(sheet.getByRole("form", { name: "Edit Bite, Actions" }));
    await user.click(card.getByRole("button", { name: "Insert spell" }));
    expect(card.getByRole("combobox", { name: "Spell to insert" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(card.queryByRole("combobox", { name: "Spell to insert" })).not.toBeInTheDocument();
    expect(card.getByRole("button", { name: "Insert spell" })).toHaveFocus();
  });

  test("05-R6: two printings of a spell have their own note and remove controls", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    const sheet = await startEditing(user, mage);

    await user.click(sheet.getByRole("button", { name: "Edit Spellcasting, Spellcasting" }));
    const card = within(sheet.getByRole("form", { name: "Edit Spellcasting, Spellcasting" }));
    const search = card.getByRole("combobox", { name: "Add a spell to spell list 1" });
    await fill(user, search, "fireb");
    await card.findByRole("listbox", { name: "Add a spell to spell list 1" });
    await user.keyboard("{ArrowDown}{Enter}");
    await fill(user, search, "fireb");
    await card.findByRole("listbox", { name: "Add a spell to spell list 1" });
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    await fill(user, card.getByRole("textbox", { name: "Note for Fireball (XPHB)" }), "2024");
    await user.click(card.getByRole("button", { name: "Remove Fireball (PHB)" }));
    expect(card.getByRole("textbox", { name: "Note for Fireball" })).toHaveValue("2024");
    await user.click(card.getByRole("button", { name: "Done" }));

    const data = await save(user, puts);
    expect(data.spellcasting![0].levels![0].spells).toEqual([
      { name: "Magic Missile", source: "XPHB" },
      { name: "Fireball", source: "XPHB", note: "2024" },
    ]);
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
