import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ItemViewer } from "../../../api/query/itemKeys.js";
import type { EntityDraft } from "./model/defaults.js";
import type { EntityDraftModes } from "./model/inference.js";

/**
 * The open editor's input, owned by the browser's draft slot rather than by the editor. A reader
 * remount (crossing the breakpoint) or Resume reopens the same editor with the same input, valid or
 * not, so nothing typed is lost before it is committed or explicitly discarded.
 */
export type EditorBuffer = {
  activeId: string | null;
  /** Input that differs from what the editor opened with, by `useEditorState` key. */
  values: Record<string, unknown>;
  /** A new entry whose card is open; it is not in the draft until the card saves. */
  newEntry: unknown;
};

export const createEditorBuffer = (): EditorBuffer => ({ activeId: null, values: {}, newEntry: null });

/** Whether the open editor holds input the draft has not seen yet. */
export const hasOpenInput = (buffer: EditorBuffer): boolean =>
  buffer.activeId !== null && Object.keys(buffer.values).length > 0;

/** How editors reach the open editor's buffer; see `useEditorState`. */
export type EditorBufferApi = {
  /** The input a remount restores for this key, if the open editor left one. */
  restore: (key: string) => { value: unknown } | undefined;
  keep: (key: string, value: unknown) => void;
  forget: (key: string) => void;
  /** The new entry whose card was open, for `EditableEntrySections`. */
  restoreNewEntry: () => unknown;
  keepNewEntry: (entry: unknown) => void;
};

export type EntityEditApi = {
  /** The draft as the sheet renders it: automatic passive Perception already computed. */
  draft: EntityDraft;
  modes: EntityDraftModes;
  /** The id of the one open editor, or null. Ids follow the validator's paths where one exists. */
  activeId: string | null;
  /** The sheet is inside the narrow dialog, where popovers expand inline instead. */
  narrow: boolean;
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
  /** Applies the patch, or returns a validation message without changing the draft. */
  commit: (patch: Partial<EntityDraft>, modes?: Partial<EntityDraftModes>) => string | undefined;
  /** Set by the open editor: commits its value, and returns false when it is invalid. */
  commitRef: MutableRefObject<(() => boolean) | null>;
  /** True once, for the target whose editor `close(true)` closed: it takes focus back. */
  takeFocus: (id: string) => boolean;
  /** The open editor's input, kept with the draft slot; absent for a control rendered on its own. */
  buffer?: EditorBufferApi;
};

export const EntityEditContext = createContext<EntityEditApi | null>(null);

/** The sheet's edit state, or null in view mode. */
export const useEntityEdit = (): EntityEditApi | null => useContext(EntityEditContext);

/** For editors, which only render while editing. */
export const useActiveEdit = (): EntityEditApi => {
  const edit = useEntityEdit();
  if (!edit) throw new Error("An entity editor rendered outside edit mode.");
  return edit;
};

/** Registers how the open editor commits, for `open` and for a click outside a popover. */
export const useCommitHandler = (commit: () => boolean): void => {
  const { commitRef } = useActiveEdit();
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  useEffect(() => {
    commitRef.current = () => latest.current();
    return () => {
      commitRef.current = null;
    };
  }, [commitRef]);
};

/**
 * `useState` for an open editor's input. The value is mirrored into the draft slot's buffer while
 * it differs from the initial one, and an editor remounted for the same target starts from it.
 */
export function useEditorState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const { buffer } = useActiveEdit();
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
