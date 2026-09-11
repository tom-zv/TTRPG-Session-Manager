import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import {
  validateDnD5eEntityWrite,
  type CreateEntityRequest,
  type UpdateEntityBody,
} from "shared/domain/encounters/dnd5e/entityValidation.js";
import { installLayoutApis, installMatchMedia, setViewportWidth } from "src/test/fakes/matchMedia.js";
import { apiError, json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl, go } from "src/test/routerProbe.js";
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
  featuredNpc: entity.role === "npc" && entity.settings?.compendium?.featured === true,
  source: entity.source,
  page: entity.page,
  imported: entity.imported,
  locallyEdited: entity.locallyEdited,
});

const goblin = template(14, "Goblin", {
  cr: "1/4", creatureType: "humanoid", size: "small", hp: 7,
  actions: [{ name: "Scimitar", description: "Melee attack.", actionType: "action" }],
});
const mara = template(13, "Mara", { role: "npc", cr: "2", settings: { combat: { deathSaves: true } } });
// An imported monster, as the importer stores it.
const owlbear = template(15, "Owlbear", {
  cr: "3", source: "MM", page: 249, imported: true, creatureType: "monstrosity", size: "large", hp: 59,
  actions: [{ name: "Beak", description: "Melee attack.", actionType: "action" }],
});
// Stored before the write contract limited entry names to 64 characters.
const legacy = template(16, "Ogre", { traits: [{ name: "x".repeat(70), description: "Old text." }] });

const gm = testUser({ id: 1, username: "gm", isGm: true });

type Requests = {
  posts: CreateEntityRequest[];
  puts: Array<{ id: number; body: UpdateEntityBody }>;
  patches: Array<{ id: number; body: unknown }>;
  inventoryPuts: number;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

// The entity endpoints over an in-memory catalog. POST stores a homebrew template under the next
// ID; `rejectPut` and `rejectPost` answer with a 400 carrying the write contract's issues.
function serveCatalog(
  initial: DnD5eEntityDetails[],
  options: {
    rejectPut?: { path: string; message: string }[];
    rejectPost?: { path: string; message: string }[];
    holdPost?: Promise<void>;
    patchFailures?: number;
  } = {},
) {
  const store = new Map(initial.map(entity => [entity.templateId, entity]));
  let nextId = 101;
  let patchAttempts = 0;
  const requests: Requests = { posts: [], puts: [], patches: [], inventoryPuts: 0 };
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: [] })),
    http.get("/api/dnd5e/entities/summary", () => json({ entities: [...store.values()].map(toSummary) })),
    http.post("/api/dnd5e/entities/batch", async ({ request }) => {
      const { entityIds } = (await request.json()) as { entityIds: number[] };
      return json({ entities: entityIds.flatMap(id => store.get(id) ?? []) });
    }),
    http.post("/api/dnd5e/entities", async ({ request }) => {
      const { data } = (await request.json()) as { data: CreateEntityRequest };
      requests.posts.push(data);
      await options.holdPost;
      if (options.rejectPost) return json({ message: "Invalid entity data.", details: options.rejectPost }, 400);
      const entity: DnD5eEntityDetails = {
        ...data, templateId: nextId++, createdAt: "2026-02-01T00:00:00.000Z", source: "homebrew", imported: false, locallyEdited: false,
      };
      store.set(entity.templateId, entity);
      return json({ insertId: entity.templateId, entity }, 201);
    }),
    http.put("/api/dnd5e/entities/:id", async ({ params, request }) => {
      const id = Number(params.id);
      const body = (await request.json()) as UpdateEntityBody;
      requests.puts.push({ id, body });
      if (options.rejectPut) return json({ message: "Invalid entity data.", details: options.rejectPut }, 400);
      const stored = store.get(id)!;
      const entity: DnD5eEntityDetails = { ...stored, ...body.data, templateId: id, locallyEdited: stored.imported } as DnD5eEntityDetails;
      store.set(id, entity);
      return json({ entity });
    }),
    http.patch("/api/dnd5e/entities/:id/settings", async ({ params, request }) => {
      const id = Number(params.id);
      const body: unknown = await request.json();
      requests.patches.push({ id, body });
      patchAttempts += 1;
      if (patchAttempts <= (options.patchFailures ?? 0)) return apiError(503, "Settings unavailable");
      return json({ settings: store.get(id)?.settings ?? {} });
    }),
    http.put("/api/dnd5e/entities/:id/inventory", () => {
      requests.inventoryPuts += 1;
      return json({ items: [], revision: 1 });
    }),
  );
  return requests;
}

const render = (route: string) => {
  localStorage.setItem("test-user-id", String(gm.id));
  localStorage.setItem("test-user-gm", "true");
  return renderWithProviders(<><Compendium /><RouterProbe /></>, { route, user: gm });
};

type User = ReturnType<typeof userEvent.setup>;
const details = () => within(screen.getByLabelText("Entity details"));
const toolbar = () => within(details().getByRole("toolbar", { name: "Editing" }));
// jsdom's zero-size panes make react-resizable-panels cancel clicks; press rows with mousedown.
const pressRow = (name: string) => act(() => void fireEvent.mouseDown(screen.getByRole("option", { name: new RegExp(`^${name}`) })));

const startEditing = async (user: User, name: string, item = "Edit") => {
  await screen.findByRole("article", { name });
  await user.click(details().getByRole("button", { name: `Actions for ${name}` }));
  await user.click(screen.getByRole("menuitem", { name: item }));
};
const setAc = async (user: User, from: number, to: number) => {
  await user.click(details().getByRole("button", { name: `Edit Armor Class, ${from}` }));
  await user.keyboard(`${to}{Enter}`);
};
const replaceText = async (user: User, field: HTMLElement, value: string) => {
  act(() => {
    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.select();
  });
  await user.keyboard(value || "{Backspace}");
};

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280, { pointer: "coarse" });
});

describe("saving an imported entity", () => {
  test("Save POSTs a homebrew copy, selects it, and leaves the original untouched", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin, owlbear]);
    render(`/compendium?entity=${owlbear.templateId}`);
    await startEditing(user, "Owlbear");

    expect(details().getByRole("note")).toHaveTextContent("Saving creates a homebrew copy. The imported Owlbear (MM) is unchanged.");
    await setAc(user, 12, 14);
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=101"));
    expect(requests.puts).toEqual([]);
    expect(requests.posts).toHaveLength(1);
    expect(requests.posts[0]).toMatchObject({ name: "Owlbear", ac: 14, hp: 59, actions: [{ name: "Beak" }] });
    expect(validateDnD5eEntityWrite(requests.posts[0], "create").ok).toBe(true);
    expect(await screen.findByRole("article", { name: "Owlbear" })).toBeVisible();
    expect(details().getByText("Homebrew")).toBeVisible();
    expect(details().queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Owlbear.*Homebrew/ })).toHaveAttribute("aria-selected", "true");

    // The imported original is still listed and still reads as before.
    await pressRow("Owlbear.*MM");
    expect(await details().findByRole("article", { name: "Owlbear" })).toBeVisible();
    expect(details().getByText("AC").nextElementSibling).toHaveTextContent("12");
  });

  test("Edit the original instead, once confirmed, PUTs with overwriteImported; Save as a copy returns to POST", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([owlbear]);
    render(`/compendium?entity=${owlbear.templateId}`);
    await startEditing(user, "Owlbear");
    await setAc(user, 12, 14);

    await user.click(details().getByRole("button", { name: "Edit the original instead" }));
    const confirm = within(details().getByRole("group", { name: "Edit the imported Owlbear?" }));
    expect(confirm.getByText(/Re-imports will skip Owlbear, and the encounters that use it will change/)).toBeVisible();
    expect(confirm.getByRole("button", { name: "Keep saving a copy" })).toHaveFocus();
    await user.click(confirm.getByRole("button", { name: "Edit the original" }));

    expect(details().getByRole("note")).toHaveTextContent("Saving changes the imported Owlbear (MM) itself.");
    // Switching back and forth again ends on overwrite: the choice is not part of Undo.
    await user.click(details().getByRole("button", { name: "Save as a copy instead" }));
    await user.click(details().getByRole("button", { name: "Edit the original instead" }));
    await user.click(details().getByRole("button", { name: "Edit the original" }));
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requests.puts).toHaveLength(1));
    expect(requests.posts).toEqual([]);
    expect(requests.puts[0]).toMatchObject({ id: owlbear.templateId, body: { overwriteImported: true, data: { ac: 14 } } });
    expect(requests.puts[0]?.body.data).not.toHaveProperty("settings");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${owlbear.templateId}`));
    expect(await details().findByText("Edited")).toBeVisible();
  });
});

describe("the draft slot", () => {
  test("selecting another entity keeps the draft in an unsaved bar, and Resume restores it", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin, mara]);
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}&edit=1`));
    await setAc(user, 12, 15);

    await pressRow("Mara");
    expect(await details().findByRole("article", { name: "Mara" })).toBeVisible();
    expect(details().queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }));
    expect(bar.getByText("Unsaved changes to Goblin")).toBeVisible();

    await user.click(bar.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}&edit=1`));
    expect(toolbar().getByText("Editing · 1 change")).toBeVisible();
    expect(details().getByRole("button", { name: "Edit Armor Class, 15" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();

    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.puts).toHaveLength(1));
    expect(requests.puts[0]?.body.data.ac).toBe(15);
  });

  test("Back leaves edit mode, Discard drops the draft, and the page warns before unloading only while there are changes", async () => {
    const user = userEvent.setup();
    serveCatalog([goblin, mara]);
    render(`/compendium?entity=${goblin.templateId}`);
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    await startEditing(user, "Goblin");
    expect(unload()).toBe(false);
    await setAc(user, 12, 15);
    expect(unload()).toBe(true);

    await go(-1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    expect(details().getByText("AC").nextElementSibling).toHaveTextContent("12");
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }));
    await user.click(bar.getByRole("button", { name: "Discard" }));

    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
    expect(unload()).toBe(false);
    await startEditing(user, "Goblin");
    expect(details().getByRole("button", { name: "Edit Armor Class, 12" })).toBeVisible();
  });

  test("a draft without changes is dropped when edit mode ends, and Ctrl+Z undoes a committed edit", async () => {
    const user = userEvent.setup();
    serveCatalog([goblin, mara]);
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin");
    await setAc(user, 12, 15);
    expect(details().getByRole("button", { name: "Edit Armor Class, 15" })).toHaveFocus();

    await user.keyboard("{Control>}z{/Control}");
    expect(details().getByRole("button", { name: "Edit Armor Class, 12" })).toBeVisible();
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(details().getByRole("button", { name: "Edit Armor Class, 15" })).toBeVisible();
    await user.keyboard("{Control>}z{/Control}");

    // Back to the loaded values: Cancel needs no confirm, and leaving keeps nothing aside.
    await user.click(toolbar().getByRole("button", { name: "Cancel" }));
    expect(details().queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    await pressRow("Mara");
    expect(await details().findByRole("article", { name: "Mara" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });
});

describe("creating", () => {
  test("?entity=new opens a default draft in edit mode, saves through POST and lands on the new ID", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin]);
    render("/compendium?entity=new");

    expect(await screen.findByRole("article", { name: "New Entity" })).toBeVisible();
    expect(toolbar().getByText("New entity")).toBeVisible();
    expect(details().getByRole("button", { name: "Edit Armor Class, 10" })).toBeVisible();
    await user.click(details().getByRole("button", { name: "Edit Name, New Entity" }));
    await user.keyboard("Wolf{Enter}");
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=101"));
    expect(requests.posts).toEqual([expect.objectContaining({
      name: "Wolf", role: "creature", ac: 10, hp: 1, speeds: { walk: 30 }, size: "medium", alignment: "unaligned",
      abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, settings: {},
    })]);
    expect(await details().findByRole("article", { name: "Wolf" })).toBeVisible();
    expect(details().queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Wolf/ })).toHaveAttribute("aria-selected", "true");
  });

  test("Duplicate opens ?entity=new&from=<id> with the stat block and POSTs it without the original's settings", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([mara]);
    render(`/compendium?entity=${mara.templateId}`);
    await startEditing(user, "Mara", "Duplicate");

    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=new&from=${mara.templateId}`));
    expect(details().getByRole("checkbox", { name: /death saves/ })).not.toBeChecked();
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requests.posts).toHaveLength(1));
    expect(requests.posts[0]).toMatchObject({ name: "Mara", role: "npc", cr: "2", ac: 12 });
    expect(requests.posts[0]).not.toHaveProperty("settings");
    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=101"));
  });
});

describe("validation", () => {
  test("a draft the write contract rejects sends nothing; the issue lists its place and opens its editor", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([legacy]);
    render(`/compendium?entity=${legacy.templateId}`);
    await startEditing(user, "Ogre");
    await setAc(user, 12, 13);
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    expect(await details().findByRole("alert")).toHaveTextContent("Not saved. Fix 1 issue first.");
    expect(requests.puts).toEqual([]);
    // The first issue's editor opens at once; the list stays for the others.
    expect(details().getByRole("textbox", { name: /^Name of x{70}, Traits$/ })).toHaveFocus();
    const issues = within(details().getByRole("list", { name: "Issues" }));
    expect(issues.getByRole("button", { name: /^Traits: x{70}: Must have at most 64 characters\.$/ })).toBeVisible();
    expect(toolbar().getByRole("button", { name: "1 issue" })).toHaveAttribute("aria-expanded", "true");
  });

  test("a server 400 opens the editor its first issue points at, and lists every issue", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin], {
      rejectPut: [
        { path: "actions.0.name", message: "Must not be empty." },
        { path: "abilityScores.dex", message: "Must be a whole number from 0 to 255." },
      ],
    });
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin");
    await setAc(user, 12, 13);
    await user.click(toolbar().getByRole("button", { name: "Save" }));

    await waitFor(() => expect(requests.puts).toHaveLength(1));
    expect(await details().findByRole("alert")).toHaveTextContent("Invalid entity data.");
    expect(details().getByRole("textbox", { name: "Name of Scimitar, Actions" })).toHaveFocus();
    const issues = within(details().getByRole("list", { name: "Issues" }));
    expect(issues.getByRole("button", { name: "Actions: Scimitar: Must not be empty." })).toBeVisible();

    // Each issue jumps to its own editor.
    await user.click(issues.getByRole("button", { name: "Dexterity: Must be a whole number from 0 to 255." }));
    expect(details().getByRole("textbox", { name: "Dexterity score" })).toHaveFocus();
    expect(details().getByRole("toolbar", { name: "Editing" })).toBeVisible();
  });
});

describe("the narrow reader", () => {
  test("closing the dialog leaves edit mode with the draft in the unsaved bar; New entity opens its draft in the dialog", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCatalog([goblin]);
    render(`/compendium?entity=${goblin.templateId}`);
    const reader = () => within(screen.getByRole("dialog", { name: "Goblin" }));
    await within(await screen.findByRole("dialog", { name: "Goblin" })).findByRole("article", { name: "Goblin" });
    await user.click(reader().getByRole("button", { name: "Actions for Goblin" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(reader().getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("15{Enter}");

    // Escape with no field editor open closes the reader.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Goblin" })).not.toBeInTheDocument());
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }));
    await user.click(bar.getByRole("button", { name: "Resume" }));
    expect(within(await screen.findByRole("dialog", { name: "Goblin" })).getByRole("button", { name: "Edit Armor Class, 15" })).toBeVisible();

    await user.click(reader().getByRole("button", { name: "Cancel" }));
    await user.click(reader().getByRole("button", { name: "Discard changes" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Goblin" })).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "New entity" }));
    const created = within(await screen.findByRole("dialog", { name: "New entity" }));
    expect(created.getByRole("toolbar", { name: "Editing" })).toBeVisible();
    expect(created.getByRole("button", { name: "Edit Name, New Entity" })).toBeVisible();
  });
});

describe("Step 06 corrections", () => {
  test("06-R1: a late save cannot select over or overwrite a newer draft", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const requests = serveCatalog([goblin], { holdPost: gate.promise });
    render("/compendium?entity=new");
    await screen.findByRole("article", { name: "New Entity" });
    await user.click(details().getByRole("button", { name: "Edit Name, New Entity" }));
    await user.keyboard("Wolf{Enter}");
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(1));
    expect(toolbar().getByRole("button", { name: "Saving…" })).toBeDisabled();

    await pressRow("Goblin");
    await waitFor(() => expect(screen.getByRole("region", { name: "Unsaved changes" })).toBeVisible());
    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }));
    await user.click(bar.getByRole("button", { name: "Resume" }));
    expect(toolbar().getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.click(details().getByRole("button", { name: "Edit Armor Class, 10" }));
    expect(details().queryByRole("textbox", { name: "Armor Class" })).not.toBeInTheDocument();

    await pressRow("Goblin");
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Discard" }));
    await startEditing(user, "Goblin");
    await setAc(user, 12, 15);

    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.getByRole("option", { name: /^Wolf/ })).toBeVisible());
    expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}&edit=1`);
    expect(details().getByRole("button", { name: "Edit Armor Class, 15" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  test("06-R1: a pending create of an unchanged draft survives Back and Forward, and cannot be sent twice", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const requests = serveCatalog([goblin], { holdPost: gate.promise });
    render(`/compendium?entity=${goblin.templateId}`);
    await screen.findByRole("article", { name: "Goblin" });
    await user.click(screen.getByRole("button", { name: "New entity" }));
    await screen.findByRole("article", { name: "New Entity" });
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(1));

    await go(-1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("Unsaved changes to New Entity");
    await go(1);
    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=new"));
    expect(toolbar().getByRole("button", { name: "Saving…" })).toBeDisabled();
    await user.click(toolbar().getByRole("button", { name: "Saving…" }));

    await act(async () => gate.resolve());
    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=101"));
    expect(requests.posts).toHaveLength(1);
    expect(screen.getAllByRole("option", { name: /^New Entity/ })).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  test("06-R1: the destination of an imported entity's save cannot change while it is in flight", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const requests = serveCatalog([owlbear], { holdPost: gate.promise });
    render(`/compendium?entity=${owlbear.templateId}`);
    await startEditing(user, "Owlbear");
    await setAc(user, 12, 14);
    await user.click(details().getByRole("button", { name: "Edit the original instead" }));
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(1));

    const confirm = within(details().getByRole("group", { name: "Edit the imported Owlbear?" }));
    expect(confirm.getByRole("button", { name: "Edit the original" })).toBeDisabled();
    await user.click(confirm.getByRole("button", { name: "Keep saving a copy" }));
    expect(details().getByRole("button", { name: "Edit the original instead" })).toBeDisabled();
    expect(details().getByRole("note")).toHaveTextContent("Saving creates a homebrew copy.");

    await act(async () => gate.resolve());
    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=101"));
    expect(requests.puts).toEqual([]);
    expect(requests.posts).toHaveLength(1);
  });

  test("06-R2: a valid open editor settles before navigation, Cancel and unload; an invalid one stays", async () => {
    const user = userEvent.setup();
    serveCatalog([goblin, mara]);
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin");
    await user.click(details().getByRole("button", { name: "Edit Name of Scimitar, Actions" }));
    const name = details().getByRole("textbox", { name: "Name of Scimitar, Actions" });
    await replaceText(user, name, "Pending Scimitar");
    expect(name).toHaveValue("Pending Scimitar");

    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(unload()).toBe(true);
    expect(details().getByRole("textbox", { name: "Name of Scimitar, Actions" })).toHaveValue("Pending Scimitar");
    await replaceText(user, name, "Later Scimitar");
    await pressRow("Mara");
    expect(await details().findByRole("article", { name: "Mara" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("Unsaved changes to Goblin");

    const bar = within(screen.getByRole("region", { name: "Unsaved changes" }));
    await user.click(bar.getByRole("button", { name: "Resume" }));
    expect(details().getByRole("button", { name: "Edit Name of Later Scimitar, Actions" })).toBeVisible();
    await user.click(details().getByRole("button", { name: "Edit Name of Later Scimitar, Actions" }));
    await replaceText(user, details().getByRole("textbox", { name: "Name of Later Scimitar, Actions" }), "Final Scimitar");
    await user.click(toolbar().getByRole("button", { name: "Cancel" }));
    const confirm = within(details().getByRole("group", { name: "Discard unsaved changes?" }));
    await user.click(confirm.getByRole("button", { name: "Keep editing" }));
    await user.click(details().getByRole("button", { name: "Edit Name of Final Scimitar, Actions" }));
    const invalid = details().getByRole("textbox", { name: "Name of Final Scimitar, Actions" });
    await replaceText(user, invalid, "");
    await pressRow("Mara");
    expect(invalid).toBeVisible();
    expect(invalid).toHaveAccessibleDescription("Name: This can't be empty.");
    await user.click(toolbar().getByRole("button", { name: "Cancel" }));
    expect(invalid).toHaveAccessibleDescription("Name: This can't be empty.");
    expect(details().queryByRole("group", { name: "Discard unsaved changes?" })).not.toBeInTheDocument();
  });

  test("06-R2: input typed into an open editor, as the first change, survives Back and returns with Forward and Resume", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin, mara]);
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin");
    await user.click(details().getByRole("button", { name: "Edit Name of Scimitar, Actions" }));
    await replaceText(user, details().getByRole("textbox", { name: "Name of Scimitar, Actions" }), "Pending Scimitar");

    await go(-1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    expect(details().queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("Unsaved changes to Goblin");

    await go(1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}&edit=1`));
    expect(details().getByRole("textbox", { name: "Name of Scimitar, Actions" })).toHaveValue("Pending Scimitar");

    await go(-1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    const name = details().getByRole("textbox", { name: "Name of Scimitar, Actions" });
    expect(name).toHaveValue("Pending Scimitar");
    await replaceText(user, name, "Pending Scimitar{Enter}");
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.puts).toHaveLength(1));
    expect(requests.puts[0]?.body.data.actions?.map(action => action.name)).toEqual(["Pending Scimitar"]);
  });

  test("06-R2: an open editor keeps its input, invalid or valid, across reader breakpoint remounts", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    const requests = serveCatalog([goblin]);
    render(`/compendium?entity=${goblin.templateId}`);
    const reader = () => within(screen.getByRole("dialog", { name: "Goblin" }));
    await within(await screen.findByRole("dialog", { name: "Goblin" })).findByRole("article", { name: "Goblin" });
    await user.click(reader().getByRole("button", { name: "Actions for Goblin" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(reader().getByRole("button", { name: "Edit Name of Scimitar, Actions" }));
    await replaceText(user, reader().getByRole("textbox", { name: "Name of Scimitar, Actions" }), "");

    // Close cannot settle an invalid editor, so the reader stays.
    await user.click(reader().getByRole("button", { name: "Close" }));
    expect(reader().getByRole("textbox", { name: "Name of Scimitar, Actions" })).toHaveAccessibleDescription("Name: This can't be empty.");

    // Wide with a mouse the sheet is live, and the open editor stays open there.
    setViewportWidth(1280);
    let name = details().getByRole("textbox", { name: "Name of Scimitar, Actions" });
    expect(name).toHaveValue("");
    expect(name).toHaveAccessibleDescription("Name: This can't be empty.");
    await replaceText(user, name, "Sharp Scimitar");

    setViewportWidth(800);
    name = reader().getByRole("textbox", { name: "Name of Scimitar, Actions" });
    expect(name).toHaveValue("Sharp Scimitar");
    await replaceText(user, name, "Sharp Scimitar{Enter}");
    await user.click(reader().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.puts).toHaveLength(1));
    expect(requests.puts[0]?.body.data.actions?.map(action => action.name)).toEqual(["Sharp Scimitar"]);
  });

  test("06-R2: at narrow width, Forward to the selected row's edit URL reopens the closed reader with its open editor", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    const requests = serveCatalog([goblin]);
    render(`/compendium?entity=${goblin.templateId}`);
    const reader = () => within(screen.getByRole("dialog", { name: "Goblin" }));
    await within(await screen.findByRole("dialog", { name: "Goblin" })).findByRole("article", { name: "Goblin" });
    await user.click(reader().getByRole("button", { name: "Actions for Goblin" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));
    await user.click(reader().getByRole("button", { name: "Edit Name of Scimitar, Actions" }));
    await replaceText(user, reader().getByRole("textbox", { name: "Name of Scimitar, Actions" }), "Narrow Forward Scimitar");

    await go(-1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    expect(reader().queryByRole("toolbar", { name: "Editing" })).not.toBeInTheDocument();
    await user.click(reader().getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Goblin" })).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Unsaved changes" })).toHaveTextContent("Unsaved changes to Goblin");

    // The selection stays Goblin, so only the edit URL changes.
    await go(1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}&edit=1`));
    const name = within(await screen.findByRole("dialog", { name: "Goblin" })).getByRole("textbox", { name: "Name of Scimitar, Actions" });
    expect(name).toHaveValue("Narrow Forward Scimitar");
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).not.toBeInTheDocument();
    await replaceText(user, name, "Narrow Forward Scimitar{Enter}");
    await user.click(reader().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.puts).toHaveLength(1));
    expect(requests.puts[0]?.body.data.actions?.map(action => action.name)).toEqual(["Narrow Forward Scimitar"]);
  });

  test("06-R2: an edit first opened on desktop opens the narrow reader when the window narrows, and Close still settles it", async () => {
    const user = userEvent.setup();
    serveCatalog([goblin]);
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin");
    await user.click(details().getByRole("button", { name: "Edit Name of Scimitar, Actions" }));
    await replaceText(user, details().getByRole("textbox", { name: "Name of Scimitar, Actions" }), "Wide Scimitar");

    setViewportWidth(800);
    const reader = within(await screen.findByRole("dialog", { name: "Goblin" }));
    expect(reader.getByRole("textbox", { name: "Name of Scimitar, Actions" })).toHaveValue("Wide Scimitar");

    await user.click(reader.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Goblin" })).not.toBeInTheDocument());
    expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`);
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    const resumed = within(await screen.findByRole("dialog", { name: "Goblin" }));
    expect(resumed.getByRole("button", { name: "Edit Name of Wide Scimitar, Actions" })).toBeVisible();
    expect(resumed.getByRole("toolbar", { name: "Editing" })).toHaveTextContent("Editing · 1 change");
  });

  test("06-R7: a server 400 released after Back and Resume lists its issues and opens their editor in the resumed editor", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const requests = serveCatalog([goblin], {
      holdPost: gate.promise,
      rejectPost: [{ path: "actions.0.name", message: "The server rejects this name." }],
    });
    render(`/compendium?entity=${goblin.templateId}`);
    await startEditing(user, "Goblin", "Duplicate");
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=new&from=${goblin.templateId}`));
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(1));

    await go(-1);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${goblin.templateId}`));
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    expect(toolbar().getByRole("button", { name: "Saving…" })).toBeDisabled();

    await act(async () => gate.resolve());
    expect(await details().findByRole("alert")).toHaveTextContent("Invalid entity data.");
    expect(currentUrl()).toBe(`/compendium?entity=new&from=${goblin.templateId}`);
    const name = details().getByRole("textbox", { name: "Name of Scimitar, Actions" });
    expect(name).toHaveFocus();
    const issues = within(details().getByRole("list", { name: "Issues" }));
    expect(issues.getByRole("button", { name: "Actions: Scimitar: The server rejects this name." })).toBeVisible();
    expect(requests.posts).toHaveLength(1);

    // The issues stand until the next committed edit.
    await replaceText(user, name, "Bite{Enter}");
    expect(details().queryByRole("list", { name: "Issues" })).not.toBeInTheDocument();
    expect(requests.posts).toHaveLength(1);
  });

  test("06-R3: retrying a failed settings PATCH does not repeat an acknowledged stat PUT", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin, mara], { patchFailures: 1 });
    render(`/compendium?entity=${mara.templateId}`);
    await startEditing(user, "Mara");
    await setAc(user, 12, 14);
    await user.click(details().getByRole("checkbox", { name: /Featured NPC/ }));
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    expect(await details().findByRole("alert")).toHaveTextContent("The stat block was saved, but the behaviour settings were not: Settings unavailable");

    await pressRow("Goblin");
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    expect(details().getByRole("alert")).toHaveTextContent("The stat block was saved, but the behaviour settings were not");
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.patches).toHaveLength(2));
    expect(requests.puts).toHaveLength(1);
    expect(requests.puts[0]?.body.data.ac).toBe(14);
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${mara.templateId}`));
  });

  test("06-R3: a new stat edit after a partial save sends a new PUT before retrying settings", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([mara], { patchFailures: 1 });
    render(`/compendium?entity=${mara.templateId}`);
    await startEditing(user, "Mara");
    await setAc(user, 12, 14);
    await user.click(details().getByRole("checkbox", { name: /Featured NPC/ }));
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await details().findByRole("alert");

    await setAc(user, 14, 15);
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.puts).toHaveLength(2));
    expect(requests.puts.map(request => request.body.data.ac)).toEqual([14, 15]);
    expect(requests.patches).toHaveLength(2);
  });

  test("06-R3: after a partial save, Undo back to the loaded values is still a change to save and keep", async () => {
    const user = userEvent.setup();
    const requests = serveCatalog([goblin, mara], { patchFailures: 1 });
    render(`/compendium?entity=${mara.templateId}`);
    await startEditing(user, "Mara");
    await setAc(user, 12, 14);
    await user.click(details().getByRole("checkbox", { name: /Featured NPC/ }));
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await details().findByRole("alert");
    expect(requests.puts.map(request => request.body.data.ac)).toEqual([14]);

    await user.click(toolbar().getByRole("button", { name: "Undo" }));
    await user.click(toolbar().getByRole("button", { name: "Undo" }));
    expect(details().getByRole("button", { name: "Edit Armor Class, 12" })).toBeVisible();
    expect(details().getByRole("checkbox", { name: /Featured NPC/ })).not.toBeChecked();
    expect(toolbar().getByRole("button", { name: "Save" })).toBeEnabled();

    // The stored AC is 14 now, so the restored 12 is kept aside like any other change.
    await pressRow("Goblin");
    await user.click(within(screen.getByRole("region", { name: "Unsaved changes" })).getByRole("button", { name: "Resume" }));
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(currentUrl()).toBe(`/compendium?entity=${mara.templateId}`));
    expect(requests.puts.map(request => request.body.data.ac)).toEqual([14, 12]);
    // The settings are back to their stored values, so nothing is PATCHed again.
    expect(requests.patches).toHaveLength(1);
    expect(details().getByText("AC").nextElementSibling).toHaveTextContent("12");
  });

  test("06-R4: copy mode hides the original inventory and its POST carries no inventory", async () => {
    const user = userEvent.setup();
    const importedFeatured: DnD5eEntityDetails = {
      ...owlbear,
      templateId: 17,
      name: "Featured Owlbear",
      role: "npc",
      settings: { compendium: { featured: true } },
    };
    const requests = serveCatalog([importedFeatured]);
    render(`/compendium?entity=${importedFeatured.templateId}`);
    await startEditing(user, "Featured Owlbear");

    expect(details().queryByText("Inventory")).not.toBeInTheDocument();
    expect(details().queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    await setAc(user, 12, 14);
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(1));
    expect(requests.inventoryPuts).toBe(0);
    expect(requests.posts[0]).not.toHaveProperty("inventory");
  });

  test("06-R5: copy and Duplicate preserve an absent speed map", async () => {
    const user = userEvent.setup();
    const speedless = { ...owlbear, speeds: null } as unknown as DnD5eEntityDetails;
    const requests = serveCatalog([speedless]);
    render(`/compendium?entity=${speedless.templateId}`);
    await startEditing(user, "Owlbear");
    expect(details().getByText("Speed").nextElementSibling).toHaveTextContent("—");
    await setAc(user, 12, 14);
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(1));
    expect(requests.posts[0]?.speeds).toEqual({});

    await pressRow("Owlbear.*MM");
    await startEditing(user, "Owlbear", "Duplicate");
    await user.click(toolbar().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(requests.posts).toHaveLength(2));
    expect(requests.posts[1]?.speeds).toEqual({});
  });

  test("06-R6: Escape dismisses each narrow-reader confirmation and restores its origin", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    serveCatalog([owlbear]);
    render(`/compendium?entity=${owlbear.templateId}`);
    await screen.findByRole("dialog", { name: "Owlbear" });
    const reader = () => within(screen.getByRole("dialog", { name: "Owlbear" }));
    await reader().findByRole("article", { name: "Owlbear" });
    await user.click(reader().getByRole("button", { name: "Actions for Owlbear" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    await user.click(reader().getByRole("button", { name: "Edit the original instead" }));
    const overwrite = within(reader().getByRole("group", { name: "Edit the imported Owlbear?" }));
    expect(overwrite.getByRole("button", { name: "Keep saving a copy" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Owlbear" })).toBeVisible();
    expect(reader().queryByRole("group", { name: "Edit the imported Owlbear?" })).not.toBeInTheDocument();
    await waitFor(() => expect(reader().getByRole("button", { name: "Edit the original instead" })).toHaveFocus());
    await user.click(reader().getByRole("button", { name: "Edit the original instead" }));
    await user.click(reader().getByRole("button", { name: "Edit the original" }));
    await waitFor(() => expect(reader().getByRole("button", { name: "Save as a copy instead" })).toHaveFocus());

    await user.click(reader().getByRole("button", { name: "Edit Armor Class, 12" }));
    await user.keyboard("14{Enter}");
    await user.click(reader().getByRole("button", { name: "Cancel" }));
    const cancel = within(reader().getByRole("group", { name: "Discard unsaved changes?" }));
    expect(cancel.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Owlbear" })).toBeVisible();
    expect(reader().queryByRole("group", { name: "Discard unsaved changes?" })).not.toBeInTheDocument();
    await waitFor(() => expect(reader().getByRole("button", { name: "Cancel" })).toHaveFocus());
  });
});
