/**
 * A stable key per trait, action or spellcasting row while it is edited. A row's position (its id,
 * `actions.3`) changes when entries move, are added or removed, and its object changes with every
 * edit, so neither can keep a field mounted or hold its unapplied text. Each edit that writes a new
 * object for a row carries the key over (`carryEntryKey`); Undo and Redo bring back objects that
 * already have theirs.
 */
const keys = new WeakMap<object, number>();
let lastKey = 0;

export const entryKey = (row: object): number => {
  let key = keys.get(row);
  if (key === undefined) {
    key = ++lastKey;
    keys.set(row, key);
  }
  return key;
};

/** `next` replaces `row` in the draft: it keeps the row's key. Returns `next`. */
export const carryEntryKey = <T extends object>(row: object, next: T): T => {
  keys.set(next, entryKey(row));
  return next;
};
