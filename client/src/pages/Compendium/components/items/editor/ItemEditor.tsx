import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { validateItemInput, type Item, type ItemDetails, type ItemInput } from "shared/domain/dnd5e/item.js";
import type { WriteIssue } from "shared/domain/writeValidation.js";
import { WriteValidationError } from "src/api/writeFailure.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import type { ItemMutationScope } from "../../../api/query/itemCache.js";
import { useCreateItem, useUpdateItem } from "../../../api/query/useItemQueries.js";
import { NARROW_BROWSER_QUERY } from "../../browser/BrowserLayout.js";
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
import { ItemCard } from "../ItemCard.js";
import type { ItemEditApi } from "./ItemEditContext.js";
import { draftToInput, goldToCopper, type ItemDraft } from "./model/itemDraft.js";
import { statByKey, type ItemModes } from "./model/fields.js";
import { itemFieldRegion, placeIssues } from "./model/issueTargets.js";

export type ItemDraftState = SheetDraftState<ItemDraft, ItemModes>;
type ItemDraftAction = SheetDraftAction<ItemDraft, ItemModes>;

const NO_MODES: ItemModes = {};
const itemDraftReducer = createSheetDraftReducer<ItemDraft, ItemModes>();

export const createItemDraftState = (draft: ItemDraft): ItemDraftState => createSheetDraftState({ draft, modes: NO_MODES });

/** A server 400 with field issues, kept with the slot so the editor mounted when it arrives lists them. */
type ServerRejection = {
  issues: WriteIssue[];
  state: ItemDraftState;
};

export type ItemSaveProgress = {
  pending: boolean;
  error: string | null;
  rejected?: ServerRejection;
};

export type ItemEditorHandle = {
  /** Commits and closes the open editor; false keeps an invalid one open. */
  settle: () => boolean;
};

type ItemEditorProps = {
  /** The stored item under the draft, or a homebrew shell (id 0) for a new one. */
  record: Item;
  /** The draft, owned by the browser's draft slot so it outlives this editor. */
  state: ItemDraftState;
  onChange: (state: ItemDraftState) => void;
  saveProgress: ItemSaveProgress;
  onSaveProgress: (progress: ItemSaveProgress) => void;
  /** The open editor and live text, owned by the draft slot so a remount restores them. */
  buffer: EditorBuffer;
  /** The stored charges; unchanged text keeps them exactly (a formula stays text). */
  originalCharges: ItemDetails["charges"];
  mutationScope: ItemMutationScope;
  /** The item's actions outside the draft (Give, Hide from players), beside the toolbar. */
  actions?: React.ReactNode;
  /** Shown under the header, e.g. a failed visibility change. */
  notice?: React.ReactNode;
  /** Follow a family, base or member link. */
  onSelect: (id: number) => void;
  /** Leave edit mode without saving (after a confirm when there are changes). */
  onCancel: () => void;
  onSaved: (item: Item) => void;
};

const finite = (value: number | undefined) => (value === undefined || Number.isNaN(value) ? undefined : value);

/** What the sheet renders while editing: the stored item under the draft's values. */
const toSheetItem = (record: Item, draft: ItemDraft): Item => {
  const input = draftToInput(draft);
  const { details } = input;
  return {
    ...record,
    name: draft.name,
    source: draft.source,
    page: finite(input.page),
    category: input.category,
    rarity: draft.rarity,
    requiresAttunement: draft.requiresAttunement,
    attunementNote: input.attunementNote,
    valueCp: finite(goldToCopper(draft.valueGp)),
    weightLb: finite(input.weightLb),
    aliases: draft.aliases,
    base: draft.base ?? undefined,
    details: { ...details, armorClass: finite(details.armorClass), strength: finite(details.strength) },
  };
};

type CheckedDraft = { ok: true; value: ItemInput } | { ok: false; issues: WriteIssue[] };

/**
 * Edit mode for an item's Compendium sheet: the toolbar (changes, issues, Undo and Redo, Cancel,
 * Save) and the save rules, which are the old form's: the shared `validateItemInput` checks the
 * full snapshot first; an item is PUT whole, a new one (or a duplicate) is POSTed as homebrew. A
 * generated specific's base is never sent. The item caches update through the item mutations.
 */
export const ItemEditor = forwardRef<ItemEditorHandle, ItemEditorProps>(function ItemEditor(
  { record, state, onChange, saveProgress, onSaveProgress, buffer, originalCharges, mutationScope, actions, notice, onSelect, onCancel, onSaved },
  ref,
) {
  const latestRef = useRef(state);
  useLayoutEffect(() => {
    latestRef.current = state;
  }, [state]);
  const narrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const presentation = usePresentation();
  const create = useCreateItem(mutationScope);
  const update = useUpdateItem(mutationScope);
  const [savingLocally, setSavingLocally] = useState(false);
  const saving = savingLocally || saveProgress.pending;
  const isNew = record.id === 0;
  const {
    activeId, open, close, closeTo, switchTo, commitRef, takeFocus, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, focusLive, jumpToEditor,
    pendingLive, carriedId, bufferApi, reopen, settle, unapplied, settleLive, pruneLive,
  } = useOpenEditor({ buffer, saving, presentation });
  const dispatch = useCallback((action: ItemDraftAction) => {
    const current = latestRef.current;
    const next = itemDraftReducer(current, action);
    if (next === current) return;
    latestRef.current = next;
    pruneLive(next.draft, next.modes);
    onChange(next);
  }, [onChange, pruneLive]);

  const [addedStats, setAddedStats] = useState<readonly string[]>([]);
  const showStat = useCallback((key: string) => setAddedStats(current => (current.includes(key) ? current : [...current, key])), []);
  const hideStat = useCallback((key: string) => setAddedStats(current => current.filter(entry => entry !== key)), []);

  const validateDraft = useCallback((draft: ItemDraft): CheckedDraft => {
    const result = validateItemInput(draftToInput(draft, originalCharges));
    return result.ok ? { ok: true, value: result.value } : { ok: false, issues: result.issues };
  }, [originalCharges]);

  const [clientIssues, setClientIssues] = useState(false);
  const rejection = saveProgress.rejected?.state === state ? saveProgress.rejected : undefined;
  const [issuesOpen, setIssuesOpen] = useState(rejection !== undefined);
  const firstTarget = (issues: readonly WriteIssue[], draft: ItemDraft, shown: SheetPresentation) =>
    firstIssueJump(placeIssues(issues, draft, shown));
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
  }, [rejection, clientIssues, state, presentation, validateDraft]);

  useImperativeHandle(ref, () => ({ settle }), [settle]);
  const commit = useCallback<ItemEditApi["commit"]>((patch, modes) => {
    if (saving) return "The item is being saved.";
    dispatch({ type: "commit", patch, modes });
    return undefined;
  }, [dispatch, saving]);
  const api = useMemo<ItemEditApi>(
    () => ({
      draft: state.draft, modes: state.modes, activeId, narrow, presentation, open, close, closeTo, switchTo, commit, commitRef, takeFocus,
      viewer: mutationScope.viewer, buffer: bufferApi, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, pendingLive, carriedId,
      record, addedStats, showStat, hideStat,
    }),
    [
      state.draft, state.modes, activeId, narrow, presentation, open, close, closeTo, switchTo, commit, commitRef, takeFocus,
      mutationScope.viewer, bufferApi, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, pendingLive, carriedId,
      record, addedStats, showStat, hideStat,
    ],
  );
  const sheetItem = useMemo(() => toSheetItem(record, state.draft), [record, state.draft]);

  /**
   * An issue's jump: a live control takes focus where one draws the field (always the description,
   * and on a live sheet every field, or its line's add control when it is absent); otherwise the
   * target's editor opens. A stat whose line is gone comes back first.
   */
  const jump = useCallback((targetId: string, focusId: string | null = targetId) => {
    const exactId = focusId ?? targetId;
    const stat = statByKey(itemFieldRegion(targetId));
    if (stat && !stat.present(latestRef.current.draft)) showStat(stat.key);
    if (focusLive(exactId)) return;
    if (presentation === "live" && stat) {
      requestLiveFocus(exactId);
      return;
    }
    jumpToEditor(targetId, exactId);
  }, [focusLive, jumpToEditor, presentation, requestLiveFocus, showStat]);
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
    result => (result.ok ? commit(result.patch as Partial<ItemDraft>) : result.message),
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
        const openId = firstTarget(error.issues, rejected.draft, "targets")?.targetId ?? null;
        // A control drawn the same in both presentations (a spell chip, the description) takes focus;
        // a target opens its editor.
        if (openId !== null && presentation === "targets" && !focusLive(openId)) switchTo(openId);
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
        <ItemCard
          item={sheetItem}
          viewer={mutationScope.viewer}
          onSelect={onSelect}
          notice={notice}
          renderEditHeading={title => (
            <SheetEditorToolbar
              title={title}
              heading={isNew ? "New item" : "Editing"}
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
              // The description is a live source field in both presentations.
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
                ? { name: state.draft.name.trim() || (isNew ? "the new item" : record.name), onDiscard: onCancel, onKeep: dismissConfirm }
                : null}
              keepRef={keepRef}
            >
              {actions}
            </SheetEditorToolbar>
          )}
        />
      </div>
    </SheetEditContext>
  );
});
