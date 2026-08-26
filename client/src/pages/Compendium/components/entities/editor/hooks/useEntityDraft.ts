import { useReducer } from "react";
import { isPlainObject } from "shared/domain/encounters/settings.js";
import { loadEntityDraft, type EntityDraft } from "../model/defaults.js";
import {
  getAutoPassivePerception,
  inferEntityModes,
  inferProficiencyModes,
  inferSpellcastingModes,
  refreshProficiencyValues,
  refreshSpellcastingValues,
  type EntityDraftModes,
  type ProficiencyField,
  type ProficiencyModes,
} from "../model/inference.js";

export type EntityDraftSaveMode = "update" | "copy" | "overwrite";

export interface EntityDraftSnapshot {
  draft: EntityDraft;
  modes: EntityDraftModes;
}

interface EntityDraftInitial {
  target: number | "new";
  entity: EntityDraft & { imported?: boolean };
}

export interface EntityDraftState extends EntityDraftSnapshot {
  target: EntityDraftInitial["target"];
  base: EntityDraftSnapshot;
  dirty: boolean;
  mode: EntityDraftSaveMode;
  history: {
    past: readonly EntityDraftSnapshot[];
    future: readonly EntityDraftSnapshot[];
  };
}

export type EntityDraftAction =
  // A proficiency editor commits its replacement record and the selected modes together.
  | { type: "commit"; patch: Partial<EntityDraft>; modes?: Partial<EntityDraftModes> }
  | { type: "set-mode"; mode: "copy" | "overwrite" }
  // The server accepted this snapshot's stat block (a PUT) while its settings are still unsaved.
  | { type: "acknowledge"; snapshot: EntityDraftSnapshot }
  | { type: "undo" }
  | { type: "redo" };

export const createEntityDraftState = ({ target, entity }: EntityDraftInitial): EntityDraftState => {
  const draft = loadEntityDraft(entity);
  const base = { draft, modes: inferEntityModes(draft) };
  return {
    target,
    ...base,
    base,
    dirty: false,
    mode: target !== "new" && entity.imported ? "copy" : "update",
    history: { past: [], future: [] },
  };
};

export const getEntityDraftWrite = ({ draft, modes }: EntityDraftSnapshot): EntityDraft =>
  modes.passivePerception === "auto" ? { ...draft, passivePerception: getAutoPassivePerception(draft) } : draft;

const encodeSnapshot = ({ draft, modes }: EntityDraftSnapshot): string =>
  // Record key order is irrelevant to a write. Arrays still retain their order.
  JSON.stringify({ draft, modes }, (_, value: unknown) =>
    isPlainObject(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
      : value
  );

const restoreSnapshot = (
  state: EntityDraftState,
  snapshot: EntityDraftSnapshot,
  history: EntityDraftState["history"],
): EntityDraftState => ({
  ...state,
  ...snapshot,
  history,
  dirty: encodeSnapshot(snapshot) !== encodeSnapshot(state.base),
});

const inferEditedRecord = (
  state: EntityDraftState,
  draft: EntityDraft,
  field: ProficiencyField,
): ProficiencyModes => {
  const inferred = inferProficiencyModes(draft, field);
  for (const [key, value] of Object.entries(draft[field] ?? {})) {
    if (state.draft[field]?.[key] === value && Object.hasOwn(state.modes[field], key)) {
      inferred[key] = state.modes[field][key];
    }
  }
  return inferred;
};

export const entityDraftReducer = (state: EntityDraftState, action: EntityDraftAction): EntityDraftState => {
  const { past, future } = state.history;
  const current = { draft: state.draft, modes: state.modes };

  switch (action.type) {
    case "set-mode":
      // Overwrite consent changes only through a destination action, including after Undo.
      return state.mode === "update" || state.mode === action.mode ? state : { ...state, mode: action.mode };
    case "acknowledge": {
      // Later changes compare stats with what is stored now, and settings with their own baseline,
      // so returning to the loaded values (Undo) is still a change to save. History is kept.
      const base = { draft: { ...action.snapshot.draft, settings: state.base.draft.settings }, modes: action.snapshot.modes };
      return { ...state, base, dirty: encodeSnapshot(current) !== encodeSnapshot(base) };
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
      const draft = { ...state.draft, ...structuredClone(action.patch) };
      const modes = { ...state.modes, ...structuredClone(action.modes) };
      const fields: readonly ProficiencyField[] = ["saves", "skills"];
      for (const field of fields) {
        if (Object.hasOwn(action.patch, field)) {
          if (!action.modes?.[field]) modes[field] = inferEditedRecord(state, draft, field);
        } else if (draft.abilityScores !== state.draft.abilityScores || draft.cr !== state.draft.cr) {
          draft[field] = refreshProficiencyValues(state.draft, draft, field, modes[field]);
        }
      }

      if (Object.hasOwn(action.patch, "spellcasting")) {
        // A card or a layout change sends the blocks' modes with them; otherwise read them off the values.
        if (!action.modes?.spellcasting) modes.spellcasting = inferSpellcastingModes(draft);
      } else if (draft.abilityScores !== state.draft.abilityScores || draft.cr !== state.draft.cr) {
        draft.spellcasting = refreshSpellcastingValues(draft, modes.spellcasting);
      }

      const snapshot = { draft, modes };
      if (encodeSnapshot(snapshot) === encodeSnapshot(current)) return state;
      return restoreSnapshot(state, snapshot, { past: [...past, current], future: [] });
    }
  }
};

export const useEntityDraft = (initial: EntityDraftInitial) =>
  useReducer(entityDraftReducer, initial, createEntityDraftState);
