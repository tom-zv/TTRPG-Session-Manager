import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { EntityWriteError } from "src/pages/EncounterManager/api/entityApi.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import type { ItemViewer } from "../../../api/query/itemKeys.js";
import { NARROW_BROWSER_QUERY } from "../../browser/BrowserLayout.js";
import { EntitySheet } from "../EntitySheet.js";
import { EntityEditContext, type EditorBuffer, type EditorBufferApi, type EntityEditApi } from "./EntityEditContext.js";
import { MAX_PASSIVE_PERCEPTION } from "./editors/fieldLimits.js";
import {
  entityDraftReducer,
  getEntityDraftWrite,
  type EntityDraftAction,
  type EntityDraftState,
} from "./hooks/useEntityDraft.js";
import type { EntityDraft } from "./model/defaults.js";
import { getAutoPassivePerception } from "./model/inference.js";
import { placeIssues, type PlacedIssue } from "./model/issueTargets.js";
import { changedSettings } from "./model/settingsPatch.js";
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

const isEditableElement = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);

/**
 * Edit mode for the Compendium sheet: the toolbar (changes, issues, Undo and Redo, Cancel, Save),
 * the copy or overwrite banner for imported entities, and the save rules. Save validates the whole
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
    onChange(next);
    return undefined;
  }, [onChange]);
  const bufferRef = useRef(buffer);
  const [activeId, setActiveIdState] = useState<string | null>(buffer.activeId);
  // Every change of editor starts the buffer afresh: the open input was committed first, and after
  // a move renumbers entries the same id can name another entry. Only a remount restores it.
  const setActiveId = useCallback((id: string | null) => {
    bufferRef.current.activeId = id;
    bufferRef.current.values = {};
    bufferRef.current.newEntry = null;
    setActiveIdState(id);
  }, []);
  const bufferApi = useMemo<EditorBufferApi>(() => ({
    restore: key => Object.hasOwn(bufferRef.current.values, key) ? { value: bufferRef.current.values[key] } : undefined,
    keep: (key, value) => {
      bufferRef.current.values[key] = value;
    },
    forget: key => {
      delete bufferRef.current.values[key];
    },
    restoreNewEntry: () => bufferRef.current.newEntry,
    keepNewEntry: entry => {
      bufferRef.current.newEntry = entry;
    },
  }), []);
  const commitRef = useRef<(() => boolean) | null>(null);
  const focusIdRef = useRef<string | null>(null);
  const narrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const create = useCreateDnD5eEntity();
  const update = useUpdateDnD5eEntity();
  const patchSettings = usePatchDnD5eEntitySettings();
  const [savingLocally, setSavingLocally] = useState(false);
  const saving = savingLocally || saveProgress.pending;
  // Client issues are re-checked as the draft changes; the server's stand until the next edit.
  const [clientIssues, setClientIssues] = useState(false);
  const rejection = saveProgress.rejected?.state === state ? saveProgress.rejected : undefined;
  const [issuesOpen, setIssuesOpen] = useState(rejection !== undefined);
  // A rejection that arrives while this editor is mounted shows its issues and opens the first
  // one's editor. The editor that sent the save already wrote that editor into the slot's buffer.
  const [seenRejection, setSeenRejection] = useState(saveProgress.rejected);
  if (saveProgress.rejected !== seenRejection) {
    setSeenRejection(saveProgress.rejected);
    if (rejection) {
      setIssuesOpen(true);
      if (rejection.openId !== null) setActiveIdState(rejection.openId);
    }
  }
  const [confirming, setConfirming] = useState<"cancel" | "overwrite" | null>(null);
  const issuesId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const overwriteRef = useRef<HTMLButtonElement>(null);
  const copyInsteadRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const write = useMemo(() => getEntityDraftWrite(state), [state]);
  const issues = useMemo<PlacedIssue[]>(() => {
    if (rejection) return placeIssues(rejection.issues, write);
    if (!clientIssues) return [];
    const result = validateDraft(state);
    return result.ok ? [] : placeIssues(result.issues, write);
  }, [rejection, clientIssues, state, write]);

  const open = useCallback((id: string | (() => string | null)) => {
    if (saving) return false;
    if (commitRef.current && !commitRef.current()) return false;
    setActiveId(typeof id === "function" ? id() : id);
    return true;
  }, [saving, setActiveId]);
  const close = useCallback((restoreFocus = false) => {
    focusIdRef.current = restoreFocus ? activeId : null;
    setActiveId(null);
  }, [activeId, setActiveId]);
  const closeTo = useCallback((focusId: string) => {
    focusIdRef.current = focusId;
    setActiveId(null);
  }, [setActiveId]);
  const switchTo = useCallback((id: string) => {
    focusIdRef.current = null;
    setActiveId(id);
  }, [setActiveId]);
  const takeFocus = useCallback((id: string) => {
    const mine = focusIdRef.current === id;
    if (mine) focusIdRef.current = null;
    return mine;
  }, []);
  /**
   * A toolbar action while an editor is open: commits the editor's value and closes it, or, when
   * the value is invalid, leaves it open with its message and reports false so the action stops.
   */
  const settle = useCallback((): boolean => {
    // Navigation may leave a save in flight, but a save never starts with a buffer still open.
    if (saving) return commitRef.current === null;
    if (commitRef.current && !commitRef.current()) return false;
    focusIdRef.current = null;
    setActiveId(null);
    return true;
  }, [saving, setActiveId]);
  useImperativeHandle(ref, () => ({ settle }), [settle]);
  const commit = useCallback<EntityEditApi["commit"]>(
    (patch, modes) => saving ? "The entity is being saved." : dispatch({ type: "commit", patch, modes }),
    [dispatch, saving],
  );
  // Input left open when this editor unmounts (Back, a breakpoint) stays in `buffer` for the next
  // mount. Controlled navigation settles it first, and an invalid value keeps that navigation in place.

  const api = useMemo<EntityEditApi>(
    () => ({ draft: write, modes: state.modes, activeId, narrow, open, close, closeTo, switchTo, commit, commitRef, takeFocus, viewer, buffer: bufferApi }),
    [write, state.modes, activeId, narrow, open, close, closeTo, switchTo, commit, takeFocus, viewer, bufferApi],
  );
  const sheetEntity = useMemo(() => toSheetEntity(entity, write), [entity, write]);

  /** Shows the issues and opens the editor of the first one that has an editor. */
  const showIssues = (placed: readonly PlacedIssue[]) => {
    setIssuesOpen(true);
    const first = placed.find(issue => issue.targetId !== null);
    if (first?.targetId) open(first.targetId);
  };

  const save = async () => {
    if (saving || !settle()) return;
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
      showIssues(placeIssues(checked.issues, draft));
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
      if (error instanceof EntityWriteError) {
        // This editor may have unmounted (Back, Resume, a breakpoint) while the save was in flight.
        // The slot carries the issues to whichever editor is mounted now, and the buffer the editor
        // to open; no editor is open during a save, so there is nothing to commit first.
        const rejected = latestRef.current;
        const openId = placeIssues(error.issues, getEntityDraftWrite(rejected)).find(issue => issue.targetId !== null)?.targetId ?? null;
        if (openId !== null) {
          focusIdRef.current = null;
          setActiveId(openId);
        }
        onSaveProgress({ pending: false, error: error.message, acknowledged: earlier, rejected: { issues: error.issues, state: rejected, openId } });
      } else {
        onSaveProgress({ pending: false, error: (error as Error).message, acknowledged: earlier });
      }
    } finally {
      setSavingLocally(false);
    }
  };
  const undoRef = useRef<HTMLButtonElement>(null);
  const redoRef = useRef<HTMLButtonElement>(null);
  const step = (type: "undo" | "redo") => {
    if (saving) return;
    if (!settle()) return;
    dispatch({ type });
    // A step can remove the focused control (an added entry, an open card). Focus then goes to the
    // history button that is certainly enabled now: Redo after Undo, Undo after Redo.
    window.setTimeout(() => {
      if (document.activeElement === null || document.activeElement === document.body) {
        (type === "undo" ? redoRef : undoRef).current?.focus();
      }
    }, 0);
  };
  const cancel = () => {
    if (!settle()) return;
    if (latestRef.current.dirty) setConfirming("cancel");
    else onCancel();
  };
  // An open editor may hold a first edit the draft has not seen yet, so Save stays available.
  const canSave = (state.dirty || activeId !== null || state.target === "new") && !saving;
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.target as Node)) return;
    // Undo and Redo over committed edits; text fields keep their own undo.
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z" && !isEditableElement(event.target)) {
      event.preventDefault();
      step(event.shiftKey ? "redo" : "undo");
      return;
    }
    if (event.key === "Escape" && confirming) {
      event.preventDefault();
      event.stopPropagation();
      dismissConfirm();
      return;
    }
    if (!narrow || activeId === null || event.key !== "Escape") return;
    // Catch Escape from controls anywhere in the sheet before it reaches the narrow dialog.
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  const name = entity.name;
  const showBanner = entity.imported && state.target !== "new";
  const changes = state.history.past.length;

  return (
    <EntityEditContext value={api}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div onKeyDown={handleKeyDown}>
        <div className={styles.toolbar} role="toolbar" aria-label="Editing">
          <span>
            {state.target === "new" ? "New entity" : "Editing"}
            {/* After a partial save, Undo can return to the loaded values, which are no longer stored. */}
            {state.dirty ? (changes > 0 ? ` · ${changes} changes` : " · unsaved changes") : ""}
          </span>
          {issues.length > 0 && (
            <button
              type="button"
              className={styles.issuesButton}
              aria-expanded={issuesOpen}
              aria-controls={issuesId}
              onClick={() => setIssuesOpen(value => !value)}
            >
              {issues.length} {issues.length === 1 ? "issue" : "issues"}
            </button>
          )}
          <button ref={undoRef} type="button" disabled={saving || state.history.past.length === 0} onClick={() => step("undo")} aria-keyshortcuts="Control+Z">Undo</button>
          <button ref={redoRef} type="button" disabled={saving || state.history.future.length === 0} onClick={() => step("redo")} aria-keyshortcuts="Control+Shift+Z">Redo</button>
          <button ref={cancelRef} type="button" disabled={saving} onClick={cancel}>Cancel</button>
          <button type="button" className={styles.save} disabled={!canSave} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {confirming === "cancel" && (
          <div className={styles.confirm} role="group" aria-label="Discard unsaved changes?">
            <p>Discard the unsaved changes to {write.name || name}?</p>
            <button type="button" onClick={onCancel}>Discard changes</button>
            <button ref={confirmRef} type="button" onClick={dismissConfirm}>Keep editing</button>
          </div>
        )}
        {(saveProgress.error || (issues.length > 0 && !rejection && clientIssues)) && (
          <p role="alert" className={styles.error}>
            {saveProgress.error ?? `Not saved. Fix ${issues.length} ${issues.length === 1 ? "issue" : "issues"} first.`}
          </p>
        )}
        {issuesOpen && issues.length > 0 && (
          <ul id={issuesId} className={styles.issues} aria-label="Issues">
            {issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.targetId ? (
                  <button type="button" onClick={() => open(issue.targetId!)}>
                    {issue.place}: {issue.message}
                  </button>
                ) : (
                  <span>{issue.place}: {issue.message}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {showBanner && (state.mode === "overwrite" ? (
          <div className={styles.banner} role="note">
            <p>Saving changes the imported {name} ({entity.source}) itself. Re-imports will skip it.</p>
            <button ref={copyInsteadRef} type="button" disabled={saving} onClick={() => setMode("copy")}>Save as a copy instead</button>
          </div>
        ) : (
          <div className={styles.banner} role="note">
            <p>Saving creates a homebrew copy. The imported {name} ({entity.source}) is unchanged.</p>
            {confirming === "overwrite" ? (
              <div className={styles.confirm} role="group" aria-label={`Edit the imported ${name}?`}>
                <p>Re-imports will skip {name}, and the encounters that use it will change.</p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (!setMode("overwrite")) return;
                    setConfirming(null);
                    window.requestAnimationFrame(() => copyInsteadRef.current?.focus());
                  }}
                >
                  Edit the original
                </button>
                <button ref={confirmRef} type="button" onClick={dismissConfirm}>Keep saving a copy</button>
              </div>
            ) : (
              <button ref={overwriteRef} type="button" disabled={saving} onClick={() => setConfirming("overwrite")}>Edit the original instead</button>
            )}
          </div>
        ))}
        <EntitySheet entity={sheetEntity}>{children}</EntitySheet>
      </div>
    </EntityEditContext>
  );
});
