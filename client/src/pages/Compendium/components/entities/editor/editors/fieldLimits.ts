import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";

/** Whole numbers the write contract accepts for AC, HP, speeds and ability scores. */
export const MAX_WHOLE = ENTITY_LIMITS.int[1];
/** Ability scores: the contract allows any whole number, the editor caps them as a game rule. */
export const MAX_ABILITY_SCORE = 40;
/** Passive Perception is stored in a smallint. */
export const MAX_PASSIVE_PERCEPTION = ENTITY_LIMITS.smallInt[1];
/** Legendary actions per round is stored in a tinyint. */
export const MAX_LEGENDARY_COUNT = ENTITY_LIMITS.tinyInt[1];

// Under the u flag a surrogate pair is one code point, so this matches only unpaired surrogates.
const unpairedSurrogate = /\p{Cs}/u;

/**
 * The write contract's text rule for one value: trimmed, at most `max` Unicode code points (not
 * UTF-16 units), valid Unicode, and non-empty when `required`. Returns the message, or undefined.
 */
export const textProblem = (raw: string, max?: number, required = false): string | undefined => {
  if (unpairedSurrogate.test(raw)) return "Use valid Unicode text.";
  const trimmed = raw.trim();
  if (required && !trimmed) return "This can't be empty.";
  if (max !== undefined && [...trimmed].length > max) return `At most ${max} characters.`;
  return undefined;
};

const encoder = new TextEncoder();

/** A description the write contract stores in a TEXT column: at most `maxBytes` UTF-8 bytes once trimmed. */
export const descriptionTooLong = (text: string, maxBytes: number): boolean => encoder.encode(text.trim()).length > maxBytes;
