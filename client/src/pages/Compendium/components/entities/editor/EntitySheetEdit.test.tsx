import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import { validateDnD5eEntityWrite, type UpdateEntityRequest } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { installLayoutApis, installMatchMedia, setViewportWidth } from "src/test/fakes/matchMedia.js";
import { apiError, json } from "src/test/msw/handlers.js";
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
  inParty: false,
  featuredNpc: false,
  source: entity.source,
  imported: entity.imported,
  locallyEdited: entity.locallyEdited,
});

const goblin = template(14, "Goblin", { cr: "1/4", creatureType: "humanoid", size: "small", hp: 7 });
const mara = template(13, "Mara", { role: "npc", cr: "2", creatureType: "humanoid", settings: { combat: { deathSaves: true } } });
const bram = template(11, "Bram", { role: "pc", hp: 33 });
const owlbear = template(15, "Owlbear", {
  cr: "3", source: "MM", imported: true, locallyEdited: true, skills: { perception: "+3" }, senses: ["darkvision 60 ft."],
});
const kobold = template(16, "Kobold", {
  cr: "1/4", creatureType: "humanoid", size: "small", hp: 5, hpFormula: "2d6 - 2", imageUrl: "/images/kobold.png",
  skills: { athletics: "+2" },
});
const hydra = template(17, "Hydra", { speeds: { walk: 30, burrow: 10, climb: 10, fly: 10, swim: 10, hover: 10 } });
const CATALOG = [goblin, mara, bram, owlbear, kobold, hydra];

const gm = testUser({ id: 1, username: "gm", isGm: true });
type Put = { id: number; data: UpdateEntityRequest; body: Record<string, unknown> };
let patches: { id: number; body: unknown }[] = [];

function serveCatalog(options: { failPut?: string } = {}) {
  const puts: Put[] = [];
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: [] })),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: CATALOG.map(toSummary) })),
    http.post("/api/dnd5e/entities/batch", async ({ request }) => {
      const { entityIds } = (await request.json()) as { entityIds: number[] };
      return json({ entities: CATALOG.filter(entity => entityIds.includes(entity.templateId)) });
    }),
    http.patch("/api/dnd5e/entities/:id/settings", async ({ params, request }) => {
      const id = Number(params.id);
      const body: unknown = await request.json();
      patches.push({ id, body });
      const base = CATALOG.find(entity => entity.templateId === id)!;
      return json({ settings: { ...base.settings, ...(body as object) } });
    }),
    http.put("/api/dnd5e/entities/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const body = (await request.json()) as { data: UpdateEntityRequest };
      puts.push({ id, data: body.data, body: body as Record<string, unknown> });
      if (options.failPut) return apiError(500, options.failPut);
      const base = CATALOG.find(entity => entity.templateId === id)!;
      return json({ entity: { ...base, ...body.data, templateId: id } });
    }),
  );
  return puts;
}

const renderSheet = (id: number) => {
  localStorage.setItem("test-user-id", String(gm.id));
  localStorage.setItem("test-user-gm", "true");
  return renderWithProviders(<Compendium />, { route: `/compendium?entity=${id}`, user: gm });
};

const details = () => screen.getByLabelText("Entity details");
type User = ReturnType<typeof userEvent.setup>;

const startEditing = async (user: User, name: string) => {
  await screen.findByRole("article", { name });
  const scope = () => (screen.queryByRole("dialog", { name }) ? screen.getByRole("dialog", { name }) : details());
  await user.click(within(scope()).getByRole("button", { name: `Actions for ${name}` }));
  await user.click(screen.getByRole("menuitem", { name: "Edit" }));
  return scope;
};

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280, { pointer: "coarse" });
  patches = [];
});

describe("sheet edit mode", () => {
  test("view mode offers no edit controls and shows the sheet's text as before", async () => {
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = within(await screen.findByRole("article", { name: "Goblin" }));

    expect(sheet.getByText("Small Humanoid, neutral")).toBeVisible();
    expect(sheet.getByText("AC").nextElementSibling).toHaveTextContent("12");
    expect(sheet.getByText("CR").nextElementSibling).toHaveTextContent("1/4");
    expect(sheet.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: /^\+ / })).not.toBeInTheDocument();
  });

  test("changing AC and saving sends a PUT with the new AC and no settings", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(mara.templateId);
    const scope = await startEditing(user, "Mara");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    // The editor opens focused with its text selected, so typing replaces it.
    expect(within(scope()).getByRole("textbox", { name: "Armor Class" })).toHaveFocus();
    await user.keyboard("15{Enter}");

    expect(within(scope()).getByRole("button", { name: "Edit Armor Class, 15" })).toBeVisible();
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.id).toBe(mara.templateId);
    expect(puts[0]?.data.ac).toBe(15);
    expect(puts[0]?.data).not.toHaveProperty("settings");
    await waitFor(() => expect(within(scope()).queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(within(scope()).getByText("AC").nextElementSibling).toHaveTextContent("15");
  });

  test("Escape reverts an inline edit, and an unchanged draft cannot be saved", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("9");
    expect(within(scope()).getByRole("textbox", { name: "Armor Class" })).toHaveValue("9");
    await user.keyboard("{Escape}");

    const target = within(scope()).getByRole("button", { name: "Edit Armor Class, 12" });
    expect(target).toHaveFocus();
    expect(within(scope()).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(puts).toHaveLength(0);
  });

  test("invalid text keeps the editor open with its message, and another target cannot open meanwhile", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("x{Enter}");
    expect(await within(scope()).findByRole("alert")).toHaveTextContent(/whole number/);

    await user.click(within(scope()).getByRole("button", { name: "Edit HP, 7" }));
    expect(within(scope()).getByRole("textbox", { name: "Armor Class" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: /Edit HP/ })).not.toBeInTheDocument();
  });

  test("Tab in an ability score opens the next one, and the modifier follows the committed score", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Strength score, 10" }));
    await user.keyboard("18");
    await user.tab();

    expect(within(scope()).getByRole("textbox", { name: "Dexterity score" })).toHaveFocus();
    expect(within(scope()).getByRole("button", { name: "Edit Strength score, 18" })).toBeVisible();
    const strRow = within(scope()).getAllByRole("table")[0]!.querySelectorAll("tbody tr")[0] as HTMLElement;
    // The modifier, and the save that falls back to it.
    expect(within(strRow).getAllByText("+4")).toHaveLength(2);
  });

  test("a placeholder opens its editor, and the saved line appears on the sheet", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "+ Languages" }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit Languages" }));
    await user.type(popover.getByRole("textbox", { name: "Languages" }), "Goblin{Enter}");
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog", { name: "Edit Languages" })).not.toBeInTheDocument();
    expect(within(scope()).getByRole("button", { name: "Edit Languages, Goblin" })).toBeVisible();
    expect(within(scope()).queryByRole("button", { name: "+ Languages" })).not.toBeInTheDocument();

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.languages).toEqual(["Goblin"]);
  });

  test("Escape closes a popover without keeping its changes", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit Speed, 30 ft." }));
    await user.tab();
    await user.keyboard("{Control>}a{/Control}60");
    expect(popover.getByRole("textbox", { name: "Feet 1" })).toHaveValue("60");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /Edit Speed/ })).not.toBeInTheDocument();
    expect(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." })).toHaveFocus();
  });

  test("a skill listed twice is rejected with a message instead of silently dropped", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "+ Skills" }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit Skills" }));
    await user.selectOptions(popover.getByRole("combobox", { name: "Add skill" }), "Acrobatics");
    await user.selectOptions(popover.getByRole("combobox", { name: "Add skill" }), "Athletics");
    await user.selectOptions(popover.getByRole("combobox", { name: "skill 2" }), "Acrobatics");
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(await popover.findByRole("alert")).toHaveTextContent("Acrobatics is listed twice.");
    expect(screen.getByRole("dialog", { name: "Edit Skills" })).toBeVisible();
  });

  test("a save mode shows on the sheet: Proficient adds the proficiency bonus to the modifier", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Dexterity saving throw, +2" }));
    const popover = within(await screen.findByRole("dialog", { name: /Edit Dexterity saving throw/ }));
    await user.selectOptions(popover.getByRole("combobox", { name: "Dexterity save mode" }), "Proficient");
    await user.click(popover.getByRole("button", { name: "Done" }));

    // Dex 14 is +2; CR 1/4 gives a proficiency bonus of +2.
    expect(within(scope()).getByRole("button", { name: "Edit Dexterity saving throw, +4" })).toBeVisible();
    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.data.saves).toEqual({ dex: "+4" });
  });

  test("passive Perception follows the draft: a Wisdom edit changes the Senses line", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");
    expect(within(scope()).getByRole("button", { name: "Edit Senses, passive Perception 10" })).toBeVisible();

    await user.click(within(scope()).getByRole("button", { name: "Edit Wisdom score, 10" }));
    await user.keyboard("14{Enter}");

    expect(within(scope()).getByRole("button", { name: "Edit Senses, passive Perception 12" })).toBeVisible();
  });

  test("the settings strip shows only what the role uses", async () => {
    const user = userEvent.setup();
    serveCatalog();
    const view = renderSheet(mara.templateId);
    const scope = await startEditing(user, "Mara");
    expect(within(scope()).getByRole("checkbox", { name: /Featured NPC/ })).not.toBeChecked();
    expect(within(scope()).getByRole("checkbox", { name: /death saves/ })).toBeChecked();
    expect(within(scope()).queryByRole("checkbox", { name: /Party member/ })).not.toBeInTheDocument();
    view.unmount();

    renderSheet(bram.templateId);
    const pcScope = await startEditing(user, "Bram");
    expect(within(pcScope()).getByRole("checkbox", { name: /Party member/ })).toBeVisible();
    expect(within(pcScope()).queryByRole("checkbox", { name: /Featured NPC/ })).not.toBeInTheDocument();
    expect(within(pcScope()).queryByText("CR")).not.toBeInTheDocument();
  });

  test("an imported entity shows its source and Edited badges on the sheet and in the list, and an unchanged draft has nothing to save", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(owlbear.templateId);
    const scope = await startEditing(user, "Owlbear");

    const row = await screen.findByRole("option", { name: /^Owlbear/ });
    expect(within(row).getByText("MM")).toBeVisible();
    expect(within(row).getByText("Edited")).toBeVisible();
    expect(within(scope()).getByText("MM")).toBeVisible();
    expect(within(screen.getByRole("option", { name: /^Goblin/ })).getByText("Homebrew")).toBeVisible();
    expect(within(scope()).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("a failed save keeps the draft and shows the server's message", async () => {
    const user = userEvent.setup();
    serveCatalog({ failPut: "Database unavailable" });
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Name, Goblin" }));
    await user.keyboard("Hobgoblin{Enter}");
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    expect(await within(scope()).findByText("Database unavailable")).toBeVisible();
    expect(within(scope()).getByRole("button", { name: "Edit Name, Hobgoblin" })).toBeVisible();
  });

  test("on a narrow screen a popover editor expands under its target inside the dialog", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    const panel = within(within(scope()).getByRole("group", { name: "Edit Speed, 30 ft." }));
    expect(panel.getByRole("textbox", { name: "Feet 1" })).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Edit Speed, 30 ft." })).not.toBeInTheDocument();
  });
});

const lastPut = (puts: Put[]) => puts.at(-1)!;

describe("review corrections: toolbar and an open editor (04-R1)", () => {
  beforeEach(() => installMatchMedia(800));

  test("Save writes a popover value that was never confirmed with Done, together with earlier commits", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("15{Enter}");
    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    const feet = within(scope()).getByRole("textbox", { name: "Feet 1" });
    await user.clear(feet);
    await user.type(feet, "60");
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ ac: 15, speeds: { walk: 60 } });
    expect(validateDnD5eEntityWrite(lastPut(puts).data, "update").ok).toBe(true);
  });

  test("Save is available for a first edit that is still open, and sends it", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");
    expect(within(scope()).getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    const feet = within(scope()).getByRole("textbox", { name: "Feet 1" });
    await user.clear(feet);
    await user.type(feet, "45");
    expect(within(scope()).getByRole("button", { name: "Save" })).toBeEnabled();
    // Keyboard activation takes the same path as a click.
    within(scope()).getByRole("button", { name: "Save" }).focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data.speeds).toEqual({ walk: 45 });
  });

  test("an open editor with an unchanged value sends nothing", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    expect(puts).toHaveLength(0);
    expect(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." })).toBeVisible();
  });

  test("Save never proceeds past an invalid pending edit: the editor stays open with its message", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    const feet = within(scope()).getByRole("textbox", { name: "Feet 1" });
    await user.clear(feet);
    await user.type(feet, "fast");
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    expect(await within(scope()).findByRole("alert")).toHaveTextContent(/whole number/);
    expect(within(scope()).getByRole("textbox", { name: "Feet 1" })).toHaveValue("fast");
    expect(puts).toHaveLength(0);
  });

  test("Undo settles the open editor first, so its stale input cannot overwrite history later", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("15{Enter}");
    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    const feet = within(scope()).getByRole("textbox", { name: "Feet 1" });
    await user.clear(feet);
    await user.type(feet, "60");
    await user.click(within(scope()).getByRole("button", { name: "Undo" }));

    // The speed was committed and then undone; the editor is gone and AC 15 stands.
    expect(within(scope()).queryByRole("textbox", { name: "Feet 1" })).not.toBeInTheDocument();
    expect(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." })).toBeVisible();
    expect(within(scope()).getByRole("button", { name: "Edit Armor Class, 15" })).toBeVisible();

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ ac: 15, speeds: { walk: 30 } });
  });
});

describe("review corrections: keyboard focus and markup (04-R2)", () => {
  afterEach(() => vi.restoreAllMocks());

  test("Escape in a narrow popover editor discards it and keeps the sheet open, focused on its target", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCatalog();
    const errors = vi.spyOn(console, "error");
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Type, Small Humanoid, neutral" }));
    const group = within(within(scope()).getByRole("group", { name: /Edit Type/ }));
    await user.clear(group.getByRole("combobox", { name: "Alignment" }));
    await user.type(group.getByRole("combobox", { name: "Alignment" }), "chaotic evil");
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Goblin" })).toBeVisible();
    expect(within(scope()).queryByRole("group", { name: /Edit Type/ })).not.toBeInTheDocument();
    expect(within(scope()).getByRole("button", { name: "Edit Type, Small Humanoid, neutral" })).toHaveFocus();
    expect(within(scope()).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(errors.mock.calls.map(call => String(call[0])).filter(message => message.includes("cannot be a descendant"))).toEqual([]);
  });

  test("Escape in a narrow inline editor leaves the sheet open too", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Goblin" })).toBeVisible();
    expect(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" })).toHaveFocus();
  });

  test("adding the first language returns focus to the line's target", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "+ Languages" }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit Languages" }));
    await user.type(popover.getByRole("textbox", { name: "Languages" }), "Goblin{Enter}");
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(within(scope()).getByRole("button", { name: "Edit Languages, Goblin" })).toHaveFocus();
  });

  test("adding an HP formula returns focus to the HP target", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "+ HP formula" }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit HP, 7" }));
    await user.type(popover.getByRole("textbox", { name: "Hit point formula" }), "2d6");
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(within(scope()).getByRole("button", { name: "Edit HP, 7 (2d6)" })).toHaveFocus();
  });

  test("a popover opens on its first enabled control", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(hydra.templateId);
    const scope = await startEditing(user, "Hydra");

    await user.click(within(scope()).getByRole("button", { name: /^Edit Speed/ }));
    const popover = within(await screen.findByRole("dialog", { name: /Edit Speed/ }));
    // Every speed type is in use, so Add is disabled and must not take the focus.
    expect(popover.getByRole("combobox", { name: "Add speed" })).toBeDisabled();
    const focused = document.activeElement as HTMLElement;
    expect(focused).not.toBeDisabled();
    expect(popover.getByRole("combobox", { name: "Speed type 1" })).toHaveFocus();
  });

  test("view mode keeps the reader's markup: a paragraph subtitle and no modifier hint", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    serveCatalog();
    renderSheet(goblin.templateId);
    const sheet = await screen.findByRole("article", { name: "Goblin" });

    expect(screen.getByText("Small Humanoid, neutral").closest("p")).not.toBeNull();
    expect(sheet.querySelector("td[title]")).toBeNull();
  });

  test("edit mode keeps its rows valid: placeholders sit in a dt/dd pair, the subtitle is not a paragraph", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    const placeholder = within(scope()).getByRole("button", { name: "+ Languages" });
    expect(placeholder.closest("dd")).not.toBeNull();
    expect(placeholder.closest("div")?.querySelector("dt")).toHaveTextContent("Languages");
    expect(within(scope()).getByRole("button", { name: /^Edit Type/ }).closest("p")).toBeNull();
  });
});

describe("review corrections: cleared fields (04-R3)", () => {
  beforeEach(() => installMatchMedia(1280, { pointer: "coarse" }));

  test("clearing CR and the token shows them absent, sends null, and Undo brings them back", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(kobold.templateId);
    const scope = await startEditing(user, "Kobold");

    await user.click(within(scope()).getByRole("button", { name: "Edit Challenge Rating, 1/4" }));
    await user.keyboard("{Backspace}{Enter}");
    await user.click(within(scope()).getByRole("button", { name: "Edit Token image" }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit Token image" }));
    await user.clear(popover.getByRole("textbox", { name: "Token image URL" }));
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(within(scope()).getByRole("button", { name: "Edit Challenge Rating, —" })).toBeVisible();
    expect(within(scope()).queryByText("1/4")).not.toBeInTheDocument();
    expect(within(scope()).getByRole("button", { name: "+ Token image" })).toBeVisible();
    expect(within(scope()).queryByRole("img", { name: "Kobold token" })).not.toBeInTheDocument();

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ cr: null, imageUrl: null });
  });

  test("Undo restores a cleared CR and token", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(kobold.templateId);
    const scope = await startEditing(user, "Kobold");

    await user.click(within(scope()).getByRole("button", { name: "Edit Challenge Rating, 1/4" }));
    await user.keyboard("{Backspace}{Enter}");
    expect(within(scope()).getByRole("button", { name: "Edit Challenge Rating, —" })).toBeVisible();
    await user.click(within(scope()).getByRole("button", { name: "Undo" }));

    expect(within(scope()).getByRole("button", { name: "Edit Challenge Rating, 1/4" })).toBeVisible();
  });

  test("clearing the HP formula and the creature type shows neither", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(kobold.templateId);
    const scope = await startEditing(user, "Kobold");

    await user.click(within(scope()).getByRole("button", { name: "Edit HP, 5 (2d6 - 2)" }));
    let popover = within(await screen.findByRole("dialog", { name: /Edit HP/ }));
    await user.clear(popover.getByRole("textbox", { name: "Hit point formula" }));
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(within(scope()).getByRole("button", { name: "Edit HP, 5" })).toBeVisible();
    expect(within(scope()).getByRole("button", { name: "+ HP formula" })).toBeVisible();

    await user.click(within(scope()).getByRole("button", { name: /^Edit Type/ }));
    popover = within(await screen.findByRole("dialog", { name: /Edit Type/ }));
    await user.clear(popover.getByRole("combobox", { name: "Creature type" }));
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(within(scope()).queryByText(/Humanoid/)).not.toBeInTheDocument();

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ hpFormula: null, creatureType: null });
  });
});

describe("review corrections: proficiency row keys (04-R4)", () => {
  beforeEach(() => installMatchMedia(1280, { pointer: "coarse" }));

  test("moving a Proficient skill to another ability recomputes it for that ability", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(kobold.templateId);
    const scope = await startEditing(user, "Kobold");

    // STR 10 with proficiency bonus +2 reads +2; Dex 14 with the same bonus is +4.
    await user.click(within(scope()).getByRole("button", { name: /^Edit Skills/ }));
    const popover = within(await screen.findByRole("dialog", { name: /Edit Skills/ }));
    await user.selectOptions(popover.getByRole("combobox", { name: "skill 1" }), "Acrobatics");
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(within(scope()).getByRole("button", { name: /^Edit Skills, Acrobatics \+4/ })).toBeVisible();
    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data.skills).toEqual({ acrobatics: "+4" });
  });

  test("an unchanged row keeps its stored value, and an explicit custom value follows a new key", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(kobold.templateId);
    const scope = await startEditing(user, "Kobold");

    await user.click(within(scope()).getByRole("button", { name: /^Edit Skills/ }));
    const popover = within(await screen.findByRole("dialog", { name: /Edit Skills/ }));
    await user.selectOptions(popover.getByRole("combobox", { name: "Add skill" }), "Acrobatics");
    await user.selectOptions(popover.getByRole("combobox", { name: "Acrobatics mode" }), "Custom");
    await user.type(popover.getByRole("textbox", { name: "Acrobatics modifier" }), "+9");
    await user.selectOptions(popover.getByRole("combobox", { name: "skill 2" }), "Stealth");
    await user.click(popover.getByRole("button", { name: "Done" }));

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data.skills).toEqual({ athletics: "+2", stealth: "+9" });
  });
});

describe("review corrections: settings in the preview (04-R5)", () => {
  beforeEach(() => installMatchMedia(1280, { pointer: "coarse" }));

  test("a settings toggle is a draft edit, and Save PATCHes only that setting after a PUT without settings", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(mara.templateId);
    const scope = await startEditing(user, "Mara");

    const featured = within(scope()).getByRole("checkbox", { name: /Featured NPC/ });
    expect(within(scope()).getByRole("checkbox", { name: /death saves/ })).toBeChecked();
    await user.click(featured);
    expect(featured).toBeChecked();
    expect(within(scope()).getByRole("toolbar", { name: "Editing" })).toHaveTextContent("Editing · 1 change");
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(puts).toHaveLength(1);
    expect(puts[0]?.data).not.toHaveProperty("settings");
    expect(patches[0]).toEqual({ id: mara.templateId, body: { compendium: { featured: true } } });
  });

  test("07-R1: turning off an NPC's enabled death saves sends an explicit false setting only on Save", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(mara.templateId);
    const scope = await startEditing(user, "Mara");

    const deathSaves = within(scope()).getByRole("checkbox", { name: /death saves/ });
    expect(deathSaves).toBeChecked();
    await user.click(deathSaves);

    expect(deathSaves).not.toBeChecked();
    expect(within(scope()).getByRole("toolbar", { name: "Editing" })).toHaveTextContent("Editing · 1 change");
    expect(puts).toHaveLength(0);
    expect(patches).toHaveLength(0);

    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(puts).toHaveLength(1);
    expect(puts[0]?.data).not.toHaveProperty("settings");
    expect(patches[0]).toEqual({ id: mara.templateId, body: { combat: { deathSaves: false } } });
  });
});

describe("review corrections: leaving the preview (04-R6)", () => {
  test("selecting another entity and coming back opens the sheet in view mode, not a blank draft", async () => {
    installMatchMedia(1280, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");
    await user.click(within(scope()).getByRole("button", { name: "+ Languages" }));
    const popover = within(await screen.findByRole("dialog", { name: "Edit Languages" }));
    await user.type(popover.getByRole("textbox", { name: "Languages" }), "Goblin{Enter}");
    await user.click(popover.getByRole("button", { name: "Done" }));

    // jsdom's zero-size panes make react-resizable-panels cancel clicks; press rows with mousedown.
    await act(async () => void fireEvent.mouseDown(await screen.findByRole("option", { name: /^Mara/ })));
    expect(await screen.findByRole("article", { name: "Mara" })).toBeVisible();
    expect(screen.queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    await act(async () => void fireEvent.mouseDown(screen.getByRole("option", { name: /^Goblin/ })));

    expect(await screen.findByRole("article", { name: "Goblin" })).toBeVisible();
    expect(screen.queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    expect(within(details()).queryByRole("button", { name: /^Edit Armor Class/ })).not.toBeInTheDocument();
  });

  test("closing and reopening the narrow reader does not resume the preview", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    await startEditing(user, "Goblin");
    expect(screen.getByRole("toolbar", { name: "Editing" })).toBeVisible();

    // Escape with no field editor open closes the reader.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Goblin" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("option", { name: /^Goblin/ }));

    const dialog = await screen.findByRole("dialog", { name: "Goblin" });
    expect(within(dialog).queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Edit Armor Class/ })).not.toBeInTheDocument();
  });
});

describe("review corrections: field limits follow the write contract (04-R7)", () => {
  beforeEach(() => installMatchMedia(1280, { pointer: "coarse" }));

  test("AC, HP and speed accept the contract's whole numbers, and the PUT passes the shared validator", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("100{Enter}");
    await user.click(within(scope()).getByRole("button", { name: "Edit Strength score, 10" }));
    await user.keyboard("31{Enter}");
    await user.click(within(scope()).getByRole("button", { name: "Edit HP, 7" }));
    let popover = within(await screen.findByRole("dialog", { name: /Edit HP/ }));
    await user.clear(popover.getByRole("textbox", { name: "Hit points" }));
    await user.type(popover.getByRole("textbox", { name: "Hit points" }), "100000");
    await user.click(popover.getByRole("button", { name: "Done" }));
    await user.click(within(scope()).getByRole("button", { name: "Edit Speed, 30 ft." }));
    popover = within(await screen.findByRole("dialog", { name: /Edit Speed/ }));
    await user.clear(popover.getByRole("textbox", { name: "Feet 1" }));
    await user.type(popover.getByRole("textbox", { name: "Feet 1" }), "10000");
    await user.click(popover.getByRole("button", { name: "Done" }));

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ ac: 100, hp: 100000, speeds: { walk: 10000 }, abilityScores: { str: 31 } });
    expect(validateDnD5eEntityWrite(lastPut(puts).data, "update").ok).toBe(true);
  });

  test("a number past the contract's bound keeps the field open with a message", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("2147483648{Enter}");

    expect(await within(scope()).findByRole("alert")).toHaveTextContent(/2147483647/);
    expect(within(scope()).getByRole("textbox", { name: "Armor Class" })).toBeVisible();
  });

  test("an ability score is capped at 40, a game-rule limit below the contract's", async () => {
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: "Edit Strength score, 10" }));
    await user.keyboard("41{Enter}");
    expect(await within(scope()).findByRole("alert")).toHaveTextContent("A whole number from 0 to 40.");
    await user.keyboard("{Control>}a{/Control}40{Enter}");
    expect(within(scope()).getByRole("button", { name: "Edit Strength score, 40" })).toBeVisible();
  });

  test("a sense over 128 characters is rejected in the editor instead of failing the save", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: /^Edit Senses/ }));
    const popover = within(await screen.findByRole("dialog", { name: /Edit Senses/ }));
    const senses = popover.getByRole("textbox", { name: "Senses" });
    await user.click(senses);
    await user.paste("x".repeat(129));
    await user.keyboard("{Enter}");
    await user.click(popover.getByRole("button", { name: "Done" }));

    expect(await popover.findByRole("alert")).toHaveTextContent(/At most 128 characters/);
    expect(screen.getByRole("dialog", { name: /Edit Senses/ })).toBeVisible();

    await user.click(popover.getByRole("button", { name: /^Remove x/ }));
    await user.click(senses);
    await user.paste("x".repeat(128));
    await user.keyboard("{Enter}");
    await user.click(popover.getByRole("button", { name: "Done" }));
    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(validateDnD5eEntityWrite(lastPut(puts).data, "update").ok).toBe(true);
  });

  test("text limits count characters, not UTF-16 units: 64 emoji fit a creature type, 65 do not", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: /^Edit Type/ }));
    const popover = within(await screen.findByRole("dialog", { name: /Edit Type/ }));
    const type = popover.getByRole("combobox", { name: "Creature type" });
    await user.clear(type);
    await user.click(type);
    await user.paste("😀".repeat(65));
    await user.click(popover.getByRole("button", { name: "Done" }));
    expect(await popover.findByRole("alert")).toHaveTextContent(/Creature type: At most 64 characters/);

    await user.clear(type);
    await user.click(type);
    await user.paste("😀".repeat(64));
    await user.click(popover.getByRole("button", { name: "Done" }));
    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(validateDnD5eEntityWrite(lastPut(puts).data, "update").ok).toBe(true);
  });
});

describe("open Step 04 review findings", () => {
  test.each([
    { target: /\+ Languages/, label: "Languages", value: "Elvish", field: "languages" },
    { target: /Edit Senses/, label: "Senses", value: "darkvision 60 ft.", field: "senses" },
    { target: /Edit Type/, label: "Type tags", value: "goblinoid", field: "typeTags" },
  ])("04-R1: Save includes pending $label text before Add", async ({ target, label, value, field }) => {
    installMatchMedia(720);
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: /Edit Armor Class/ }));
    await user.keyboard("16{Enter}");
    await user.click(within(scope()).getByRole("button", { name: target }));
    await user.type(within(scope()).getByRole("textbox", { name: label }), value);
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ ac: 16, [field]: [value] });
  });

  test("04-R1: Save keeps a pending invalid sense open", async () => {
    installMatchMedia(720);
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: /Edit Senses/ }));
    const senses = within(scope()).getByRole("textbox", { name: "Senses" });
    await user.click(senses);
    await user.paste("x".repeat(129));
    await user.click(within(scope()).getByRole("button", { name: "Save" }));

    expect(await within(scope()).findByRole("alert")).toHaveTextContent(/At most 128 characters/);
    expect(senses).toHaveValue("x".repeat(129));
    expect(puts).toHaveLength(0);
  });

  test("04-R2: Escape on the expanded trigger closes the field before the reader", async () => {
    installMatchMedia(720);
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: /Edit Armor Class/ }));
    await user.keyboard("16{Enter}");
    const trigger = within(scope()).getByRole("button", { name: /Edit Type/ });
    await user.click(trigger);
    // The dialog focus trap sees no laid-out controls in jsdom. Move to the trigger as Shift+Tab does in Chrome.
    trigger.focus();
    expect(trigger).toHaveFocus();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("dialog", { name: "Goblin" })).toBeVisible();
    expect(trigger).toHaveFocus();
    expect(within(scope()).queryByRole("group", { name: /Edit Type/ })).not.toBeInTheDocument();
    expect(within(scope()).getByRole("button", { name: "Edit Armor Class, 16" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Goblin" })).not.toBeInTheDocument();
  });

  test.each([1280, 720])("04-R6: crossing the reader breakpoint from %i keeps the draft in edit mode", async width => {
    installMatchMedia(width, { pointer: "coarse" });
    const user = userEvent.setup();
    serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");
    await user.click(within(scope()).getByRole("button", { name: /Edit Armor Class/ }));
    await user.keyboard("20{Enter}");
    expect(within(scope()).getByRole("button", { name: "Edit Armor Class, 20" })).toBeVisible();

    // From 1280 the narrow reader opens by itself, without choosing the row again (06-R2).
    setViewportWidth(width === 720 ? 1280 : 720);

    const reader = width === 720 ? details() : await screen.findByRole("dialog", { name: "Goblin" });
    expect(within(reader).getByRole("toolbar", { name: "Editing" })).toHaveTextContent("Editing · 1 change");
    expect(within(reader).getByRole("button", { name: "Edit Armor Class, 20" })).toBeVisible();
  });

  test("04-R7: invalid derived passive Perception blocks Save and the boundary value saves", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");
    await user.click(within(scope()).getByRole("button", { name: /\+ Skills/ }));
    const skills = within(await screen.findByRole("dialog", { name: /Edit Skills/ }));
    await user.selectOptions(skills.getByRole("combobox", { name: "Add skill" }), "Perception");
    await user.selectOptions(skills.getByRole("combobox", { name: "Perception mode" }), "Custom");
    const modifier = skills.getByRole("textbox", { name: "Perception modifier" });

    for (const invalid of ["+32758", "-11"]) {
      await user.clear(modifier);
      await user.type(modifier, invalid);
      await user.click(within(scope()).getByRole("button", { name: "Save" }));
      expect(await skills.findByRole("alert")).toHaveTextContent(/Automatic Passive Perception/);
      expect(modifier).toHaveValue(invalid);
      expect(puts).toHaveLength(0);
    }

    await user.clear(modifier);
    await user.type(modifier, "+32757");
    await user.click(skills.getByRole("button", { name: "Done" }));
    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ skills: { perception: "+32757" }, passivePerception: 32767 });
    expect(validateDnD5eEntityWrite(lastPut(puts).data, "update").ok).toBe(true);
  });

  test("04-R7: manual passive Perception is preserved and invalid automatic mode stays open", async () => {
    const user = userEvent.setup();
    const puts = serveCatalog();
    renderSheet(goblin.templateId);
    const scope = await startEditing(user, "Goblin");

    await user.click(within(scope()).getByRole("button", { name: /Edit Senses/ }));
    let senses = within(await screen.findByRole("dialog", { name: /Edit Senses/ }));
    await user.click(senses.getByRole("checkbox", { name: /Passive Perception from Perception/ }));
    const passive = senses.getByRole("textbox", { name: "Passive Perception" });
    await user.clear(passive);
    await user.type(passive, "12");
    await user.click(senses.getByRole("button", { name: "Done" }));

    await user.click(within(scope()).getByRole("button", { name: /\+ Skills/ }));
    const skills = within(await screen.findByRole("dialog", { name: /Edit Skills/ }));
    await user.selectOptions(skills.getByRole("combobox", { name: "Add skill" }), "Perception");
    await user.selectOptions(skills.getByRole("combobox", { name: "Perception mode" }), "Custom");
    await user.type(skills.getByRole("textbox", { name: "Perception modifier" }), "+32758");
    await user.click(skills.getByRole("button", { name: "Done" }));

    await user.click(within(scope()).getByRole("button", { name: /Edit Senses/ }));
    senses = within(await screen.findByRole("dialog", { name: /Edit Senses/ }));
    await user.click(senses.getByRole("checkbox", { name: /Passive Perception from Perception/ }));
    await user.click(senses.getByRole("button", { name: "Done" }));
    expect(await senses.findByRole("alert")).toHaveTextContent(/Automatic Passive Perception/);
    await user.click(senses.getByRole("button", { name: "Cancel" }));

    await user.click(within(scope()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(lastPut(puts).data).toMatchObject({ skills: { perception: "+32758" }, passivePerception: 12 });
    expect(validateDnD5eEntityWrite(lastPut(puts).data, "update").ok).toBe(true);
  });
});
