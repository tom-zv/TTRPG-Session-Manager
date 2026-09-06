import type { InlineParse } from "./InlineField.js";
import type { SheetEditApi } from "./SheetEditContext.js";

/** What a field's text means for the draft: a patch (and modes) to commit, or why it cannot apply. */
export type FieldParse<Draft, Modes = unknown> =
  | { ok: true; patch: Partial<Draft>; modes?: Partial<Modes> }
  | { ok: false; message: string };

export type FieldOption = { value: string; label: string };

/**
 * One editable value, defined once and drawn by both presentations: a live input on the sheet, or
 * a control inside the target's editor. Parsing and limits live here, not in either presentation.
 */
export type FieldSpec<Draft, Modes = unknown> = {
  /** The issue target id, matching a validator path where one exists. */
  id: string;
  /** The accessible name, without the verb. */
  label: string;
  /** The text the sheet shows and the input starts from. */
  read: (draft: Draft, modes: Modes) => string;
  parse: (text: string, draft: Draft, modes: Modes) => FieldParse<Draft, Modes>;
  /** Shown, dimmed, while the value is empty. */
  placeholder?: string;
  /** A choice: the text is one of these values. */
  options?: readonly FieldOption[];
  /** Free text with suggestions: the value is what is typed, the label what the list shows. */
  suggestions?: readonly FieldOption[];
  inputMode?: "numeric" | "text";
};

/**
 * A list of short texts (languages, senses, tags), each its own token. Clearing a token removes
 * it, and a token that is already listed (ignoring case) is rejected.
 */
export type TokenListSpec<Draft, Modes = unknown> = {
  /** The add field's id; token `i` is `<id>.<i>`. */
  id: string;
  /** The line's label, e.g. "Languages". */
  label: string;
  /** One token, e.g. "language": "+ language", "Add a language", "Language 2". */
  noun: string;
  read: (draft: Draft) => string[];
  /** Why one token cannot be stored, or undefined. */
  check: (token: string, draft: Draft, index?: number) => string | undefined;
  /** What makes two tokens the same, lowercased by default. */
  key?: (token: string, draft: Draft, index?: number) => string;
  /** The stored spelling of a valid token. */
  normalize?: (token: string, draft: Draft, index?: number) => string;
  /**
   * The line's new tokens. `origins[i]` is the stored index token `i` came from (undefined for an
   * added one); without `origins`, each token is read at its own index.
   */
  write: (tokens: string[], draft: Draft, modes: Modes, origins?: ReadonlyArray<number | undefined>) => FieldParse<Draft, Modes>;
  suggestions?: readonly FieldOption[];
};

export const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

/** A spec's parse as an `InlineField` parse: applying it commits the patch. */
export const specParse = <Draft, Modes>(spec: FieldSpec<Draft, Modes>, edit: SheetEditApi<Draft, Modes>) =>
  (text: string): InlineParse => {
    const result = spec.parse(text, edit.draft, edit.modes);
    return result.ok ? { ok: true, apply: () => edit.commit(result.patch, result.modes) } : result;
  };

/** Commits a parse, returning the message when it or the commit fails. */
export const commitParse = <Draft, Modes>(edit: SheetEditApi<Draft, Modes>, result: FieldParse<Draft, Modes>): string | undefined =>
  result.ok ? edit.commit(result.patch, result.modes) : result.message;

/**
 * Several fields of one editor, committed together. Each changed text is parsed against the draft
 * with the earlier patches applied; an unchanged one is left as stored. A failure names its field.
 */
export const parseSpecs = <Draft, Modes>(
  entries: ReadonlyArray<readonly [FieldSpec<Draft, Modes>, string]>,
  draft: Draft,
  modes: Modes,
): FieldParse<Draft, Modes> => {
  let nextDraft = draft;
  let nextModes = modes;
  let patch: Partial<Draft> = {};
  let modePatch: Partial<Modes> | undefined;
  for (const [spec, text] of entries) {
    if (text === spec.read(draft, modes)) continue;
    const result = spec.parse(text, nextDraft, nextModes);
    if (!result.ok) return fail(`${spec.label}: ${result.message}`);
    patch = { ...patch, ...result.patch };
    nextDraft = { ...nextDraft, ...result.patch };
    if (result.modes) {
      modePatch = { ...modePatch, ...result.modes };
      nextModes = { ...nextModes, ...result.modes };
    }
  }
  return { ok: true, patch, ...(modePatch ? { modes: modePatch } : {}) };
};

const tokenKey = <Draft, Modes>(spec: TokenListSpec<Draft, Modes>, token: string, draft: Draft, index?: number) =>
  spec.key ? spec.key(token, draft, index) : token.toLowerCase();

/**
 * A stable key per token: its identity (lowercased by default), numbered when stored data repeats
 * one ("common#0", "common#1"). A token's field and its unapplied text follow this key.
 */
export const tokenKeys = <Draft, Modes>(spec: TokenListSpec<Draft, Modes>, tokens: readonly string[], draft: Draft): string[] => {
  const seen = new Map<string, number>();
  return tokens.map((token, index) => {
    const key = tokenKey(spec, token, draft, index);
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    return `${key}#${occurrence}`;
  });
};

/** Why `token` cannot join `others`: the spec's own rule, or it is already listed. */
export const tokenProblem = <Draft, Modes>(
  spec: TokenListSpec<Draft, Modes>,
  token: string,
  others: ReadonlyArray<{ token: string; index: number }>,
  draft: Draft,
  index?: number,
): string | undefined => {
  const problem = spec.check(token, draft, index);
  if (problem) return problem;
  const key = tokenKey(spec, token, draft, index);
  return others.some(other => tokenKey(spec, other.token, draft, other.index) === key) ? `${token} is already listed.` : undefined;
};

/** Changes token `index` to `text` (removing it when blank), or adds `text` when `index` is null. */
export const editToken = <Draft, Modes>(
  spec: TokenListSpec<Draft, Modes>,
  draft: Draft,
  modes: Modes,
  index: number | null,
  text: string,
): FieldParse<Draft, Modes> => {
  const items = spec.read(draft);
  const token = text.trim();
  if (!token) {
    if (index === null) return { ok: true, patch: {} };
    // The survivors move up a place; each keeps the stored index it came from.
    const kept = items.flatMap((item, other) => (other === index ? [] : [{ item, other }]));
    return spec.write(kept.map(({ item }) => item), draft, modes, kept.map(({ other }) => other));
  }
  const problem = tokenProblem(
    spec,
    token,
    items.flatMap((other, otherIndex) => otherIndex === index ? [] : [{ token: other, index: otherIndex }]),
    draft,
    index ?? undefined,
  );
  if (problem) return fail(problem);
  const value = spec.normalize ? spec.normalize(token, draft, index ?? undefined) : token;
  return index === null
    ? spec.write([...items, value], draft, modes, [...items.keys(), undefined])
    : spec.write(items.map((item, other) => (other === index ? value : item)), draft, modes, [...items.keys()]);
};

const shorten = (token: string) => (token.length > 24 ? `${[...token].slice(0, 24).join("")}…` : token);

/** A whole list from an editor, checked token by token; a failure names the token. */
export const parseTokens = <Draft, Modes>(
  spec: TokenListSpec<Draft, Modes>,
  tokens: readonly string[],
  draft: Draft,
  modes: Modes,
): FieldParse<Draft, Modes> => {
  const accepted: string[] = [];
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    const problem = spec.check(token, draft);
    if (problem) return fail(`${shorten(token)}: ${problem}`);
    const duplicate = tokenProblem(
      spec,
      token,
      accepted.map((other, index) => ({ token: other, index })),
      draft,
    );
    if (duplicate) return fail(duplicate);
    accepted.push(spec.normalize ? spec.normalize(token, draft) : token);
  }
  return spec.write(accepted, draft, modes);
};
