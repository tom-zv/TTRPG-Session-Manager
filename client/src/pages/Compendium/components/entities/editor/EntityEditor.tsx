import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import {
  ENTITY_LIMITS,
  validateDnD5eEntityWrite,
  type CreateEntityRequest,
  type EntityWriteIssue,
  type UpdateEntityRequest,
} from "shared/domain/encounters/dnd5e/entityValidation.js";
import {
  useCreateDnD5eEntity,
  usePatchDnD5eEntitySettings,
  useUpdateDnD5eEntity,
} from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import { WriteValidationError } from "src/api/writeFailure.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import type { ItemViewer } from "../../../api/query/itemKeys.js";
import { NARROW_BROWSER_QUERY } from "../../browser/BrowserLayout.js";
import { SheetEditContext, type EditorBuffer } from "../../sheetEditor/SheetEditContext.js";
import { SheetEditorToolbar, handleSheetEditorKeyDown, useSheetHistory } from "../../sheetEditor/SheetEditorToolbar.js";
import { firstIssueJump, type IssueJump, type PlacedIssue } from "../../sheetEditor/issues.js";
import { useOpenEditor } from "../../sheetEditor/useOpenEditor.js";
import { usePresentation, type SheetPresentation } from "../../sheetEditor/usePresentation.js";
import { EntitySheet } from "../EntitySheet.js";
import type { EntityEditApi } from "./EntityEditContext.js";
import { MAX_PASSIVE_PERCEPTION } from "./editors/fieldLimits.js";
import {
  entityDraftReducer,
  getEntityDraftWrite,
  type EntityDraftAction,
  type EntityDraftState,
} from "./hooks/useEntityDraft.js";
import type { EntityDraft } from "./model/defaults.js";
import { getAutoPassivePerception } from "./model/inference.js";
import { isEntryTextId, placeIssues } from "./model/issueTargets.js";
import { changedSettings } from "./model/settingsPatch.js";
import sheetStyles from "../../sheetEditor/SheetEditor.module.css";
import styles from "./EntityEditor.module.css";

type EntityEditorProps = {
  /** What the sheet renders under the draft: the loaded template, or a homebrew shell for a new one. */
  entity: DnD5eEntityDetails;
  /** The draft, owned by the browser's draft slot so it outlives this editor. */
  state: EntityDraftState;
  onChange: (state: EntityDraftState) => void;
  /** Save work owned by the browser's draft slot, so remounting cannot start another save. */
  saveProgress: EntitySaveProgress;
  onSaveProgress: (progress: EntitySaveProgress) => void;
  /** The open editor and its input, owned by the draft slot so a remount reopens them. */
  buffer: EditorBuffer;
  children?: React.ReactNode;
  /** The signed-in GM, for the item picker in entry cards. */
  viewer?: ItemViewer;
  /** Leave edit mode without saving; the draft is discarded (after a confirm when it has changes). */
  onCancel: () => void;
  /** The template as saved: the edited one, a new copy, or a created entity. */
  onSaved: (entity: DnD5eEntityDetails) => void;
};

export type EntityEditorHandle = {
  /** Commits and closes the open field, card or popover; false keeps an invalid editor open. */
  settle: () => boolean;
};

type AcknowledgedStatWrite = {
  id: number;
  signature: string;
  entity: DnD5eEntityDetails;
};

/**
 * A server 400 with field issues, kept with the slot so the editor mounted when it arrives (not
 * necessarily the one that sent the save) lists them. They apply while the draft is still `state`.
 */
type ServerRejection = {
  issues: EntityWriteIssue[];
  state: EntityDraftState;
  /** The first issue's editor, opened when the rejection arrives. */
  openId: string | null;
};

export type EntitySaveProgress = {
  pending: boolean;
  error: string | null;
  /** A PUT whose stat-block response succeeded while its settings PATCH still needs work. */
  acknowledged?: AcknowledgedStatWrite;
  rejected?: ServerRejection;
};

/**
 * What the sheet renders while editing: the loaded entity under the draft's fields. A cleared
 * field (null in the draft, and in the PUT) reads as absent, not as the loaded value.
 */
const toSheetEntity = (entity: DnD5eEntityDetails, draft: EntityDraft): DnD5eEntityDetails => ({
  ...entity,
  ...Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value ?? undefined])),
});

/**
 * An automatic save DC or spell attack that a commit moved outside the stored range (a score or
 * CR change), or undefined.
 */
const autoSpellcastingProblem = (current: EntityDraftState, next: EntityDraftState): string | undefined => {
  const [minByte, maxByte] = ENTITY_LIMITS.tinyInt;
  const blocks = next.draft.spellcasting ?? [];
  for (const [index, block] of blocks.entries()) {
    const modes = next.modes.spellcasting[index];
    if (!modes || block === current.draft.spellcasting?.[index]) continue;
    const name = block.name.trim() || "spellcasting";
    if (modes.saveDc === "auto" && block.saveDc !== undefined && (block.saveDc < 0 || block.saveDc > maxByte)) {
      return `The automatic save DC of ${name} would be ${block.saveDc}; it must be from 0 to ${maxByte}. Type a value in its card instead.`;
    }
    if (modes.spellAttackBonus === "auto" && block.spellAttackBonus !== undefined && (block.spellAttackBonus < minByte || block.spellAttackBonus > maxByte)) {
      return `The automatic spell attack of ${name} would be ${block.spellAttackBonus}; it must be from ${minByte} to +${maxByte}. Type a value in its card instead.`;
    }
  }
  return undefined;
};

/** A create carries no SQL NULLs. A legacy NULL speed is an intentionally empty speed map. */
const createInput = (draft: EntityDraft): Record<string, unknown> => ({
  ...Object.fromEntries(Object.entries(draft).filter(([, value]) => value !== null)),
  ...(draft.speeds == null ? { speeds: {} } : {}),
});

/** The first issue's target in a presentation, or null when no issue has one. */
const firstTarget = (issues: readonly EntityWriteIssue[], draft: EntityDraft, presentation: SheetPresentation) =>
  firstIssueJump(placeIssues(issues, draft, presentation));

const withoutSettings = (draft: EntityDraft): Partial<EntityDraft> => {
  const data: Partial<EntityDraft> = { ...draft };
  delete data.settings;
  return data;
};

type CheckedDraft =
  | { ok: false; issues: EntityWriteIssue[] }
  | { ok: true; create: true; value: CreateEntityRequest }
  | { ok: true; create: false; id: number; value: UpdateEntityRequest };

/** The request Save would send, checked by the shared validator. */
const validateDraft = (state: EntityDraftState): CheckedDraft => {
  const write = getEntityDraftWrite(state);
  if (state.target === "new" || state.mode === "copy") {
    const result = validateDnD5eEntityWrite(createInput(write), "create");
    return result.ok ? { ok: true, create: true, value: result.value } : result;
  }
  const result = validateDnD5eEntityWrite(withoutSettings(write), "update");
  return result.ok ? { ok: true, create: false, id: state.target, value: result.value } : result;
};

/**
 * Edit mode for the Compendium sheet: the toolbar (changes, issues, Undo and Redo, Cancel, Save),
 * the copy or overwrite destination for imported entities, and the save rules. Save validates the whole
 * draft first; an existing template is PUT without its settings, followed by a PATCH of only the
 * settings that changed. A new entity or a copy of an imported one is POSTed with its settings.
 */
export const EntityEditor = forwardRef<EntityEditorHandle, EntityEditorProps>(function EntityEditor(
  { entity, state, onChange, saveProgress, onSaveProgress, buffer, children, viewer, onCancel, onSaved },
  ref,
) {
  // The draft as of the last dispatch, before React re-renders. Save and the history buttons first
  // settle the open editor, whose commit has to be visible to them in the same click.
  const latestRef = useRef(state);
  // The slot can also change without a dispatch here: an acknowledged stat write from a save that
  // an earlier mount of this editor started.
  useLayoutEffect(() => {
    latestRef.current = state;
  }, [state]);
  const narrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const presentation = usePresentation();
  const create = useCreateDnD5eEntity();
  const update = useUpdateDnD5eEntity();
  const patchSettings = usePatchDnD5eEntitySettings();
  const [savingLocally, setSavingLocally] = useState(false);
  const saving = savingLocally || saveProgress.pending;
  const {
    activeId, open, close, closeTo, switchTo, commitRef, takeFocus, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, focusLive, jumpToEditor,
    pendingLive, carriedId, bufferApi, reopen, settle, unapplied, settleLive, pruneLive,
  } = useOpenEditor({ buffer, saving, presentation });
  const dispatch = useCallback((action: EntityDraftAction) => {
    const current = latestRef.current;
    const next = entityDraftReducer(current, action);
    if (action.type === "commit") {
      const problem = autoSpellcastingProblem(current, next);
      if (problem) return problem;
    }
    if (action.type === "commit" && next.modes.passivePerception === "auto") {
      const passive = getAutoPassivePerception(next.draft);
      const changed = current.modes.passivePerception !== "auto" || passive !== getAutoPassivePerception(current.draft);
      if (changed && (passive < 0 || passive > MAX_PASSIVE_PERCEPTION)) {
        return `Automatic Passive Perception must be from 0 to ${MAX_PASSIVE_PERCEPTION}. Change the modifier or use a manual value in Senses.`;
      }
    }
    if (next === current) return undefined;
    latestRef.current = next;
    // Unapplied live text over a value this changed (Undo, another field) or removed is replaced.
    pruneLive(getEntityDraftWrite(next), next.modes);
    onChange(next);
    return undefined;
  }, [onChange, pruneLive]);
  // Client issues are re-checked as the draft changes; the server's stand until the next edit.
  const [clientIssues, setClientIssues] = useState(false);
  const rejection = saveProgress.rejected?.state === state ? saveProgress.rejected : undefined;
  const [issuesOpen, setIssuesOpen] = useState(rejection !== undefined);
  // A rejection that arrives while this editor is mounted shows its issues and opens the first
  // one's editor. The editor that sent the save already wrote that editor into the slot's buffer.
  const [seenRejection, setSeenRejection] = useState(saveProgress.rejected);
  // The first issue is resolved after the sheet renders, both for an immediate rejection and for
  // Resume after a late one. The target is chosen in whichever presentation is active now.
  const [jumpAfterRender, setJumpAfterRender] = useState<IssueJump | null>(
    () => rejection ? firstTarget(rejection.issues, getEntityDraftWrite(rejection.state), presentation) : null,
  );
  if (saveProgress.rejected !== seenRejection) {
    setSeenRejection(saveProgress.rejected);
    if (rejection) {
      setIssuesOpen(true);
      setJumpAfterRender(firstTarget(rejection.issues, getEntityDraftWrite(rejection.state), presentation));
    }
  }
  const [confirming, setConfirming] = useState<"cancel" | "overwrite" | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const overwriteRef = useRef<HTMLButtonElement>(null);
  const copyInsteadRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const write = useMemo(() => getEntityDraftWrite(state), [state]);
  const issues = useMemo<PlacedIssue[]>(() => {
    if (rejection) return placeIssues(rejection.issues, write, presentation);
    if (!clientIssues) return [];
    const result = validateDraft(state);
    return result.ok ? [] : placeIssues(result.issues, write, presentation);
  }, [rejection, clientIssues, state, write, presentation]);

  useImperativeHandle(ref, () => ({ settle }), [settle]);
  const commit = useCallback<EntityEditApi["commit"]>(
    (patch, modes) => saving ? "The entity is being saved." : dispatch({ type: "commit", patch, modes }),
    [dispatch, saving],
  );
  // Input left open when this editor unmounts (Back, a breakpoint) stays in `buffer` for the next
  // mount. Controlled navigation settles it first, and an invalid value keeps that navigation in place.
  const api = useMemo<EntityEditApi>(
    () => ({
      draft: write, modes: state.modes, activeId, narrow, presentation, open, close, closeTo, switchTo, commit, commitRef, takeFocus, viewer,
      buffer: bufferApi, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, pendingLive, carriedId,
    }),
    [
      write, state.modes, activeId, narrow, presentation, open, close, closeTo, switchTo, commit, commitRef, takeFocus, viewer,
      bufferApi, focusOpenRef, editorFocusId, claim, registerLive, requestLiveFocus, pendingLive, carriedId,
    ],
  );
  const sheetEntity = useMemo(() => toSheetEntity(entity, write), [entity, write]);

  /**
   * An issue's jump in the current presentation: on a live sheet the field itself takes focus (its
   * line's add control or first field when it is absent); otherwise, and for spellcasting cards
   * and pickers, the editor opens. An entry's text is the same textarea in both presentations.
   */
  const jump = useCallback((targetId: string, focusId: string | null = targetId) => {
    const exactId = focusId ?? targetId;
    if (presentation === "live" ? focusLive(exactId) : isEntryTextId(targetId) && focusLive(targetId, true)) return;
    jumpToEditor(targetId, exactId);
  }, [presentation, focusLive, jumpToEditor]);
  useEffect(() => {
    if (jumpAfterRender === null) return;
    // A target from the original presentation may have reached the slot just before Resume.
    // Clear that carried editor so the current live presentation can mount and focus its field.
    if (presentation === "live" && carriedId === activeId && activeId !== null) {
      reopen(null);
      return;
    }
    jump(jumpAfterRender.targetId, jumpAfterRender.focusId);
    setJumpAfterRender(null);
  }, [activeId, carriedId, jumpAfterRender, jump, presentation, reopen]);

  /** Applies valid unapplied live text through each field's spec; returns how many fields still hold text. */
  const applyLiveText = useCallback(() => settleLive(
    () => ({ draft: getEntityDraftWrite(latestRef.current), modes: latestRef.current.modes }),
    result => (result.ok ? commit(result.patch as Partial<EntityDraft>, result.modes as EntityEditApi["modes"] | undefined) : result.message),
  ), [settleLive, commit]);
  // Leaving the live presentation is a blur: valid typed text applies. Text that does not apply
  // keeps its field on the sheet (see `EntitySheet`), where it can be fixed or reverted.
  useEffect(() => {
    if (presentation === "targets") applyLiveText();
  }, [presentation, applyLiveText]);

  /** Shows the issues and opens the editor of the first one that has an editor. */
  const showIssues = (placed: readonly PlacedIssue[]) => {
    setIssuesOpen(true);
    const first = placed.find(issue => issue.targetId !== null);
    if (first?.targetId) jump(first.targetId, first.focusId);
  };

  const save = async () => {
    if (saving || !settle()) return;
    // A live field that is not focused (after a remount or a switch) holds text no blur applied.
    if (applyLiveText() > 0) return;
    const current = latestRef.current;
    // A pending edit that was valid is in the draft now; an unchanged template has nothing to send.
    if (!current.dirty && current.target !== "new") return;
    const { acknowledged: earlier } = saveProgress;
    onSaveProgress({ pending: true, error: null, acknowledged: earlier });
    setSavingLocally(true);
    const draft = getEntityDraftWrite(current);
    const checked = validateDraft(current);
    if (!checked.ok) {
      onSaveProgress({ pending: false, error: null, acknowledged: earlier });
      setSavingLocally(false);
      setClientIssues(true);
      showIssues(placeIssues(checked.issues, draft, presentation));
      return;
    }
    setClientIssues(false);
    try {
      if (checked.create) {
        const { entity: created } = await create.mutateAsync(checked.value);
        onSaved(created);
        return;
      }
      const id = checked.id;
      const signature = JSON.stringify({ data: checked.value, mode: current.mode });
      let acknowledged = saveProgress.acknowledged;
      let saved: DnD5eEntityDetails;
      if (acknowledged?.id === id && acknowledged.signature === signature) {
        saved = acknowledged.entity;
      } else {
        saved = await update.mutateAsync({
          id,
          data: checked.value,
          ...(current.mode === "overwrite" ? { overwriteImported: true as const } : {}),
        });
        acknowledged = { id, signature, entity: saved };
        dispatch({ type: "acknowledge", snapshot: { draft: current.draft, modes: current.modes } });
      }
      const settings = changedSettings(current.base.draft.settings ?? undefined, draft.settings ?? undefined);
      if (settings) {
        try {
          const stored = await patchSettings.mutateAsync({ id, patch: settings });
          saved = { ...saved, settings: stored };
        } catch (error) {
          onSaveProgress({
            pending: false,
            error: `The stat block was saved, but the behaviour settings were not: ${(error as Error).message}`,
            acknowledged,
          });
          return;
        }
      }
      onSaved(saved);
    } catch (error) {
      if (error instanceof WriteValidationError) {
        // This editor may have unmounted (Back, Resume, a breakpoint) while the save was in flight.
        // The slot carries the issues to whichever editor is mounted now, and the buffer the editor
        // to open; no editor is open during a save, so there is nothing to commit first.
        // A live sheet focuses the field instead, when the rejection reaches the mounted editor.
        const rejected = latestRef.current;
        const openId = firstTarget(error.issues, getEntityDraftWrite(rejected), "targets")?.targetId ?? null;
        if (openId !== null && presentation === "targets") switchTo(openId);
        onSaveProgress({ pending: false, error: error.message, acknowledged: earlier, rejected: { issues: error.issues, state: rejected, openId } });
      } else {
        onSaveProgress({ pending: false, error: (error as Error).message, acknowledged: earlier });
      }
    } finally {
      setSavingLocally(false);
    }
  };
  const { step, undoRef, redoRef } = useSheetHistory({ saving, settle, apply: type => dispatch({ type }) });
  const cancel = () => {
    if (!settle()) return;
    if (latestRef.current.dirty) setConfirming("cancel");
    else onCancel();
  };
  // An open editor may hold a first edit the draft has not seen yet, so Save stays available. A
  // live field's text that did not apply holds Save until it is fixed or reverted (Escape).
  const canSave = (state.dirty || activeId !== null || pendingLive.length > 0 || state.target === "new") && !saving && unapplied === 0;
  // The destination of a save in flight cannot change under it.
  const setMode = (mode: "copy" | "overwrite") => {
    if (saving) return false;
    dispatch({ type: "set-mode", mode });
    return true;
  };

  const dismissConfirm = () => {
    const kind = confirming;
    setConfirming(null);
    window.requestAnimationFrame(() => (kind === "cancel" ? cancelRef : overwriteRef).current?.focus());
  };

  const name = entity.name;
  const imported = entity.imported && state.target !== "new";
  const changes = state.history.past.length;

  return (
    <SheetEditContext value={api}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        onKeyDown={event => handleSheetEditorKeyDown(event, {
          step,
          confirming: confirming !== null,
          dismissConfirm,
          captureEscape: narrow && activeId !== null,
          closeEditor: () => close(true),
        })}
      >
        <EntitySheet
          entity={sheetEntity}
          renderEditHeading={title => (
            <>
              <SheetEditorToolbar
                title={title}
                heading={state.target === "new" ? "New entity" : "Editing"}
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
                canSave={canSave}
                canUndo={state.history.past.length > 0}
                canRedo={state.history.future.length > 0}
                onStep={step}
                undoRef={undoRef}
                redoRef={redoRef}
                onCancel={cancel}
                cancelRef={cancelRef}
                onSave={() => void save()}
                confirmDiscard={confirming === "cancel"
                  ? { name: write.name || name, onDiscard: onCancel, onKeep: dismissConfirm }
                  : null}
                keepRef={confirmRef}
              />
              {confirming === "overwrite" && (
                <div className={sheetStyles.confirm} role="group" aria-label={`Edit the imported ${name}?`}>
                  <p>Re-imports will skip {name}, and the encounters that use it will change.</p>
                  <button type="button" disabled={saving} onClick={() => {
                    if (!setMode("overwrite")) return;
                    setConfirming(null);
                    window.requestAnimationFrame(() => copyInsteadRef.current?.focus());
                  }}>Edit the original</button>
                  <button ref={confirmRef} type="button" onClick={dismissConfirm}>Keep saving a copy</button>
                </div>
              )}
            </>
          )}
          saveDestination={imported && (
            <span className={styles.destination} role="note">
              <span className={styles.visuallyHidden}>
                {state.mode === "overwrite"
                  ? `Saving changes the imported ${name} (${entity.source}) itself. Re-imports will skip it.`
                  : `Saving creates a homebrew copy. The imported ${name} (${entity.source}) is unchanged.`}
              </span>
              {state.mode === "overwrite" ? (
                <>
                  Editing original
                  <button ref={copyInsteadRef} type="button" disabled={saving} aria-label="Save as a copy instead" onClick={() => setMode("copy")}>Save as a copy</button>
                </>
              ) : (
                <>
                  Homebrew copy
                  <button ref={overwriteRef} type="button" disabled={saving} aria-label="Edit the original instead" onClick={() => setConfirming("overwrite")}>Edit the original</button>
                </>
              )}
            </span>
          )}
        >
          {children}
        </EntitySheet>
      </div>
    </SheetEditContext>
  );
});
