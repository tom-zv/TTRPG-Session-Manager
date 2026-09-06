import { isPlainObject } from "shared/domain/encounters/settings.js";

/** One state of the record being edited: its fields, and the modes kept beside them. */
export interface SheetDraftSnapshot<Draft, Modes> {
  draft: Draft;
  modes: Modes;
}

/** The draft with its baseline and history. A record type may extend it with its own fields. */
export interface SheetDraftState<Draft, Modes> extends SheetDraftSnapshot<Draft, Modes> {
  /** What is stored: the draft is dirty while it differs from this. */
  base: SheetDraftSnapshot<Draft, Modes>;
  dirty: boolean;
  history: {
    past: readonly SheetDraftSnapshot<Draft, Modes>[];
    future: readonly SheetDraftSnapshot<Draft, Modes>[];
  };
}

export type SheetDraftAction<Draft, Modes> =
  // An editor commits its fields, and the modes it chose with them.
  | { type: "commit"; patch: Partial<Draft>; modes?: Partial<Modes> }
  // The server stored this snapshot; later changes compare with it. History is kept.
  | { type: "acknowledge"; snapshot: SheetDraftSnapshot<Draft, Modes> }
  | { type: "undo" }
  | { type: "redo" };

/**
 * The record type's rules for a commit: given the snapshot before it, the snapshot with the patch
 * and modes merged in, and what was committed, returns the snapshot to keep (for example with
 * values derived from the changed fields refreshed). It may change `next` in place; `previous`
 * must stay as it is.
 */
export type SheetDraftNormalize<Draft, Modes> = (
  previous: SheetDraftSnapshot<Draft, Modes>,
  next: SheetDraftSnapshot<Draft, Modes>,
  patch: Partial<Draft>,
  modes: Partial<Modes> | undefined,
) => SheetDraftSnapshot<Draft, Modes>;

export const createSheetDraftState = <Draft, Modes>(snapshot: SheetDraftSnapshot<Draft, Modes>): SheetDraftState<Draft, Modes> => ({
  ...snapshot,
  base: snapshot,
  dirty: false,
  history: { past: [], future: [] },
});

/** The snapshot as a write sees it: record key order is irrelevant, arrays keep their order. */
const encodeSnapshot = <Draft, Modes>({ draft, modes }: SheetDraftSnapshot<Draft, Modes>): string =>
  JSON.stringify({ draft, modes }, (_, value: unknown) =>
    isPlainObject(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value
  );

/** Whether two snapshots would write the same record. */
export const sameSnapshot = <Draft, Modes>(left: SheetDraftSnapshot<Draft, Modes>, right: SheetDraftSnapshot<Draft, Modes>): boolean =>
  encodeSnapshot(left) === encodeSnapshot(right);

const restoreSnapshot = <Draft, Modes, State extends SheetDraftState<Draft, Modes>>(
  state: State,
  snapshot: SheetDraftSnapshot<Draft, Modes>,
  history: State["history"],
): State => ({
  ...state,
  ...snapshot,
  history,
  dirty: !sameSnapshot(snapshot, state.base),
});

/**
 * The reducer every sheet draft shares: commit (through the record type's `normalize`), undo,
 * redo and acknowledge. A commit that changes nothing keeps the state, so it adds no history.
 * Fields a record type adds to the state are carried through unchanged.
 */
export const createSheetDraftReducer = <Draft, Modes>(normalize?: SheetDraftNormalize<Draft, Modes>) =>
  <State extends SheetDraftState<Draft, Modes>>(state: State, action: SheetDraftAction<Draft, Modes>): State => {
    const { past, future } = state.history;
    const current = { draft: state.draft, modes: state.modes };

    switch (action.type) {
      case "acknowledge": {
        const base = action.snapshot;
        return { ...state, base, dirty: !sameSnapshot(current, base) };
      }
      case "undo": {
        const previous = past.at(-1);
        return previous ? restoreSnapshot(state, previous, { past: past.slice(0, -1), future: [current, ...future] }) : state;
      }
      case "redo": {
        const next = future[0];
        return next ? restoreSnapshot(state, next, { past: [...past, current], future: future.slice(1) }) : state;
      }
      case "commit": {
        const merged = {
          draft: { ...state.draft, ...structuredClone(action.patch) },
          modes: { ...state.modes, ...structuredClone(action.modes) },
        };
        const snapshot = normalize ? normalize(current, merged, action.patch, action.modes) : merged;
        if (sameSnapshot(snapshot, current)) return state;
        return restoreSnapshot(state, snapshot, { past: [...past, current], future: [] });
      }
    }
  };
