import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IssueJump } from "./issues.js";
import type { FieldParse } from "./fieldSpec.js";
import {
  countInvalidLive,
  pendingLiveIds,
  type EditorBuffer,
  type EditorBufferApi,
  type SheetEditControls,
} from "./SheetEditContext.js";
import type { SheetPresentation } from "./usePresentation.js";

type OpenEditorOptions = {
  /** The draft slot's buffer; the open editor and its input are mirrored into it. */
  buffer: EditorBuffer;
  /** While a save is in flight no editor opens. */
  saving: boolean;
  presentation: SheetPresentation;
};

export type OpenEditor = Pick<
  SheetEditControls,
  "activeId" | "open" | "close" | "closeTo" | "switchTo" | "commitRef" | "takeFocus" | "focusOpenRef" | "claim"
  | "registerLive" | "requestLiveFocus" | "pendingLive" | "carriedId" | "editorFocusId"
> & {
  bufferApi: EditorBufferApi;
  /** Opens the issue's editor and focuses its field once the controls mount. */
  jumpToEditor: (targetId: string, fieldId: string) => void;
  /**
   * Makes `id` the open editor again without clearing its buffer, for an editor a save rejection
   * named while another mount of the editor sent the save (that mount already filled the buffer).
   */
  reopen: (id: string | null) => void;
  /**
   * A toolbar action while an editor is open: commits the editor's value and closes it, or, when
   * the value is invalid, leaves it open with its message and reports false so the action stops.
   */
  settle: () => boolean;
  /** Live fields holding text that did not apply. Save waits until they are fixed or reverted. */
  unapplied: number;
  /**
   * Focuses the live control for `id` now: the exact one, else (unless `exact`) its line's add
   * control, else the line's first field.
   */
  focusLive: (id: string, exact?: boolean) => boolean;
  /**
   * Applies every live field's unapplied text that is valid against the latest draft (a field that
   * is not mounted cannot be blurred). Text that does not apply keeps its message. Returns how many
   * fields still hold text.
   */
  settleLive: (draft: () => { draft: unknown; modes: unknown }, commit: (result: FieldParse<unknown, unknown>) => string | undefined) => number;
  /** Drops unapplied text whose field the draft changed (Undo, Redo, another commit) or removed. */
  pruneLive: (draft: unknown, modes: unknown) => void;
};

type LiveSummary = { ids: readonly string[]; invalid: number };

const summarize = (buffer: EditorBuffer): LiveSummary => ({ ids: pendingLiveIds(buffer), invalid: countInvalidLive(buffer) });

const sameSummary = (left: LiveSummary, right: LiveSummary) =>
  left.invalid === right.invalid && left.ids.length === right.ids.length && left.ids.every((id, index) => id === right.ids[index]);

/** The one open editor of a sheet in edit mode: which it is, how it opens and closes, and its buffer. */
export const useOpenEditor = ({ buffer, saving, presentation }: OpenEditorOptions): OpenEditor => {
  const bufferRef = useRef(buffer);
  const [activeId, setActiveIdState] = useState<string | null>(buffer.activeId);
  // An editor open when the sheet switches to `live` (or mounts there, after a breakpoint) has no
  // live field to hand its input to, so it stays open as it was. It is "carried" while it is open.
  const [carriedId, setCarriedId] = useState<string | null>(presentation === "live" ? buffer.activeId : null);
  const [seenPresentation, setSeenPresentation] = useState(presentation);
  if (presentation !== seenPresentation) {
    setSeenPresentation(presentation);
    setCarriedId(presentation === "live" ? activeId : null);
  }
  const [editorJump, setEditorJump] = useState<IssueJump | null>(null);
  // Every change of editor starts the buffer afresh: the open input was committed first, and after
  // a move renumbers entries the same id can name another entry. Only a remount restores it.
  const setActiveId = useCallback((id: string | null) => {
    setEditorJump(null);
    bufferRef.current.activeId = id;
    bufferRef.current.values = {};
    setActiveIdState(id);
  }, []);
  // Live text reaches the buffer from the fields' effects; only which fields hold text, and how
  // many of them are invalid, re-render.
  const [live, setLive] = useState<LiveSummary>(() => summarize(buffer));
  const syncLive = useCallback(() => {
    const next = summarize(bufferRef.current);
    setLive(current => (sameSummary(current, next) ? current : next));
  }, []);
  const bufferApi = useMemo<EditorBufferApi>(() => ({
    restore: key => Object.hasOwn(bufferRef.current.values, key) ? { value: bufferRef.current.values[key] } : undefined,
    keep: (key, value) => {
      bufferRef.current.values[key] = value;
    },
    forget: key => {
      delete bufferRef.current.values[key];
    },
    restoreAddedRow: () => bufferRef.current.addedRow,
    keepAddedRow: row => {
      bufferRef.current.addedRow = row;
    },
    restoreLive: key => bufferRef.current.live[key],
    keepLive: (key, entry) => {
      bufferRef.current.live[key] = entry;
      syncLive();
    },
    forgetLive: key => {
      if (!Object.hasOwn(bufferRef.current.live, key)) return;
      delete bufferRef.current.live[key];
      syncLive();
    },
  }), [syncLive]);

  const pruneLive = useCallback((draft: unknown, modes: unknown) => {
    const entries = bufferRef.current.live;
    let changed = false;
    for (const [key, entry] of Object.entries(entries)) {
      if (entry.read(draft, modes) === entry.base) continue;
      delete entries[key];
      changed = true;
    }
    if (changed) syncLive();
  }, [syncLive]);

  const settleLive = useCallback<OpenEditor["settleLive"]>((latest, commit) => {
    const entries = bufferRef.current.live;
    for (const key of Object.keys(entries)) {
      const entry = entries[key];
      // An earlier commit may have replaced or removed this one.
      if (!entry || entry.error !== null) continue;
      const { draft, modes } = latest();
      const problem = commit(entry.parse(entry.text, draft, modes));
      if (problem) entries[key] = { ...entry, error: problem };
      else delete entries[key];
    }
    syncLive();
    return Object.keys(entries).length;
  }, [syncLive]);

  const commitRef = useRef<(() => boolean) | null>(null);
  const focusOpenRef = useRef<((fieldId?: string | null) => void) | null>(null);
  const focusIdRef = useRef<string | null>(null);

  const open = useCallback((id: string | (() => string | null)) => {
    if (saving) return false;
    if (commitRef.current && !commitRef.current()) return false;
    setActiveId(typeof id === "function" ? id() : id);
    return true;
  }, [saving, setActiveId]);
  const jumpToEditor = useCallback((targetId: string, focusId: string) => {
    if (saving) return;
    if (activeId === targetId || open(targetId)) setEditorJump({ targetId, focusId });
  }, [activeId, open, saving]);
  useEffect(() => {
    if (editorJump === null || activeId !== editorJump.targetId) return;
    focusOpenRef.current?.(editorJump.focusId);
  }, [activeId, editorJump]);
  const claim = useCallback((): boolean => {
    if (!saving && activeId === null && commitRef.current === null) return true;
    if (open(() => null)) return true;
    focusOpenRef.current?.();
    return false;
  }, [saving, activeId, open]);
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
  const settle = useCallback((): boolean => {
    // Navigation may leave a save in flight, but a save never starts with a buffer still open.
    if (saving) return commitRef.current === null;
    if (commitRef.current && !commitRef.current()) return false;
    focusIdRef.current = null;
    setActiveId(null);
    return true;
  }, [saving, setActiveId]);

  // Live controls by id. One control may answer several ids (the Strength save answers "saves").
  const controlsRef = useRef(new Map<string, HTMLElement>());
  const registerLive = useCallback((ids: readonly string[], element: HTMLElement) => {
    const controls = controlsRef.current;
    for (const id of ids) controls.set(id, element);
    return () => {
      // A control that took over the id since (a token now at this index) keeps it.
      for (const id of ids) if (controls.get(id) === element) controls.delete(id);
    };
  }, []);
  const focusLive = useCallback((id: string, exact = false): boolean => {
    const controls = controlsRef.current;
    const field = id.split(".")[0];
    const element = exact ? controls.get(id) : controls.get(id)
      ?? controls.get(field)
      ?? [...controls].find(([candidate]) => candidate.startsWith(`${field}.`))?.[1];
    if (!element) return false;
    element.focus();
    return true;
  }, []);
  // A request is made in an event (a commit); the render it causes mounts the control, then the
  // effect focuses it. The counter makes sure that render happens even when the commit changed nothing.
  const focusRequestRef = useRef<string | null>(null);
  const [focusRequests, setFocusRequests] = useState(0);
  const requestLiveFocus = useCallback((id: string) => {
    focusRequestRef.current = id;
    setFocusRequests(count => count + 1);
  }, []);
  useEffect(() => {
    const id = focusRequestRef.current;
    if (id === null) return;
    focusRequestRef.current = null;
    focusLive(id);
  }, [focusRequests, focusLive]);

  return {
    activeId, open, close, closeTo, switchTo, commitRef, takeFocus, focusOpenRef, claim,
    registerLive, requestLiveFocus, focusLive, pendingLive: live.ids, carriedId,
    editorFocusId: editorJump?.targetId === activeId ? editorJump.focusId : null,
    bufferApi, jumpToEditor, reopen: setActiveIdState, settle, unapplied: live.invalid, settleLive, pruneLive,
  };
};
