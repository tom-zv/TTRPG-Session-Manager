import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HOMEBREW_SPELL_SOURCE, validateSpellInput, type Spell, type SpellInput } from "shared/domain/dnd5e/spell.js";
import type { WriteIssue } from "shared/domain/writeValidation.js";
import { WriteValidationError } from "src/api/writeFailure.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import type { ItemViewer } from "../../../api/query/itemKeys.js";
import { useCreateSpell, useSpellCasters, useUpdateSpell } from "../../../api/query/useSpellQueries.js";
import { NARROW_BROWSER_QUERY } from "../../browser/BrowserLayout.js";
import type { SpellTokenRenderer } from "../../RichText/RichText.js";
import { SheetEditContext, type EditorBuffer } from "../../sheetEditor/SheetEditContext.js";
import { SheetEditorToolbar, handleSheetEditorKeyDown, useSheetHistory } from "../../sheetEditor/SheetEditorToolbar.js";
import { firstIssueJump, type IssueJump, type PlacedIssue } from "../../sheetEditor/issues.js";
import {
  createSheetDraftReducer,
  createSheetDraftState,
  type SheetDraftAction,
  type SheetDraftState,
} from "../../sheetEditor/sheetDraft.js";
import { useOpenEditor } from "../../sheetEditor/useOpenEditor.js";
import { usePresentation, type SheetPresentation } from "../../sheetEditor/usePresentation.js";
import { SpellCard } from "../SpellCard.js";
import type { SpellEditApi } from "./SpellEditContext.js";
import type { SpellModes } from "./model/fields.js";
import { placeIssues } from "./model/issueTargets.js";
import { draftToInput, type SpellDraft } from "./model/spellDraft.js";
import styles from "../SpellCard.module.css";

export type SpellDraftState = SheetDraftState<SpellDraft, SpellModes>;
type SpellDraftAction = SheetDraftAction<SpellDraft, SpellModes>;

const NO_MODES: SpellModes = {};
const spellDraftReducer = createSheetDraftReducer<SpellDraft, SpellModes>();

export const createSpellDraftState = (draft: SpellDraft): SpellDraftState => createSheetDraftState({ draft, modes: NO_MODES });

/** A server 400 with field issues, kept with the slot so the editor mounted when it arrives lists them. */
type ServerRejection = {
  issues: WriteIssue[];
  state: SpellDraftState;
};

export type SpellSaveProgress = {
  pending: boolean;
  error: string | null;
  rejected?: ServerRejection;
};

export type SpellEditorHandle = {
  /** Commits and closes the open editor; false keeps an invalid one open. */
  settle: () => boolean;
};

/** The page of a spell that is not saved yet; the sheet draws the draft over it. */
export const newSpellShell = (): Spell => ({
  id: 0,
  name: "",
  source: HOMEBREW_SPELL_SOURCE,
  level: 1,
  school: "evocation",
  ritual: false,
  concentration: false,
  castingTime: "",
  castingUnit: "action",
  components: { v: false, s: false, m: false },
  classes: [],
  damageTypes: [],
  saves: [],
  aliases: [],
  range: "",
  materialConsumed: false,
  duration: "",
  description: "",
  conditions: [],
  locallyEdited: false,
});

type SpellEditorProps = {
  /** The stored spell under the draft, or a homebrew shell (id 0) for a new one. */
  record: Spell;
  /** The draft, owned by the browser's draft slot so it outlives this editor. */
  state: SpellDraftState;
  onChange: (state: SpellDraftState) => void;
  saveProgress: SpellSaveProgress;
  onSaveProgress: (progress: SpellSaveProgress) => void;
  /** The open editor and live text, owned by the draft slot so a remount restores them. */
  buffer: EditorBuffer;
  /** The signed-in viewer, for the item search in the `{` reference menu. */
  viewer?: ItemViewer;
  renderSpell?: SpellTokenRenderer;
  /** Leave edit mode without saving (after a confirm when there are changes). */
  onCancel: () => void;
  onSaved: (spell: Spell) => void;
};

const finite = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : value);

/** What the sheet renders while editing: the stored spell under the draft's values. */
const toSheetSpell = (record: Spell, draft: SpellDraft): Spell => {
  const input = draftToInput(draft);
  return {
    ...record,
    ...input,
    name: draft.name,
    source: draft.source,
    // Optional values the draft clears must not fall back to the stored ones.
    page: finite(input.page),
    castingTrigger: input.castingTrigger,
    rangeFeet: input.rangeFeet,
    material: input.material,
    higherLevels: input.higherLevels,
    attack: input.attack,
    level: finite(input.level) ?? record.level,
    castingTime: draft.castingTime,
    range: draft.range,
    duration: draft.duration,
    description: draft.description,
    materialCostCp: finite(input.materialCostCp),
  };
};

type CheckedDraft = { ok: true; value: SpellInput } | { ok: false; issues: WriteIssue[] };

const validateDraft = (draft: SpellDraft): CheckedDraft => {
  const result = validateSpellInput(draftToInput(draft));
  return result.ok ? { ok: true, value: result.value } : { ok: false, issues: result.issues };
};

const firstTarget = (issues: readonly WriteIssue[], draft: SpellDraft, shown: SheetPresentation) =>
  firstIssueJump(placeIssues(issues, draft, shown));

/**
 * Edit mode for a spell's Compendium sheet: the toolbar (changes, issues, Undo and Redo, Cancel,
 * Save) and the save rules, which are the old form's: the shared `validateSpellInput` checks the
 * full snapshot first (casting unit, range in feet and concentration derived from the text); a
 * spell is PUT whole, a new one (or a duplicate) is POSTed. The spell caches update through the
 * spell mutations.
 */
export const SpellEditor = forwardRef<SpellEditorHandle, SpellEditorProps>(function SpellEditor(
  { record, state, onChange, saveProgress, onSaveProgress, buffer, viewer, renderSpell, onCancel, onSaved },
  ref,
) {
  const latestRef = useRef(state);
  useLayoutEffect(() => {
    latestRef.current = state;
  }, [state]);
  const narrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const presentation = usePresentation();
  const create = useCreateSpell();
  const update = useUpdateSpell();
  const [savingLocally, setSavingLocally] = useState(false);
  const saving = savingLocally || saveProgress.pending;
  const isNew = record.id === 0;
  const {
    activeId, open, close, closeTo, switchTo, commitRef, takeFocus, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, focusLive, jumpToEditor,
    pendingLive, carriedId, bufferApi, reopen, settle, unapplied, settleLive, pruneLive,
  } = useOpenEditor({ buffer, saving, presentation });
  const dispatch = useCallback((action: SpellDraftAction) => {
    const current = latestRef.current;
    const next = spellDraftReducer(current, action);
    if (next === current) return;
    latestRef.current = next;
    pruneLive(next.draft, next.modes);
    onChange(next);
  }, [onChange, pruneLive]);

  const [clientIssues, setClientIssues] = useState(false);
  const rejection = saveProgress.rejected?.state === state ? saveProgress.rejected : undefined;
  const [issuesOpen, setIssuesOpen] = useState(rejection !== undefined);
  // A rejection shows its issues and jumps to the first one after the sheet renders, in whichever
  // presentation is active then (the editor that sent the save may have unmounted).
  const [seenRejection, setSeenRejection] = useState(saveProgress.rejected);
  const [jumpAfterRender, setJumpAfterRender] = useState<IssueJump | null>(
    () => (rejection ? firstTarget(rejection.issues, rejection.state.draft, presentation) : null),
  );
  if (saveProgress.rejected !== seenRejection) {
    setSeenRejection(saveProgress.rejected);
    if (rejection) {
      setIssuesOpen(true);
      setJumpAfterRender(firstTarget(rejection.issues, rejection.state.draft, presentation));
    }
  }
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  const issues = useMemo<PlacedIssue[]>(() => {
    if (rejection) return placeIssues(rejection.issues, state.draft, presentation);
    if (!clientIssues) return [];
    const result = validateDraft(state.draft);
    return result.ok ? [] : placeIssues(result.issues, state.draft, presentation);
  }, [rejection, clientIssues, state, presentation]);

  useImperativeHandle(ref, () => ({ settle }), [settle]);
  const commit = useCallback<SpellEditApi["commit"]>((patch, modes) => {
    if (saving) return "The spell is being saved.";
    dispatch({ type: "commit", patch, modes });
    return undefined;
  }, [dispatch, saving]);
  const api = useMemo<SpellEditApi>(
    () => ({
      draft: state.draft, modes: state.modes, activeId, narrow, presentation, open, close, closeTo, switchTo, commit, commitRef, takeFocus,
      viewer, buffer: bufferApi, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, pendingLive, carriedId,
    }),
    [
      state.draft, state.modes, activeId, narrow, presentation, open, close, closeTo, switchTo, commit, commitRef, takeFocus,
      viewer, bufferApi, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, pendingLive, carriedId,
    ],
  );
  const sheetSpell = useMemo(() => toSheetSpell(record, state.draft), [record, state.draft]);

  // Creatures name spells, so renaming one leaves their lists showing the old name as plain text.
  const { data: casters } = useSpellCasters(isNew ? null : record.id);
  const renamed = !isNew && state.draft.name.trim().toLowerCase() !== record.name.toLowerCase();
  const casterCount = casters?.length ?? 0;
  const renameWarning = renamed && casterCount > 0 && (
    <p className={styles.warning} role="status">
      {casterCount} creature{casterCount === 1 ? "" : "s"} name this spell as &ldquo;{record.name}&rdquo;. They link to spells
      by name, so after the rename they show it as plain text until their spell lists are updated.
    </p>
  );

  /**
   * An issue's jump: a live control takes focus where one draws the field (always the description
   * and higher levels, and on a live sheet every field); otherwise the target's editor opens.
   */
  const jump = useCallback((targetId: string, focusId: string | null = targetId) => {
    const exactId = focusId ?? targetId;
    if (focusLive(exactId)) return;
    if (presentation === "live") requestLiveFocus(exactId);
    else jumpToEditor(targetId, exactId);
  }, [focusLive, jumpToEditor, presentation, requestLiveFocus]);
  useEffect(() => {
    if (jumpAfterRender === null) return;
    if (presentation === "live" && carriedId === activeId && activeId !== null) {
      reopen(null);
      return;
    }
    jump(jumpAfterRender.targetId, jumpAfterRender.focusId);
    setJumpAfterRender(null);
  }, [activeId, carriedId, jumpAfterRender, jump, presentation, reopen]);

  const applyLiveText = useCallback(() => settleLive(
    () => ({ draft: latestRef.current.draft, modes: latestRef.current.modes }),
    result => (result.ok ? commit(result.patch as Partial<SpellDraft>) : result.message),
  ), [settleLive, commit]);
  // Leaving the live presentation is a blur: valid typed text applies; invalid text keeps its field.
  useEffect(() => {
    if (presentation === "targets") applyLiveText();
  }, [presentation, applyLiveText]);

  const showIssues = (placed: readonly PlacedIssue[]) => {
    setIssuesOpen(true);
    const first = placed.find(issue => issue.targetId !== null);
    if (first?.targetId) jump(first.targetId, first.focusId);
  };

  const save = async () => {
    if (saving || !settle()) return;
    if (applyLiveText() > 0) return;
    const current = latestRef.current;
    if (!current.dirty && !isNew) return;
    const checked = validateDraft(current.draft);
    if (!checked.ok) {
      setClientIssues(true);
      showIssues(placeIssues(checked.issues, current.draft, presentation));
      return;
    }
    setClientIssues(false);
    onSaveProgress({ pending: true, error: null });
    setSavingLocally(true);
    try {
      const saved = isNew
        ? await create.mutateAsync(checked.value)
        : await update.mutateAsync({ id: record.id, input: checked.value });
      onSaved(saved);
    } catch (error) {
      if (error instanceof WriteValidationError) {
        const rejected = latestRef.current;
        const first = firstTarget(error.issues, rejected.draft, "targets");
        // A control drawn the same in both presentations (the description) takes focus; a target opens its editor.
        if (first !== null && presentation === "targets" && !focusLive(first.focusId ?? first.targetId)) switchTo(first.targetId);
        onSaveProgress({ pending: false, error: error.message, rejected: { issues: error.issues, state: rejected } });
      } else {
        onSaveProgress({ pending: false, error: (error as Error).message });
      }
    } finally {
      setSavingLocally(false);
    }
  };
  const { step, undoRef, redoRef } = useSheetHistory({ saving, settle, apply: type => dispatch({ type }) });
  const cancel = () => {
    if (!settle()) return;
    if (latestRef.current.dirty) setConfirming(true);
    else onCancel();
  };
  const canSave = (state.dirty || activeId !== null || pendingLive.length > 0 || isNew) && !saving && unapplied === 0;
  const dismissConfirm = () => {
    setConfirming(false);
    window.requestAnimationFrame(() => cancelRef.current?.focus());
  };
  const changes = state.history.past.length;

  return (
    <SheetEditContext value={api}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onKeyDown={event => handleSheetEditorKeyDown(event, {
          step,
          confirming,
          dismissConfirm,
          captureEscape: narrow && activeId !== null,
          closeEditor: () => close(true),
        })}
      >
        <SpellCard
          summary={sheetSpell}
          spell={sheetSpell}
          renderSpell={renderSpell}
          headingId={`spell-heading-${isNew ? "new" : record.id}`}
          notice={renameWarning}
          renderEditHeading={title => (
            <SheetEditorToolbar
              title={title}
              heading={isNew ? "New spell" : "Editing"}
              dirty={state.dirty}
              changes={changes}
              issues={issues}
              issuesOpen={issuesOpen}
              onToggleIssues={() => setIssuesOpen(value => !value)}
              onOpenIssue={jump}
              alert={saveProgress.error ?? (issues.length > 0 && !rejection && clientIssues
                ? `Not saved. Fix ${issues.length} ${issues.length === 1 ? "issue" : "issues"} first.`
                : null)}
              saving={saving}
              unapplied={unapplied}
              // The description and higher levels are live source fields in both presentations.
              canSave={canSave}
              canUndo={state.history.past.length > 0}
              canRedo={state.history.future.length > 0}
              onStep={step}
              undoRef={undoRef}
              redoRef={redoRef}
              onCancel={cancel}
              cancelRef={cancelRef}
              onSave={() => void save()}
              confirmDiscard={confirming
                ? { name: state.draft.name.trim() || (isNew ? "the new spell" : record.name), onDiscard: onCancel, onKeep: dismissConfirm }
                : null}
              keepRef={keepRef}
            />
          )}
        />
      </div>
    </SheetEditContext>
  );
});
