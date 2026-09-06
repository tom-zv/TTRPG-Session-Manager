import { describe, expect, test } from "vitest";
import {
  createSheetDraftReducer,
  createSheetDraftState,
  type SheetDraftAction,
  type SheetDraftNormalize,
  type SheetDraftState,
} from "./sheetDraft.js";

// A record with a derived field, standing in for any sheet: `label` follows `name` while its mode
// is "auto", the way a sheet's derived values follow the fields they come from.
type Card = { name: string; label: string; tags: Record<string, number> };
type CardModes = { label: "auto" | "manual" };
type CardState = SheetDraftState<Card, CardModes> & { target: "new" | number };

const normalize: SheetDraftNormalize<Card, CardModes> = (_previous, next, patch) => {
  if (Object.hasOwn(patch, "label")) next.modes.label = "manual";
  else if (next.modes.label === "auto") next.draft.label = next.draft.name.toUpperCase();
  return next;
};

const reducer = createSheetDraftReducer(normalize);

const start = (): CardState => ({
  target: 7,
  ...createSheetDraftState<Card, CardModes>({
    draft: { name: "owl", label: "OWL", tags: { a: 1, b: 2 } },
    modes: { label: "auto" },
  }),
});

const run = (state: CardState, ...actions: SheetDraftAction<Card, CardModes>[]): CardState =>
  actions.reduce(reducer, state);

describe("sheet draft", () => {
  test("a commit runs the record's rules, and Undo and Redo step over the result", () => {
    const edited = run(start(), { type: "commit", patch: { name: "bat" } });
    expect(edited.draft).toMatchObject({ name: "bat", label: "BAT" });
    expect(edited.dirty).toBe(true);
    expect(edited.history.past).toHaveLength(1);

    const undone = run(edited, { type: "undo" });
    expect(undone.draft).toMatchObject({ name: "owl", label: "OWL" });
    expect(undone.dirty).toBe(false);

    const redone = run(undone, { type: "redo" });
    expect(redone.draft).toMatchObject({ name: "bat", label: "BAT" });
    expect(redone.dirty).toBe(true);
    // Fields the record type adds to the state are carried through.
    expect(redone.target).toBe(7);
  });

  test("modes a rule sets are part of the history", () => {
    const manual = run(start(), { type: "commit", patch: { label: "Night bird" } }, { type: "commit", patch: { name: "bat" } });
    expect(manual.draft).toMatchObject({ name: "bat", label: "Night bird" });
    expect(manual.modes.label).toBe("manual");

    const back = run(manual, { type: "undo" }, { type: "undo" });
    expect(back.modes.label).toBe("auto");
    expect(back.dirty).toBe(false);
  });

  test("returning to the stored values by editing is not a change, and a no-op commit adds no history", () => {
    const state = start();
    const same = run(state, { type: "commit", patch: { tags: { b: 2, a: 1 } } });
    expect(same).toBe(state);

    const roundTrip = run(state, { type: "commit", patch: { name: "bat" } }, { type: "commit", patch: { name: "owl" } });
    expect(roundTrip.dirty).toBe(false);
    expect(roundTrip.history.past).toHaveLength(2);
  });

  test("a new commit after Undo drops the steps that could be redone", () => {
    const branched = run(start(), { type: "commit", patch: { name: "bat" } }, { type: "undo" }, { type: "commit", patch: { name: "elk" } });
    expect(branched.history.future).toHaveLength(0);
    expect(run(branched, { type: "redo" }).draft.name).toBe("elk");
  });

  test("an acknowledged snapshot becomes what is stored, and Undo back to the loaded values is a change", () => {
    const edited = run(start(), { type: "commit", patch: { name: "bat" } });
    const saved = run(edited, { type: "acknowledge", snapshot: { draft: edited.draft, modes: edited.modes } });
    expect(saved.dirty).toBe(false);
    expect(saved.history.past).toHaveLength(1);

    const undone = run(saved, { type: "undo" });
    expect(undone.draft.name).toBe("owl");
    expect(undone.dirty).toBe(true);
  });

  test("a commit does not share objects with what the editor passed in", () => {
    const tags = { a: 5 };
    const edited = run(start(), { type: "commit", patch: { tags } });
    tags.a = 9;
    expect(edited.draft.tags).toEqual({ a: 5 });
  });
});
