import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import type { EntityWriteIssue, UpdateEntityRequest } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { installLayoutApis, installMatchMedia, setPrimaryPointer, setViewportWidth } from "src/test/fakes/matchMedia.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { Compendium } from "../../Compendium.js";

// The sheet's two edit presentations draw the same field specs: live fields for a mouse on a wide
// pane, and targets that open editors for touch or a narrow pane.

const template = (templateId: number, name: string, patch: Partial<DnD5eEntityDetails> = {}): DnD5eEntityDetails => ({
  templateId,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  role: "creature",
  ac: 12,
  hp: 7,
  speeds: { walk: 30 },
  size: "small",
  alignment: "neutral evil",
  creatureType: "humanoid",
  cr: "1/4",
  // Dexterity 14 (+2) and CR 1/4 (PB +2): proficient is +4, expertise +6.
  abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
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

const goblin = template(14, "Goblin");
const mara = template(13, "Mara", { role: "npc", cr: "2" });
const skyGoblin = template(15, "Sky Goblin", { speeds: { walk: 30, fly: 60 } });
const seer = template(16, "Seer", {
  spellcasting: [{ name: "Innate Spellcasting", descriptions: ["The seer casts spells."], frequencyGroups: [{ frequency: "will", spells: [{ name: "Light" }] }] }],
});
// A stored note with a line break, and a condition the write contract allows but the presets do not list.
const STORED_FIRE = { damageType: "fire", conditionNote: "from nonmagical\nattacks" };
const warded = template(17, "Warded Goblin", {
  resistances: [STORED_FIRE, { damageType: "cold" }],
  // Different stored rows whose displayed text collides. Identity must come from the row, not text.
  conditionImmunities: [
    { conditionName: "Dazed", conditionNote: "magical" },
    { conditionName: "Dazed (magical)" },
  ],
});
const CATALOG = [goblin, mara, skyGoblin, seer, warded];
const gm = testUser({ id: 1, username: "gm", isGm: true });

function serveCatalog({ rejectPut, holdPut }: { rejectPut?: EntityWriteIssue[]; holdPut?: Promise<void> } = {}) {
  const puts: { id: number; data: UpdateEntityRequest }[] = [];
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: [] })),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: CATALOG.map(toSummary) })),
    http.post("/api/dnd5e/entities/batch", async ({ request }) => {
      const { entityIds } = (await request.json()) as { entityIds: number[] };
      return json({ entities: CATALOG.filter(entity => entityIds.includes(entity.templateId)) });
    }),
    http.put("/api/dnd5e/entities/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const { data } = (await request.json()) as { data: UpdateEntityRequest };
      puts.push({ id, data });
      await holdPut;
      if (rejectPut) return json({ message: "Invalid entity data.", details: rejectPut }, 400);
      const base = CATALOG.find(entity => entity.templateId === id)!;
      return json({ entity: { ...base, ...data, templateId: id } });
    }),
  );
  return puts;
}

const renderSheet = (id: number) => {
  localStorage.setItem("test-user-id", String(gm.id));
  localStorage.setItem("test-user-gm", "true");
  return renderWithProviders(<Compendium />, { route: `/compendium?entity=${id}`, user: gm });
};

type User = ReturnType<typeof userEvent.setup>;
const details = () => within(screen.getByLabelText("Entity details"));
const toolbar = () => within(details().getByRole("toolbar", { name: "Editing" }));
// jsdom's zero-size panes make react-resizable-panels cancel clicks; press rows with mousedown.
const pressRow = (name: string) => act(() => void fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(`^${name}`) })));

const startEditing = async (user: User, name: string) => {
  await screen.findByRole("article", { name });
  await user.click(details().getByRole("button", { name: `Actions for ${name}` }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  return within(await details().findByRole("article", { name }));
};

// A pointer press in jsdom's zero-size panes focuses the panel separator (react-resizable-panels),
// which would blur the field; focus fields directly and type without the click.
const typeInto = async (user: User, field: HTMLElement, text: string) => {
  act(() => field.focus());
  await user.type(field, text, { skipClick: true });
};
const retype = async (user: User, field: HTMLElement, text: string) => {
  await user.clear(field);
  await typeInto(user, field, text);
};

describe("live presentation (a mouse on a wide pane)", () => {
  beforeEach(() => {
    installLayoutApis();
    installMatchMedia(1500, { pointer: "fine" });
  });

  test("an invalid AC keeps its text and message and holds Save; Escape reverts it, and a valid AC saves", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");

    expect(sheet.queryByRole("button", { name: /^Edit Armor Class/ })).not.toBeInTheDocument();
    const ac = sheet.getByRole("textbox", { name: "Armor Class" });
    await retype(user, ac, "abc");
    await user.keyboard("{Enter}");

    expect(ac).toHaveValue("abc");
    expect(ac).toHaveAccessibleDescription("A whole number from 0 to 2147483647.");
    expect(sheet.getByRole("alert")).toHaveTextContent("A whole number from 0 to 2147483647.");
    expect(toolbar().getByText("1 field holds unapplied text")).toBeVisible();
    expect(toolbar().getByRole("button", { name: "Save" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(ac).toHaveValue("12");
    expect(sheet.queryByRole("alert")).not.toBeInTheDocument();
    expect(toolbar().queryByText("1 field holds unapplied text")).not.toBeInTheDocument();
    // The revert is local to the field: edit mode stays.
    expect(details().getByRole("toolbar", { name: "Editing" })).toBeVisible();

    await retype(user, ac, "15");
    await user.keyboard("{Enter}");
    expect(toolbar().getByText("Editing · 1 change")).toBeVisible();
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.ac).toBe(15);
  });

  test("a typed save of modifier plus PB is proficient, the marker cycles the mode, and Undo restores both", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    const save = sheet.getByRole("textbox", { name: "Dexterity saving throw" });
    const marker = () => sheet.getByRole("button", { name: /^Dexterity save, / });
    const savesLine = () => sheet.getByText("Saving Throws").nextElementSibling;

    expect(save).toHaveValue("+2");
    expect(marker()).toHaveAccessibleName("Dexterity save, not proficient. Change to proficient");

    await retype(user, save, "+4");
    await user.keyboard("{Enter}");
    expect(marker()).toHaveAccessibleName("Dexterity save, proficient. Change to expertise");
    expect(savesLine()).toHaveTextContent("Dex +4");

    await user.click(marker());
    expect(save).toHaveValue("+6");
    expect(marker()).toHaveAccessibleName("Dexterity save, expertise. Change to not proficient");

    await user.click(toolbar().getByRole("button", { name: "Undo" }));
    expect(save).toHaveValue("+4");
    expect(marker()).toHaveAccessibleName("Dexterity save, proficient. Change to expertise");
    await user.click(toolbar().getByRole("button", { name: "Undo" }));
    expect(save).toHaveValue("+2");
    expect(marker()).toHaveAccessibleName("Dexterity save, not proficient. Change to proficient");
    expect(savesLine()).not.toHaveTextContent("Dex");
  });

  // With suggestions (a datalist) the fields are comboboxes.
  test("a language preset applies immediately, duplicates are rejected, and Remove explicitly deletes an entry", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    const add = sheet.getByRole("combobox", { name: "Add a language" });
    const languagesLine = () => sheet.getByText("Languages").nextElementSibling;

    act(() => add.focus());
    // The zero-size panel separator in jsdom intercepts pointer presses before click.
    fireEvent.click(sheet.getByRole("option", { name: "Common" }));
    expect(sheet.getByRole("combobox", { name: "Language 1" })).toHaveValue("Common");
    expect(add).toHaveValue("");

    await typeInto(user, add, "common{Enter}");
    expect(sheet.getByRole("alert")).toHaveTextContent("common is already listed.");
    expect(sheet.queryByRole("combobox", { name: "Language 2" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(add).toHaveValue("");

    await typeInto(user, add, "Goblin{Enter}");
    expect(sheet.getByRole("combobox", { name: "Language 2" })).toHaveValue("Goblin");

    await user.clear(sheet.getByRole("combobox", { name: "Language 1" }));
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("combobox", { name: "Language 1" })).toHaveValue("Common");
    await user.click(sheet.getByRole("button", { name: "Remove language Common" }));
    expect(sheet.getByRole("combobox", { name: "Language 1" })).toHaveValue("Goblin");
    expect(sheet.queryByRole("combobox", { name: "Language 2" })).not.toBeInTheDocument();
    expect(languagesLine()).not.toHaveTextContent("Common");
  });

  test("a filled suggestion field offers every option by its label until the user types, and stores the value", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    const type = sheet.getByRole("combobox", { name: "Creature type" });
    const listed = () => within(sheet.getByRole("listbox", { name: "Creature type" })).getAllByRole("option").map(option => option.textContent);

    act(() => type.focus());
    expect(type).toHaveValue("humanoid");
    // A filled field opens its list on a click, not on focus alone.
    expect(sheet.queryByRole("listbox", { name: "Creature type" })).not.toBeInTheDocument();
    fireEvent.click(type);
    expect(listed()).toEqual(expect.arrayContaining(["Beast", "Humanoid", "Undead"]));

    await retype(user, type, "dra");
    expect(listed()).toEqual(["Dragon"]);
    fireEvent.click(sheet.getByRole("option", { name: "Dragon" }));
    expect(type).toHaveValue("dragon");
  });

  test("text that did not apply survives selecting another entity and Resume, and still holds Save", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    let sheet = await startEditing(user, "Goblin");
    await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "abc");
    await user.keyboard("{Enter}");

    pressRow("Mara");
    expect(await details().findByRole("article", { name: "Mara" })).toBeVisible();
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }));
    expect(bar.getByText("Unsaved changes to Goblin")).toBeVisible();

    await user.click(bar.getByRole("button", { name: "Resume" }));
    sheet = within(await details().findByRole("article", { name: "Goblin" }));
    expect(sheet.getByRole("textbox", { name: "Armor Class" })).toHaveValue("abc");
    expect(sheet.getByRole("alert")).toHaveTextContent("A whole number");
    expect(toolbar().getByRole("button", { name: "Save" })).toBeDisabled();
  });
});

describe("targets presentation (touch, or a narrow pane)", () => {
  beforeEach(() => {
    installLayoutApis();
    installMatchMedia(1500, { pointer: "coarse" });
  });

  test("the subtitle popover and the AC field commit through the same specs as the live fields", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    expect(sheet.queryByRole("textbox", { name: "Armor Class" })).not.toBeInTheDocument();

    await user.click(sheet.getByRole("button", { name: "Edit Armor Class, 12" }));
    await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "abc");
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("alert")).toHaveTextContent("A whole number from 0 to 2147483647.");
    await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "14");
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("button", { name: "Edit Armor Class, 14" })).toBeVisible();

    await user.click(sheet.getByRole("button", { name: /^Edit Type, / }));
    const popover = within(await screen.findByRole("dialog", { name: /^Edit Type/ }));
    await user.selectOptions(popover.getByRole("combobox", { name: "Size" }), "Medium");
    await retype(user, popover.getByRole("combobox", { name: "Creature type" }), "x".repeat(65));
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(await popover.findByRole("alert")).toHaveTextContent("Creature type: At most 64 characters.");

    await retype(user, popover.getByRole("combobox", { name: "Creature type" }), "fey");
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(sheet.getByRole("button", { name: "Edit Type, Medium Fey, neutral evil" })).toBeVisible();

    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data).toMatchObject({ ac: 14, size: "medium", creatureType: "fey" });
  });
});

describe("02-entity-live-fields-R2: input survives a switch of presentation", () => {
  beforeEach(() => {
    installLayoutApis();
    installMatchMedia(1500, { pointer: "fine" });
  });

  test("invalid live text stays a live field on switching to targets; fixing it there frees Save and the live sheet shows the fix", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    await retype(user, sheet.getByRole("textbox", { name: "Hit points" }), "9");
    await user.keyboard("{Enter}");
    await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "abc");
    await user.keyboard("{Enter}");

    setPrimaryPointer("coarse");
    expect(sheet.getByRole("button", { name: /^Edit HP, 9/ })).toBeVisible();
    const ac = sheet.getByRole("textbox", { name: "Armor Class" });
    expect(ac).toHaveValue("abc");
    expect(ac).toHaveAccessibleDescription("A whole number from 0 to 2147483647.");
    expect(toolbar().getByRole("button", { name: "Save" })).toBeDisabled();

    await retype(user, ac, "20");
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("button", { name: "Edit Armor Class, 20" })).toBeVisible();
    expect(toolbar().queryByText("1 field holds unapplied text")).not.toBeInTheDocument();

    setPrimaryPointer("fine");
    expect(sheet.getByRole("textbox", { name: "Armor Class" })).toHaveValue("20");
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data).toMatchObject({ ac: 20, hp: 9 });
  });

  test("text typed but not applied is applied when the window narrows into the reader, so Save sends it", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "23");

    setViewportWidth(700);
    const reader = within(await screen.findByRole("dialog", { name: "Goblin" }));
    expect(reader.getByRole("button", { name: "Edit Armor Class, 23" })).toBeVisible();
    await user.click(reader.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.ac).toBe(23);
  });

  test("text that first fails when the pointer turns coarse shows and announces its message in the field, and holds Save", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    const ac = sheet.getByRole("textbox", { name: "Armor Class" });
    await retype(user, ac, "abc");
    expect(ac).not.toHaveAttribute("aria-invalid", "true");

    setPrimaryPointer("coarse");
    expect(ac).toHaveValue("abc");
    expect(ac).toHaveAttribute("aria-invalid", "true");
    expect(ac).toHaveAccessibleDescription("A whole number from 0 to 2147483647.");
    expect(sheet.getByRole("alert")).toHaveTextContent("A whole number from 0 to 2147483647.");
    expect(toolbar().getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("an open editor keeps its input when the window widens to the live sheet, and Done applies it there", async () => {
    installMatchMedia(700);
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const reader = () => within(screen.getByRole("dialog", { name: "Goblin" }));
    await within(await screen.findByRole("dialog", { name: "Goblin" })).findByRole("article", { name: "Goblin" });
    await user.click(reader().getByRole("button", { name: "Actions for Goblin" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(reader().getByRole("button", { name: /^Edit HP, / }));
    await retype(user, within(reader().getByRole("group", { name: /^Edit HP/ })).getByRole("textbox", { name: "Hit point formula" }), "2d6");

    setViewportWidth(1500);
    const popover = within(await screen.findByRole("dialog", { name: /^Edit HP/ }));
    expect(popover.getByRole("textbox", { name: "Hit point formula" })).toHaveValue("2d6");
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(details().getByRole("textbox", { name: "Hit point formula" })).toHaveValue("2d6");
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.hpFormula).toBe("2d6");
  });
});

describe("live presentation: tokens, issues and the open editor", () => {
  beforeEach(() => {
    installLayoutApis();
    installMatchMedia(1500, { pointer: "fine" });
  });

  test("02-entity-live-fields-R3: a token's unapplied text stays with its token when another is removed, and goes when Undo removes it", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    const add = sheet.getByRole("combobox", { name: "Add a language" });
    await typeInto(user, add, "Common{Enter}");
    await typeInto(user, add, "Draconic{Enter}");
    await retype(user, sheet.getByRole("combobox", { name: "Language 2" }), "Common");
    await user.keyboard("{Enter}");
    expect(sheet.getByRole("alert")).toHaveTextContent("Common is already listed.");

    await user.click(sheet.getByRole("button", { name: "Remove language Common" }));
    // Draconic is first now, and still holds the text typed over it.
    const first = sheet.getByRole("combobox", { name: "Language 1" });
    expect(first).toHaveValue("Common");
    expect(first).toHaveFocus();
    expect(sheet.queryByRole("combobox", { name: "Language 2" })).not.toBeInTheDocument();
    expect(toolbar().getByText("1 field holds unapplied text")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(first).toHaveValue("Draconic");
    expect(toolbar().queryByText("1 field holds unapplied text")).not.toBeInTheDocument();

    await typeInto(user, add, "Elvish{Enter}");
    await retype(user, sheet.getByRole("combobox", { name: "Language 2" }), "draconic");
    await user.keyboard("{Enter}");
    expect(toolbar().getByText("1 field holds unapplied text")).toBeVisible();
    await user.click(toolbar().getByRole("button", { name: "Undo" }));
    expect(sheet.queryByRole("combobox", { name: "Language 2" })).not.toBeInTheDocument();
    expect(toolbar().queryByText("1 field holds unapplied text")).not.toBeInTheDocument();
    expect(toolbar().getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("02-entity-live-fields-R4: a server issue focuses its own live field, an absent speed its add control, and targets open the grouped editor", async () => {
    const user = userEvent.setup();
    serveCatalog({
      rejectPut: [
        { path: "hpFormula", message: "Formula rejected." },
        { path: "alignment", message: "Alignment rejected." },
        { path: "speeds.fly", message: "Fly rejected." },
        { path: "speeds.swim", message: "Swim rejected." },
      ],
    });
    renderSheet(skyGoblin.templateId);
    const sheet = await startEditing(user, "Sky Goblin");
    await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "13");
    await user.keyboard("{Enter}");
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sheet.getByRole("textbox", { name: "Hit point formula" })).toHaveFocus());
    const issues = () => within(details().getByRole("list", { name: "Issues" }));
    await user.click(issues().getByRole("button", { name: "Alignment: Alignment rejected." }));
    expect(sheet.getByRole("combobox", { name: "Alignment" })).toHaveFocus();
    await user.click(issues().getByRole("button", { name: "Speed: Fly rejected." }));
    expect(sheet.getByRole("textbox", { name: "Fly speed in feet" })).toHaveFocus();
    await user.click(issues().getByRole("button", { name: "Speed: Swim rejected." }));
    expect(sheet.getByRole("combobox", { name: "Add a speed" })).toHaveFocus();

    setPrimaryPointer("coarse");
    const issue = issues().getByRole("button", { name: "HP formula: Formula rejected." });
    await user.click(issue);
    const popover = within(await screen.findByRole("dialog", { name: /^Edit HP/ }));
    const formula = popover.getByRole("textbox", { name: "Hit point formula" });
    expect(formula).toHaveFocus();
    await retype(user, popover.getByRole("textbox", { name: "Hit points" }), "16");
    await user.click(issue);
    expect(formula).toHaveFocus();
    expect(popover.getByRole("textbox", { name: "Hit points" })).toHaveValue("16");
    await user.keyboard("{Escape}");
    await user.click(issues().getByRole("button", { name: "Speed: Fly rejected." }));
    expect(within(await screen.findByRole("dialog", { name: /^Edit Speed/ })).getByRole("textbox", { name: "Feet 2" })).toHaveFocus();
  });

  test.each([
    ["live", "targets", "fine", "coarse"],
    ["targets", "live", "coarse", "fine"],
  ] as const)("02-entity-live-fields-R4: a late rejection opens its field in %s -> %s on Resume", async (_from, to, fromPointer, toPointer) => {
    installMatchMedia(1500, { pointer: fromPointer });
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const puts = serveCatalog({ rejectPut: [{ path: "hpFormula", message: "Formula rejected." }], holdPut: held });
    const { queryClient } = renderSheet(goblin.templateId);
    const sheet = await startEditing(user, "Goblin");
    if (fromPointer === "fine") {
      await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "13");
      await user.keyboard("{Enter}");
    } else {
      await user.click(sheet.getByRole("button", { name: "Edit Armor Class, 12" }));
      await retype(user, sheet.getByRole("textbox", { name: "Armor Class" }), "13");
      await user.keyboard("{Enter}");
    }
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));

    pressRow("Mara");
    expect(await details().findByRole("article", { name: "Mara" })).toBeVisible();
    setPrimaryPointer(toPointer);
    await act(async () => release());
    // The rejection reaches the kept draft while Mara is shown.
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    const resumed = within(await details().findByRole("article", { name: "Goblin" }));
    const focusTarget = to === "live"
      ? resumed.getByRole("textbox", { name: "Hit point formula" })
      : within(await screen.findByRole("dialog", { name: /^Edit HP/ })).getByRole("textbox", { name: "Hit point formula" });
    await waitFor(() => expect(focusTarget).toHaveFocus());
    const issues = within(details().getByRole("list", { name: "Issues" }));
    expect(issues.getByRole("button", { name: "HP formula: Formula rejected." })).toBeVisible();
  });

  test("02-entity-live-fields-R5: an invalid spell list editor keeps focus and its error, and no live field or marker applies until it is fixed", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(seer.templateId);
    const sheet = await startEditing(user, "Seer");
    const editorName = "Edit Spell list At will, Innate Spellcasting, Spellcasting";
    await user.click(sheet.getByRole("button", { name: editorName }));
    const editor = () => screen.getByRole("dialog", { name: editorName });
    await user.selectOptions(within(editor()).getByRole("combobox", { name: "Spell list" }), "Per day");
    await typeInto(user, within(editor()).getByRole("textbox", { name: "Uses" }), "x");

    const ac = sheet.getByRole("textbox", { name: "Armor Class" });
    act(() => ac.focus());
    expect(within(editor()).getByRole("alert")).toHaveTextContent("The count is a whole number from 1.");
    expect(editor()).toContainElement(document.activeElement as HTMLElement);

    await user.click(sheet.getByRole("button", { name: /^Dexterity save, / }));
    expect(sheet.getByRole("button", { name: /^Dexterity save, / })).toHaveAccessibleName("Dexterity save, not proficient. Change to proficient");
    expect(editor()).toContainElement(document.activeElement as HTMLElement);
    expect(toolbar().queryByText(/changes/)).not.toBeInTheDocument();

    // Fixed, the editor settles when a live field takes focus, and the field's edit applies.
    await retype(user, within(editor()).getByRole("textbox", { name: "Uses" }), "2");
    await retype(user, ac, "21");
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog", { name: /^Edit Spell list/ })).not.toBeInTheDocument();
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data).toMatchObject({
      ac: 21,
      spellcasting: [expect.objectContaining({ frequencyGroups: [{ frequency: "daily", count: 2, spells: [{ name: "Light" }] }] })],
    });
  });

  test("02-entity-live-fields-R6: editing colliding defense displays keeps each stored row's name and note", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(warded.templateId);
    const sheet = await startEditing(user, "Warded Goblin");
    await retype(user, sheet.getByRole("combobox", { name: "Resistance 2" }), "cold (when wet)");
    await user.keyboard("{Enter}");
    const conditions = sheet.getAllByRole("combobox", { name: /^Condition immunity \d/ });
    expect(conditions.map(condition => (condition as HTMLInputElement).value)).toEqual([
      "Dazed (magical)",
      "Dazed (magical)",
    ]);
    await retype(user, sheet.getByRole("combobox", { name: "Condition immunity 2" }), "Dazed (magical) (under moonlight)");
    await user.keyboard("{Enter}");
    await retype(user, sheet.getByRole("combobox", { name: "Condition immunity 1" }), "Dazed (while raging)");
    await user.keyboard("{Enter}");
    expect(sheet.queryByRole("alert")).not.toBeInTheDocument();
    await typeInto(user, sheet.getByRole("combobox", { name: "Add a condition immunity" }), "Sleepy{Enter}");
    expect(sheet.getByRole("alert")).toHaveTextContent("Sleepy is not a condition.");
    await user.keyboard("{Escape}");

    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.resistances).toEqual([STORED_FIRE, { damageType: "cold", conditionNote: "when wet" }]);
    expect(puts[0]?.data.conditionImmunities).toEqual([
      { conditionName: "Dazed", conditionNote: "while raging" },
      { conditionName: "Dazed (magical)", conditionNote: "under moonlight" },
    ]);
  });

  test.each([
    { cleared: 1, survivor: { conditionName: "Dazed (magical)" } },
    { cleared: 2, survivor: { conditionName: "Dazed", conditionNote: "magical" } },
  ])("02-entity-live-fields-R6: removing colliding defense $cleared keeps the other stored row", async ({ cleared, survivor }) => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(warded.templateId);
    const sheet = await startEditing(user, "Warded Goblin");
    const remove = sheet.getAllByRole("button", { name: "Remove condition immunity Dazed (magical)" });
    await user.click(remove[cleared - 1]);
    expect(sheet.getAllByRole("combobox", { name: /^Condition immunity \d/ }).map(token => (token as HTMLInputElement).value))
      .toEqual(["Dazed (magical)"]);

    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.conditionImmunities).toEqual([survivor]);
  });
});

describe("02-entity-live-fields-R6: the grouped editors commit through the shared field rules", () => {
  beforeEach(() => {
    installLayoutApis();
    installMatchMedia(1500, { pointer: "coarse" });
  });

  test("speeds, a save cell and the defense popovers write as the live fields do, keeping stored rows", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(warded.templateId);
    const sheet = await startEditing(user, "Warded Goblin");

    await user.click(sheet.getByRole("button", { name: /^Edit Speed, / }));
    let popover = within(await screen.findByRole("dialog", { name: /^Edit Speed/ }));
    await retype(user, popover.getByRole("textbox", { name: "Feet 1" }), "abc");
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(await popover.findByRole("alert")).toHaveTextContent("Walk speed in feet: A whole number from 0 to 2147483647.");
    await retype(user, popover.getByRole("textbox", { name: "Feet 1" }), "25");
    await user.click(popover.getByRole("button", { name: "Done" }));

    await user.click(sheet.getByRole("button", { name: "Edit Dexterity saving throw, +2" }));
    popover = within(await screen.findByRole("dialog", { name: /^Edit Dexterity saving throw/ }));
    await user.selectOptions(popover.getByRole("combobox", { name: "Dexterity save mode" }), "Proficient");
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(sheet.getByRole("button", { name: "Edit Dexterity saving throw, +4" })).toBeVisible();

    await user.click(sheet.getByRole("button", { name: /^Edit Resistances, / }));
    popover = within(await screen.findByRole("dialog", { name: /^Edit Resistances/ }));
    await retype(user, popover.getByRole("textbox", { name: "resistance 2 note" }), "when wet");
    await user.click(popover.getByRole("button", { name: "Done" }));

    await user.click(sheet.getByRole("button", { name: /^Edit Condition Immunities, / }));
    popover = within(await screen.findByRole("dialog", { name: /^Edit Condition Immunities/ }));
    await retype(user, popover.getByRole("textbox", { name: "condition immunity 1 note" }), "while raging");
    await retype(user, popover.getByRole("textbox", { name: "condition immunity 2 note" }), "under moonlight");
    await user.click(popover.getByRole("button", { name: "Done" }));

    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data).toMatchObject({ speeds: { walk: 25 }, saves: { dex: "+4" } });
    expect(puts[0]?.data.resistances).toEqual([STORED_FIRE, { damageType: "cold", conditionNote: "when wet" }]);
    expect(puts[0]?.data.conditionImmunities).toEqual([
      { conditionName: "Dazed", conditionNote: "while raging" },
      { conditionName: "Dazed (magical)", conditionNote: "under moonlight" },
    ]);
  });

  test.each([
    { removed: "Dazed", survivor: { conditionName: "Dazed (magical)" } },
    { removed: "Dazed (magical)", survivor: { conditionName: "Dazed", conditionNote: "magical" } },
  ])("removing colliding defense $removed in the popover keeps the other stored row", async ({ removed, survivor }) => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(warded.templateId);
    const sheet = await startEditing(user, "Warded Goblin");

    await user.click(sheet.getByRole("button", { name: /^Edit Condition Immunities, / }));
    const popover = within(await screen.findByRole("dialog", { name: /^Edit Condition Immunities/ }));
    await user.click(popover.getByRole("button", { name: `Remove ${removed}` }));
    await user.click(popover.getByRole("button", { name: "Done" }));

    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.conditionImmunities).toEqual([survivor]);
  });
});
