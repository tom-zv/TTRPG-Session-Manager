/**
 * The `{` reference trigger in a rich-text source field: given the text and a collapsed caret, is
 * the caret inside an unclosed `{…` run, and what has been typed in it? The menu has no state of
 * its own beyond this, so a remount or Resume with the caret back in the run finds the same menu.
 *
 * `{` · `{s` · `{@i` — choosing the type (stage "type"; the letters filter the types by prefix).
 * `{s fire` · `{@item long` — a locked type and its query (stage "search").
 */

export const REFERENCE_TYPES = ["spell", "item"] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

type RunBounds = {
  /** Index of the `{`. */
  start: number;
  /** The caret; a pick replaces `start`..`end`. */
  end: number;
  /** The run typed `{@…` rather than `{…`. */
  at: boolean;
};

export type ReferenceRun =
  | (RunBounds & { stage: "type"; word: string; types: ReferenceType[] })
  | (RunBounds & { stage: "search"; type: ReferenceType; query: string });

const TYPE_WORD = /^(@?)([A-Za-z]*)$/;
const LOCKED = /^(@?)([A-Za-z]+) (.*)$/;

const typesFor = (word: string): ReferenceType[] => REFERENCE_TYPES.filter(type => type.startsWith(word.toLowerCase()));

/**
 * The run the caret is in, or null. The caret is in a run when a `{` precedes it with no `}` or
 * newline in between, and the run is not already closed: a `}` after the caret, before any `{` or
 * newline, makes it a complete tag the caret has moved into.
 */
export function findReferenceRun(text: string, caret: number | null): ReferenceRun | null {
  if (caret === null || caret < 1 || caret > text.length) return null;
  let start = -1;
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (char === "}" || char === "\n") return null;
    if (char === "{") {
      start = index;
      break;
    }
  }
  if (start === -1) return null;
  for (let index = caret; index < text.length; index += 1) {
    const char = text[index];
    if (char === "}") return null;
    if (char === "{" || char === "\n") break;
  }
  const body = text.slice(start + 1, caret);
  const choosing = TYPE_WORD.exec(body);
  if (choosing) {
    return { start, end: caret, at: choosing[1] === "@", stage: "type", word: choosing[2], types: typesFor(choosing[2]) };
  }
  const locked = LOCKED.exec(body);
  const types = locked ? typesFor(locked[2]) : [];
  if (locked && types.length === 1) {
    return { start, end: caret, at: locked[1] === "@", stage: "search", type: types[0], query: locked[3] };
  }
  // Anything else typed after `{` matches no type: the run offers nothing.
  return { start, end: caret, at: body.startsWith("@"), stage: "type", word: body, types: [] };
}

/** A reference tag in the text format of `shared/domain/dnd5e/richText.ts`. */
export const referenceTag = (type: ReferenceType, name: string, source?: string): string =>
  `{@${type} ${source ? `${name}|${source}` : name}}`;

export type TextEdit = { text: string; caret: number };

/**
 * Locks a type from the type stage: what the user typed for it stays and a space follows, so the
 * query starts after it. With no letters typed yet (`{`, `{@`) the type's word is written out.
 */
export function lockReferenceType(text: string, run: ReferenceRun, type: ReferenceType): TextEdit {
  const word = run.stage === "type" && run.word && type.startsWith(run.word.toLowerCase()) ? run.word : type;
  const typed = `{${run.at ? "@" : ""}${word} `;
  return { text: text.slice(0, run.start) + typed + text.slice(run.end), caret: run.start + typed.length };
}

/** Replaces the whole run, `{` to caret, with a finished tag; the caret goes after it. */
export function replaceReferenceRun(text: string, run: ReferenceRun, tag: string): TextEdit {
  return { text: text.slice(0, run.start) + tag + text.slice(run.end), caret: run.start + tag.length };
}
