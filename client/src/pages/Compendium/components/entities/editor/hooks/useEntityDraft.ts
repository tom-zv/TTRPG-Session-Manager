import {
  createSheetDraftReducer,
  createSheetDraftState,
  type SheetDraftAction,
  type SheetDraftNormalize,
  type SheetDraftSnapshot,
  type SheetDraftState,
} from "../../../sheetEditor/sheetDraft.js";
import { loadEntityDraft, type EntityDraft } from "../model/defaults.js";
import { carryEntryKey } from "../model/entryKeys.js";
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

export type EntityDraftSnapshot = SheetDraftSnapshot<EntityDraft, EntityDraftModes>;

interface EntityDraftInitial {
  target: number | "new";
  entity: EntityDraft & { imported?: boolean };
}

export interface EntityDraftState extends SheetDraftState<EntityDraft, EntityDraftModes> {
  target: EntityDraftInitial["target"];
  mode: EntityDraftSaveMode;
}

export type EntityDraftAction =
  // A proficiency editor's commit carries its replacement record and the selected modes together.
  | SheetDraftAction<EntityDraft, EntityDraftModes>
  | { type: "set-mode"; mode: "copy" | "overwrite" };

export const createEntityDraftState = ({ target, entity }: EntityDraftInitial): EntityDraftState => {
  const draft = loadEntityDraft(entity);
  return {
    target,
    ...createSheetDraftState({ draft, modes: inferEntityModes(draft) }),
    mode: target !== "new" && entity.imported ? "copy" : "update",
  };
};

export const getEntityDraftWrite = ({ draft, modes }: EntityDraftSnapshot): EntityDraft =>
  modes.passivePerception === "auto" ? { ...draft, passivePerception: getAutoPassivePerception(draft) } : draft;

const inferEditedRecord = (
  previous: EntityDraftSnapshot,
  draft: EntityDraft,
  field: ProficiencyField,
): ProficiencyModes => {
  const inferred = inferProficiencyModes(draft, field);
  for (const [key, value] of Object.entries(draft[field] ?? {})) {
    if (previous.draft[field]?.[key] === value && Object.hasOwn(previous.modes[field], key)) {
      inferred[key] = previous.modes[field][key];
    }
  }
  return inferred;
};

/**
 * An entity commit: an edited save or skill record infers its modes from the values unless the
 * editor sent them, and a score or CR change refreshes the values that follow from them.
 */
const normalizeEntityCommit: SheetDraftNormalize<EntityDraft, EntityDraftModes> = (previous, next, patch, patchModes) => {
  const { draft, modes } = next;
  // The draft holds clones of the entries a commit sends; each clone keeps its row's key, so the
  // sheet's field for that entry stays mounted (see `entryKeys.ts`).
  for (const list of ["traits", "actions", "spellcasting"] as const) {
    const stored = draft[list];
    patch[list]?.forEach((row, index) => {
      if (stored?.[index]) carryEntryKey(row, stored[index]);
    });
  }
  const fields: readonly ProficiencyField[] = ["saves", "skills"];
  for (const field of fields) {
    if (Object.hasOwn(patch, field)) {
      if (!patchModes?.[field]) modes[field] = inferEditedRecord(previous, draft, field);
    } else if (draft.abilityScores !== previous.draft.abilityScores || draft.cr !== previous.draft.cr) {
      draft[field] = refreshProficiencyValues(previous.draft, draft, field, modes[field]);
    }
  }

  if (Object.hasOwn(patch, "spellcasting")) {
    // A card or a layout change sends the blocks' modes with them; otherwise read them off the values.
    if (!patchModes?.spellcasting) modes.spellcasting = inferSpellcastingModes(draft);
  } else if (draft.abilityScores !== previous.draft.abilityScores || draft.cr !== previous.draft.cr) {
    draft.spellcasting = refreshSpellcastingValues(draft, modes.spellcasting);
  }
  return next;
};

const sheetDraftReducer = createSheetDraftReducer(normalizeEntityCommit);

export const entityDraftReducer = (state: EntityDraftState, action: EntityDraftAction): EntityDraftState => {
  switch (action.type) {
    case "set-mode":
      // Overwrite consent changes only through a destination action, including after Undo.
      return state.mode === "update" || state.mode === action.mode ? state : { ...state, mode: action.mode };
    case "acknowledge":
      // The server accepted this snapshot's stat block (a PUT) while its settings are still unsaved.
      // Later changes compare stats with what is stored now, and settings with their own baseline,
      // so returning to the loaded values (Undo) is still a change to save.
      return sheetDraftReducer(state, {
        type: "acknowledge",
        snapshot: { draft: { ...action.snapshot.draft, settings: state.base.draft.settings }, modes: action.snapshot.modes },
      });
    default:
      return sheetDraftReducer(state, action);
  }
};
