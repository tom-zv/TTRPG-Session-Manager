import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import type { FieldParse } from "./fieldSpec.js";
import type { SheetPresentation } from "./usePresentation.js";

/**
 * The open editor's input, owned by the browser's draft slot rather than by the editor. A reader
 * remount (crossing the breakpoint) or Resume reopens the same editor with the same input, valid or
 * not, so nothing typed is lost before it is committed or explicitly discarded.
 */
export type EditorBuffer = {
  activeId: string | null;
  /** Input that differs from what the editor opened with, by `useEditorState` key. */
  values: Record<string, unknown>;
  /**
   * A row added on the sheet that is not in the draft yet (an entity trait being typed). It is not
   * an editor, so it outlives editor changes; the sheet drops it once it lands in the draft or is
   * left blank.
   */
  addedRow: unknown;
  /**
   * Text typed into live fields that is not in the draft, by the field's buffer key: still being
   * typed, or invalid and showing its message. It outlives the open editor, which live fields are not.
   */
  live: Record<string, LiveText>;
};

/** A live field's unapplied text, and its message when the text did not apply. */
export type LiveText = {
  text: string;
  error: string | null;
  /** The field's issue target id ("ac", "languages.1"), so the sheet can show the field that holds it. */
  id: string;
  /** The value the text was typed over. Once the draft's value differs, the text is replaced. */
  base: string;
  /**
   * The field's value in a draft, or undefined when the field is gone (a removed token). Pure, so
   * the text can be applied or dropped after the field unmounts (a presentation switch, Resume).
   */
  read: (draft: unknown, modes: unknown) => string | undefined;
  parse: (text: string, draft: unknown, modes: unknown) => FieldParse<unknown, unknown>;
};

export const createEditorBuffer = (): EditorBuffer => ({ activeId: null, values: {}, addedRow: null, live: {} });

/** Whether the open editor or a live field holds input the draft has not seen yet. */
export const hasOpenInput = (buffer: EditorBuffer): boolean =>
  (buffer.activeId !== null && Object.keys(buffer.values).length > 0) || Object.keys(buffer.live).length > 0;

/** How many live fields hold text that did not apply; Save waits for them. */
export const countInvalidLive = (buffer: EditorBuffer): number =>
  Object.values(buffer.live).filter(entry => entry.error !== null).length;

/** The issue target ids of the live fields that hold unapplied text. */
export const pendingLiveIds = (buffer: EditorBuffer): string[] => Object.values(buffer.live).map(entry => entry.id);

/** How editors reach the open editor's buffer; see `useEditorState`. */
export type EditorBufferApi = {
  /** The input a remount restores for this key, if the open editor left one. */
  restore: (key: string) => { value: unknown } | undefined;
  keep: (key: string, value: unknown) => void;
  forget: (key: string) => void;
  /** The added row that is not in the draft yet; see `EditorBuffer.addedRow`. */
  restoreAddedRow: () => unknown;
  keepAddedRow: (row: unknown) => void;
  /** A live field's unapplied text by buffer key, restored when the field mounts again (Resume, a breakpoint). */
  restoreLive: (key: string) => LiveText | undefined;
  keepLive: (key: string, entry: LiveText) => void;
  forgetLive: (key: string) => void;
};

/** Which editors open and how they close: everything the sheet's editors share, whatever the record. */
export type SheetEditControls = {
  /** The id of the one open editor, or null. Ids follow the validator's paths where one exists. */
  activeId: string | null;
  /** The sheet is inside the narrow dialog, where popovers expand inline instead. */
  narrow: boolean;
  /** Values are live inputs on the sheet (`live`), or targets that open an editor (`targets`). */
  presentation: SheetPresentation;
  /**
   * Opens an editor. The open one commits first and, when its value is invalid, stays open instead
   * (false). A function is called after that commit, for an id the commit may have changed (an
   * entry's position); null opens nothing.
   */
  open: (id: string | (() => string | null)) => boolean;
  /** Closes the open editor without committing; `restoreFocus` returns focus to its target. */
  close: (restoreFocus?: boolean) => void;
  /** Closes the open editor without committing and puts focus on another target, e.g. the entry a new card became. */
  closeTo: (focusId: string) => void;
  /** Makes another editor the open one without committing the current one, which already saved its value. */
  switchTo: (id: string) => void;
  /** The signed-in viewer, for catalog searches such as the item picker; absent where there is none. */
  viewer?: ItemViewer;
  /** Set by the open editor: commits its value, and returns false when it is invalid. */
  commitRef: MutableRefObject<(() => boolean) | null>;
  /** True once, for the target whose editor `close(true)` closed: it takes focus back. */
  takeFocus: (id: string) => boolean;
  /** The open editor's input, kept with the draft slot; absent for a control rendered on its own. */
  buffer?: EditorBufferApi;
  /** Set by the open editor: focuses an exact field, or its invalid/first control when omitted. */
  focusOpenRef: MutableRefObject<((fieldId?: string | null) => void) | null>;
  /** The exact field an issue jump wants a newly mounted editor to focus. */
  editorFocusId: string | null;
  /**
   * A live control is about to change the draft: commits and closes the open editor first. False,
   * with focus back on that editor, when it is invalid and stays open; the live edit then must not apply.
   */
  claim: () => boolean;
  /** Lets an issue jump or a focus request find a live control by any of its ids; returns the unregister. */
  registerLive: (ids: readonly string[], element: HTMLElement) => () => void;
  /** Focuses the live control for `id` once it is mounted (after the commit that adds it). */
  requestLiveFocus: (id: string) => void;
  /** Issue target ids of the live fields holding unapplied text (they stay live fields in `targets`). */
  pendingLive: readonly string[];
  /** The click-to-edit editor that was open when the sheet switched to `live`; it stays open there. */
  carriedId: string | null;
};

export type SheetEditApi<Draft, Modes> = SheetEditControls & {
  /** The draft as the sheet renders it. */
  draft: Draft;
  /** Per-field modes kept beside the draft (for example how a value is derived). */
  modes: Modes;
  /** Applies the patch, or returns a validation message without changing the draft. */
  commit: (patch: Partial<Draft>, modes?: Partial<Modes>) => string | undefined;
};

/**
 * Holds a `SheetEditApi` for the record type of the editor that provides it. The kit's own
 * components read only `SheetEditControls`; each record type reads its draft through a typed hook
 * built on `useSheetEdit`.
 */
export const SheetEditContext = createContext<SheetEditControls | null>(null);

/**
 * The sheet's edit state, or null in view mode. `Draft` and `Modes` must be the provider's: call it
 * through the record type's own hook rather than choosing them at the call site.
 */
export const useSheetEdit = <Draft = unknown, Modes = unknown>(): SheetEditApi<Draft, Modes> | null =>
  useContext(SheetEditContext) as SheetEditApi<Draft, Modes> | null;

/**
 * Whether one region of the sheet (a target's area: "ac", "subtitle") draws live fields. Normally
 * the presentation decides; across a switch, input stays where it was typed: in `targets` a region
 * whose live field holds unapplied text stays live until it is applied, fixed or reverted, and in
 * `live` the editor carried over from `targets` stays a target until it closes. `regionOf` maps a
 * live field's id to its region.
 */
export const drawsLive = (edit: SheetEditControls | null, region: string, regionOf: (id: string) => string): boolean => {
  if (!edit) return false;
  if (edit.presentation === "live") return !(edit.carriedId !== null && edit.activeId === edit.carriedId && edit.carriedId === region);
  return edit.pendingLive.some(id => regionOf(id) === region);
};

/** For editors, which only render while editing. */
export const useActiveSheetEdit = <Draft = unknown, Modes = unknown>(): SheetEditApi<Draft, Modes> => {
  const edit = useSheetEdit<Draft, Modes>();
  if (!edit) throw new Error("A sheet editor rendered outside edit mode.");
  return edit;
};

const focusEditorIn = (element: HTMLElement | null, fieldId?: string | null) => {
  const controls = [...(element?.querySelectorAll<HTMLElement>("[data-sheet-field-id]:not(:disabled)") ?? [])];
  const field = fieldId?.split(".")[0];
  const target = controls.find(control => control.dataset.sheetFieldId === fieldId)
    ?? controls.find(control => control.dataset.sheetFieldId === field)
    ?? element?.querySelector<HTMLElement>("[aria-invalid=\"true\"]")
    ?? element?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled), select:not(:disabled)");
  target?.focus();
};

/**
 * Registers how the open editor commits, for `open` and for a click outside a popover, and, given
 * its element, how focus returns to it when a live control is refused (`claim`).
 */
export const useCommitHandler = (commit: () => boolean, element?: RefObject<HTMLElement | null>): void => {
  const { commitRef, focusOpenRef } = useActiveSheetEdit();
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => {
    commitRef.current = () => latest.current();
    focusOpenRef.current = element ? fieldId => focusEditorIn(element.current, fieldId) : null;
    return () => {
      commitRef.current = null;
      focusOpenRef.current = null;
    };
  }, [commitRef, focusOpenRef, element]);
};

/**
 * `useState` for an open editor's input. The value is mirrored into the draft slot's buffer while
 * it differs from the initial one, and an editor remounted for the same target starts from it.
 */
export function useEditorState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const { buffer } = useActiveSheetEdit();
  const [first] = useState(initial);
  // A value this key held before the remount; editors only store what they set themselves.
  const [value, setValue] = useState<T>(() => {
    const restored = buffer?.restore(key);
    return restored ? restored.value as T : first;
  });
  useEffect(() => {
    if (Object.is(value, first)) buffer?.forget(key);
    else buffer?.keep(key, value);
  });
  return [value, setValue];
}
