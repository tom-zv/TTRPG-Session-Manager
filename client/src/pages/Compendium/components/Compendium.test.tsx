import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, describe, expect, test } from "vitest";
import type { Spell, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { installLayoutApis, installMatchMedia, setViewportWidth } from "src/test/fakes/matchMedia.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { RouterProbe, currentUrl, go } from "src/test/routerProbe.js";
import { Compendium } from "./Compendium.js";

const summary = (id: number, name: string, level: number): SpellSummary => ({
  id,
  name,
  source: "PHB",
  level,
  school: "evocation",
  ritual: false,
  concentration: false,
  castingTime: "1 action",
  castingUnit: "action",
  components: { v: true, s: true, m: false },
  classes: ["wizard"],
  damageTypes: [],
  saves: [],
  aliases: [],
});

const SPELLS = [summary(1, "Fire Bolt", 0), summary(7, "Magic Missile", 1), summary(9, "Shield", 1)];

const detail = (spell: SpellSummary): Spell => ({
  ...spell,
  range: "120 feet",
  materialConsumed: false,
  duration: "Instantaneous",
  description: `${spell.name} description.`,
  conditions: [],
  locallyEdited: false,
});

const renderCompendium = (route: string) =>
  renderWithProviders(
    <>
      <Compendium />
      <RouterProbe />
    </>,
    { route, user: testUser({ isGm: false, username: "player" }) }
  );

const sectionTab = (name: string) => screen.getByRole("tab", { name });
const spellList = () => screen.findByRole("listbox", { name: "Spells" });
const spellOption = (name: string) => screen.getByRole("option", { name: new RegExp(`^${name}`) });

// In the desktop layout, react-resizable-panels hit-tests every pointerdown against its separator by
// geometry. jsdom reports zero-size rects, so each press looks like a separator grab and the library
// cancels it, suppressing the row's mousedown. Press rows there with the mousedown they listen for.
const pressRowInSplitPane = (option: HTMLElement) => act(() => void fireEvent.mouseDown(option));

beforeEach(() => {
  installLayoutApis();
  installMatchMedia(1280);
  server.use(
    http.get("/api/dnd5e/spells", () => json({ spells: SPELLS })),
    http.get("/api/dnd5e/spells/:id", ({ params }) => {
      const spell = SPELLS.find(candidate => candidate.id === Number(params.id));
      return spell ? json({ spell: detail(spell) }) : json({ message: "Spell not found" }, 404);
    }),
    // The player in these tests has no characters; Entities is covered in entities/Entities.test.tsx.
    http.get("/api/dnd5e/entities/mine", () => json({ entities: [] })),
    http.get("/api/dnd5e/entities/mine/:id", () => json({ message: "Character not found" }, 404))
  );
});

describe("Compendium sections and URL", () => {
  test("a first visit to /compendium opens Spells", async () => {
    renderCompendium("/compendium");

    expect(sectionTab("Spells")).toHaveAttribute("aria-selected", "true");
    expect(await spellList()).toBeVisible();
    await waitFor(() => expect(currentUrl()).toBe("/compendium?section=spells"));
  });

  test("an entity link opens Entities and keeps the ID, taking precedence over a spell ID", async () => {
    renderCompendium("/compendium?spell=7&entity=17");

    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Entities" })).toBeVisible();
    expect(screen.queryByRole("tabpanel", { name: "Spells" })).not.toBeInTheDocument();
    await waitFor(() => expect(currentUrl()).toBe("/compendium?entity=17"));
  });

  test("?section=entities opens the entity list without a selection", async () => {
    renderCompendium("/compendium?section=entities");

    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe("/compendium?section=entities");
  });

  test("following a spell link from Entities and going Back returns to Entities", async () => {
    renderCompendium("/compendium?entity=17");

    await go("/compendium?spell=7");
    expect(sectionTab("Spells")).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(spellOption("Magic Missile")).toHaveAttribute("aria-selected", "true"));

    await go(-1);
    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe("/compendium?entity=17");
  });

  test("each tab remembers its selection and the hidden tab never writes the URL", async () => {
    const user = userEvent.setup();
    renderCompendium("/compendium?spell=7&view=compact");
    await spellList();

    await user.click(sectionTab("Entities"));
    expect(currentUrl()).toBe("/compendium?view=compact&section=entities");

    await user.click(sectionTab("Spells"));
    await waitFor(() => expect(currentUrl()).toBe("/compendium?view=compact&spell=7"));
    expect(spellOption("Magic Missile")).toHaveAttribute("aria-selected", "true");

    // Back undoes the tab switch.
    await go(-1);
    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
    expect(currentUrl()).toBe("/compendium?view=compact&section=entities");
  });

  test("another page's URL is left alone, and a bare /compendium restores the last tab and selection", async () => {
    const user = userEvent.setup();
    renderCompendium("/compendium?spell=7");
    await spellList();
    await user.click(sectionTab("Entities"));

    await go("/encounter-manager?tab=encounters");
    await act(async () => {}); // let effects run
    expect(currentUrl()).toBe("/encounter-manager?tab=encounters");

    await go("/compendium");
    await waitFor(() => expect(currentUrl()).toBe("/compendium?section=entities"));
    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
  });
});

describe("Compendium mode switch", () => {
  test("arrow keys move between modes, select them and keep one tab in the Tab order", async () => {
    const user = userEvent.setup();
    renderCompendium("/compendium?spell=7");
    await spellList();

    sectionTab("Spells").focus();
    await user.keyboard("{ArrowRight}");
    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
    expect(sectionTab("Entities")).toHaveFocus();
    expect(sectionTab("Spells")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "Entities" })).toBeVisible();
    expect(currentUrl()).toBe("/compendium?section=entities");

    // Wraps around, and Home/End jump to the ends.
    await user.keyboard("{ArrowRight}");
    expect(sectionTab("Spells")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(sectionTab("Entities")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(sectionTab("Spells")).toHaveFocus();
    await waitFor(() => expect(currentUrl()).toBe("/compendium?spell=7"));
  });
});

describe("spell list keyboard and pointer selection", () => {
  test("arrow, Home and End keys select spells, and Enter moves focus to the details", async () => {
    const user = userEvent.setup();
    renderCompendium("/compendium");
    const list = await spellList();

    list.focus();
    await user.keyboard("{ArrowDown}");
    expect(spellOption("Fire Bolt")).toHaveAttribute("aria-selected", "true");
    expect(list).toHaveAttribute("aria-activedescendant", spellOption("Fire Bolt").id);
    await waitFor(() => expect(currentUrl()).toBe("/compendium?spell=1"));

    await user.keyboard("{End}");
    expect(spellOption("Shield")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}");
    expect(spellOption("Magic Missile")).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(spellOption("Fire Bolt")).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Enter}");
    const details = screen.getByLabelText("Spell details");
    expect(details).toHaveFocus();
    expect(await within(details).findByText("Fire Bolt description.")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("on a narrow screen a tap opens the details dialog, and closing it returns to the filtered list", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    renderCompendium("/compendium");
    const list = await spellList();

    await user.type(screen.getByRole("searchbox", { name: "Search spells by name" }), "s");
    await waitFor(() => expect(screen.queryByRole("option", { name: /^Fire Bolt/ })).not.toBeInTheDocument());

    // Arrow keys only move the selection; a tap opens the dialog.
    list.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(spellOption("Shield"));
    const dialog = await screen.findByRole("dialog", { name: "Shield" });
    expect(await within(dialog).findByText("Shield description.")).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("listbox", { name: "Spells" })).toHaveFocus());
    expect(screen.getByRole("searchbox", { name: "Search spells by name" })).toHaveValue("s");
    expect(spellOption("Shield")).toHaveAttribute("aria-selected", "true");
  });

  test("widening past 800 px replaces the dialog with the reader pane and keeps the filters", async () => {
    installMatchMedia(800);
    const user = userEvent.setup();
    renderCompendium("/compendium");
    await spellList();
    expect(screen.queryByLabelText("Spell details")).not.toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Search spells by name" }), "s");

    setViewportWidth(801);
    await pressRowInSplitPane(spellOption("Shield"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await within(screen.getByLabelText("Spell details")).findByText("Shield description.")).toBeVisible();
    // The column did not remount: the search survives the layout change.
    expect(screen.getByRole("searchbox", { name: "Search spells by name" })).toHaveValue("s");
  });

  test("details read in their own pane beside the finder column, not inside it", async () => {
    renderCompendium("/compendium?spell=7");
    await spellList();

    const details = screen.getByLabelText("Spell details");
    expect(await within(details).findByText("Magic Missile description.")).toBeVisible();
    expect(screen.getByRole("tabpanel", { name: "Spells" })).not.toContainElement(details);
    expect(screen.getByRole("tablist", { name: "Compendium sections" }).parentElement).not.toContainElement(details);
  });
});

// jsdom does no layout: give a scroller its sizes and position, then fire its scroll event. By
// default the reader scrolls with the wheel; byReader: false is a scroll nobody asked for.
const scrollPane = (
  element: HTMLElement,
  top: number,
  { scrollHeight = 2000, clientHeight = 400, byReader = true } = {}
) => {
  if (byReader) fireEvent.wheel(element);
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(element, "scrollTop", { configurable: true, value: top });
  fireEvent.scroll(element);
};

const filtersToggle = () => screen.getByRole("button", { name: "Filters" });
const filterTray = () => {
  const id = filtersToggle().getAttribute("aria-controls");
  const tray = id === null ? null : document.getElementById(id);
  if (!tray) throw new Error("The Filters toggle controls no tray");
  return tray;
};

describe("Compendium focus mode", () => {
  test("scrolling the list down folds the filters away; scrolling back to the top brings them back", async () => {
    renderCompendium("/compendium?spell=7");
    const list = await spellList();
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "true");

    scrollPane(list, 300);
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "false");
    // Folded filters leave the Tab order; the search box stays.
    expect(filterTray()).toHaveAttribute("inert");
    expect(screen.getByRole("searchbox", { name: "Search spells by name" })).toBeVisible();

    scrollPane(list, 0);
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "true");
    expect(filterTray()).not.toHaveAttribute("inert");
  });

  test("reading a long sheet in the reader pane leaves the filters alone", async () => {
    renderCompendium("/compendium?spell=7");
    await spellList();

    scrollPane(screen.getByLabelText("Spell details"), 300);
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "true");
  });

  test("a list that barely overflows keeps the filters, so folding cannot leave nothing to scroll", async () => {
    renderCompendium("/compendium?spell=7");

    scrollPane(await spellList(), 150, { scrollHeight: 600, clientHeight: 400 });
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "true");
  });

  test("a scroll the reader did not make, such as a row brought into view, keeps the filters", async () => {
    renderCompendium("/compendium?spell=7");

    scrollPane(await spellList(), 300, { byReader: false });
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "true");
  });

  test("filters folded with the toggle stay folded at the top of the list until the toggle reopens them", async () => {
    const user = userEvent.setup();
    renderCompendium("/compendium?spell=7");
    const list = await spellList();

    await user.click(filtersToggle());
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "false");
    scrollPane(list, 300);
    scrollPane(list, 0);
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "false");

    await user.click(filtersToggle());
    expect(filtersToggle()).toHaveAttribute("aria-expanded", "true");
  });
});
