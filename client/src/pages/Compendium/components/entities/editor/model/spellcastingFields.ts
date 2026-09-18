import {
  UNCOUNTED_SPELL_FREQUENCIES,
  type EntitySpellcasting,
  type SpellEntry,
  type SpellFrequency,
  type SpellFrequencyGroup,
  type SpellcastingLevel,
} from "shared/domain/encounters/dnd5e/entity.js";
import { ENTITY_LIMITS } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { ABILITY_FULL_NAMES, ABILITY_KEYS, formatSignedNumber, titleCase, type AbilityKey } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import { fail, type FieldParse } from "../../../sheetEditor/fieldSpec.js";
import { parseWhole } from "../../../sheetEditor/InlineField.js";
import { descriptionTooLong, MAX_WHOLE, textProblem } from "../editors/fieldLimits.js";
import type { EntityDraft } from "./defaults.js";
import { carryEntryKey, entryKey } from "./entryKeys.js";
import type { EntryField } from "./fields.js";
import { getAutoSpellcastingValues, type EntityDraftModes, type SpellcastingModes } from "./inference.js";

/**
 * A spellcasting block's values, edited where the sheet shows them. Like a trait's fields, each is
 * addressed by the block's key (`entryKeys.ts`), so a move never hands a field, or text typed into
 * it, to another block; ids follow the validator's paths (`spellcasting.0.saveDc`).
 */

type EntityParse = FieldParse<EntityDraft, EntityDraftModes>;

/** The suggestion a Save DC or Spell Attack field offers: the value worked out from the ability. */
export const AUTO_TEXT = "auto";

const [MIN_TINY, MAX_TINY] = ENTITY_LIMITS.tinyInt;

/** Where the block with this key is now, with its modes. */
export const findBlock = (draft: EntityDraft, modes: EntityDraftModes, key: number) => {
  const blocks = draft.spellcasting ?? [];
  const index = blocks.findIndex(block => entryKey(block) === key);
  return index < 0 ? null : { index, block: blocks[index], modes: modes.spellcasting[index] ?? { saveDc: "manual", spellAttackBonus: "manual" } };
};

type BlockChange = { block: EntitySpellcasting; modes?: SpellcastingModes } | { ok: false; message: string };

/**
 * A content edit of one block: its row replaced where it is stored, every other block in place.
 * The blocks' modes travel with the patch, so the commit does not infer them from the values.
 */
const writeBlock = (
  draft: EntityDraft,
  modes: EntityDraftModes,
  key: number,
  change: (block: EntitySpellcasting, modes: SpellcastingModes) => BlockChange,
): EntityParse => {
  const found = findBlock(draft, modes, key);
  if (!found) return fail("This spellcasting block was removed.");
  const result = change(found.block, found.modes);
  if ("ok" in result) return result;
  const blocks = [...(draft.spellcasting ?? [])];
  blocks[found.index] = carryEntryKey(found.block, result.block);
  const blockModes = (draft.spellcasting ?? []).map((_, index) => modes.spellcasting[index] ?? { saveDc: "manual", spellAttackBonus: "manual" });
  blockModes[found.index] = result.modes ?? found.modes;
  return { ok: true, patch: { spellcasting: blocks }, modes: { spellcasting: blockModes } };
};

/** The block with its automatic values worked out again from its ability (typed ones stay). */
const withAutoValues = (draft: EntityDraft, block: EntitySpellcasting, modes: SpellcastingModes): EntitySpellcasting => {
  const auto = getAutoSpellcastingValues(draft, block);
  const next = { ...block };
  if (modes.saveDc === "auto") next.saveDc = auto.saveDc;
  if (modes.spellAttackBonus === "auto") next.spellAttackBonus = auto.spellAttackBonus;
  if (next.saveDc === undefined) delete next.saveDc;
  if (next.spellAttackBonus === undefined) delete next.spellAttackBonus;
  return next;
};

// Paragraphs are separated by a blank line.
const splitParagraphs = (value: string): string[] => value.split(/\r?\n\s*\r?\n/).map(part => part.trim()).filter(Boolean);

/** The block's own fields: its name, each paragraph of its text, its ability, save DC and attack. */
export const spellcastingFields = ({ key, id, place }: { key: number; id: string; place: string }) => {
  const read = (draft: EntityDraft, modes: EntityDraftModes) => findBlock(draft, modes, key);
  const name: EntryField = {
    id: `${id}.name`,
    label: `Name of ${place}`,
    read: draft => draft.spellcasting?.find(block => entryKey(block) === key)?.name,
    parse: (text, draft, modes) => {
      const problem = textProblem(text, ENTITY_LIMITS.entryName, true);
      if (problem) return fail(`Name: ${problem}`);
      return writeBlock(draft, modes, key, block => ({ block: { ...block, name: text.trim() } }));
    },
  };

  /**
   * Paragraph `index` of the text. A blank line typed into it splits it into paragraphs; clearing
   * it removes the paragraph. Paragraph 0 is always drawn, so a block without text can get some.
   */
  const description = (index: number): EntryField => ({
    id: `${id}.descriptions.${index}`,
    label: index === 0 ? `Text of ${place}` : `Paragraph ${index + 1} of ${place}`,
    read: draft => {
      const block = draft.spellcasting?.find(candidate => entryKey(candidate) === key);
      return block ? block.descriptions[index] ?? (index === 0 ? "" : undefined) : undefined;
    },
    parse: (text, draft, modes) => {
      const paragraphs = splitParagraphs(text);
      for (const paragraph of paragraphs) {
        const problem = textProblem(paragraph);
        if (problem) return fail(`Text: ${problem}`);
        if (descriptionTooLong(paragraph, ENTITY_LIMITS.descriptionBytes)) return fail("Text: a paragraph is too long to save.");
      }
      return writeBlock(draft, modes, key, block => {
        const descriptions = [...block.descriptions];
        descriptions.splice(index, 1, ...paragraphs);
        return { block: { ...block, descriptions } };
      });
    },
  });

  /**
   * The ability, shown and typed by its name ("Intelligence"); its list offers the six abilities.
   * A key or a name's first three letters also match ("int"); blank removes it. Automatic values
   * follow the new ability.
   */
  const ability = {
    id: `${id}.ability`,
    label: `Spellcasting ability of ${place}`,
    /** The stored key ("int"), for the targets presentation's menu. */
    key: (draft: EntityDraft, modes: EntityDraftModes) => read(draft, modes)?.block.ability ?? "",
    read: (draft: EntityDraft, modes: EntityDraftModes) => {
      const stored = read(draft, modes)?.block.ability;
      return stored ? ABILITY_FULL_NAMES[stored as AbilityKey] ?? titleCase(stored) : "";
    },
    suggestions: ABILITY_KEYS.map(ability => ({ value: ability, label: ABILITY_FULL_NAMES[ability] })),
    parse: (text: string, draft: EntityDraft, modes: EntityDraftModes): EntityParse => {
      const typed = text.trim().toLowerCase();
      const chosen = typed === "" ? undefined : ABILITY_KEYS.find(candidate => {
        const name = ABILITY_FULL_NAMES[candidate].toLowerCase();
        return candidate === typed || name === typed || (typed.length >= 3 && name.startsWith(typed));
      });
      if (typed !== "" && !chosen) return fail("Choose an ability: Strength, Dexterity, Constitution, Intelligence, Wisdom or Charisma.");
      return writeBlock(draft, modes, key, (block, blockModes) => {
        const next = { ...block, ability: chosen };
        if (!next.ability) delete next.ability;
        return { block: withAutoValues(draft, next, blockModes) };
      });
    },
  };

  /**
   * Save DC or Spell Attack: "auto" follows the ability and proficiency bonus, a typed number is
   * kept as typed, and blank leaves the block without one.
   */
  const number = (field: "saveDc" | "spellAttackBonus") => {
    const signed = field === "spellAttackBonus";
    const [min, max] = signed ? [MIN_TINY, MAX_TINY] : [0, MAX_TINY];
    return {
      id: `${id}.${field}`,
      label: `${signed ? "Spell attack" : "Save DC"} of ${place}`,
      read: (draft: EntityDraft, modes: EntityDraftModes) => {
        const value = read(draft, modes)?.block[field];
        return value === undefined ? "" : signed ? formatSignedNumber(value) : String(value);
      },
      auto: (draft: EntityDraft, modes: EntityDraftModes) => read(draft, modes)?.modes[field] === "auto",
      parse: (text: string, draft: EntityDraft, modes: EntityDraftModes): EntityParse => {
        const typed = text.trim();
        const range = signed ? `${min} to +${max}` : `${min} to ${max}`;
        let value: number | undefined;
        if (typed !== "" && typed.toLowerCase() !== AUTO_TEXT) {
          value = signed ? Number(typed.replace(/^\+/, "")) : parseWhole(typed, min, max);
          if (value === undefined || !Number.isInteger(value) || value < min || value > max) {
            return fail(`A whole number from ${range}, or Automatic.`);
          }
        }
        return writeBlock(draft, modes, key, (block, blockModes) => {
          if (typed.toLowerCase() === AUTO_TEXT) {
            const nextModes = { ...blockModes, [field]: "auto" as const };
            return { block: withAutoValues(draft, block, nextModes), modes: nextModes };
          }
          const next = { ...block, [field]: value };
          if (value === undefined) delete next[field];
          return { block: next, modes: { ...blockModes, [field]: "manual" } };
        });
      },
    };
  };

  return { name, description, ability, saveDc: number("saveDc"), spellAttackBonus: number("spellAttackBonus") };
};

// Spell lists -------------------------------------------------------------------------------------

/** Slot levels and usage groups are stored in two lists; a line is addressed by its list and index. */
export type ListKind = "levels" | "frequencyGroups";
export type ListAt = { list: ListKind; index: number };
export type GroupKind = "level" | SpellFrequency;

/** A spell list's label as its editor holds it: numbers as typed. */
export type ListForm = { kind: GroupKind; level: string; slots: string; lowerLevel: string; count: string; each: boolean };

export const isCounted = (kind: GroupKind): boolean => kind !== "level" && !UNCOUNTED_SPELL_FREQUENCIES.includes(kind);
export const takesEach = (kind: GroupKind): boolean => isCounted(kind) && kind !== "recharge" && kind !== "legendary";

const text = (value: number | undefined): string => (value === undefined ? "" : String(value));

export const readList = (block: EntitySpellcasting, at: ListAt): SpellcastingLevel | SpellFrequencyGroup | undefined =>
  at.list === "levels" ? block.levels?.[at.index] : block.frequencyGroups?.[at.index];

export const listForm = (block: EntitySpellcasting, at: ListAt): ListForm => {
  if (at.list === "levels") {
    const level = block.levels?.[at.index];
    return { kind: "level", level: text(level?.level), slots: text(level?.slots), lowerLevel: text(level?.lowerLevel), count: "", each: false };
  }
  const group = block.frequencyGroups?.[at.index];
  return { kind: group?.frequency ?? "will", level: "", slots: "", lowerLevel: "", count: text(group?.count), each: group?.each ?? false };
};

/** The lists with one replaced, removed (`next` null) or added (`at` null). */
const writeLists = (block: EntitySpellcasting, at: ListAt | null, next: SpellcastingLevel | SpellFrequencyGroup | null, nextKind?: ListKind) => {
  const levels = [...(block.levels ?? [])];
  const frequencyGroups = [...(block.frequencyGroups ?? [])];
  const lists = { levels, frequencyGroups };
  const target = nextKind ?? at?.list;
  if (at && (next === null || target !== at.list)) lists[at.list].splice(at.index, 1);
  if (next && target) {
    if (at && target === at.list) (lists[target] as unknown[])[at.index] = next;
    else (lists[target] as unknown[]).push(next);
  }
  // An empty kind of list that was absent stays absent.
  const result: EntitySpellcasting = { ...block, levels: levels.length > 0 || block.levels ? levels : undefined, frequencyGroups: frequencyGroups.length > 0 || block.frequencyGroups ? frequencyGroups : undefined };
  if (!result.levels) delete result.levels;
  if (!result.frequencyGroups) delete result.frequencyGroups;
  return result;
};

/**
 * A spell list's label from its editor: a slot level (0 to 9, once per block) with its slots and
 * pact magic range, or a frequency with its count. A change between the two moves the list, with
 * its spells, to the other kind's end.
 */
export const writeList = (draft: EntityDraft, modes: EntityDraftModes, key: number, at: ListAt, form: ListForm): EntityParse =>
  writeBlock(draft, modes, key, block => {
    const spells = readList(block, at)?.spells ?? [];
    if (form.kind === "level") {
      const level = parseWhole(form.level, 0, 9);
      if (level === undefined) return fail("The level is a whole number from 0 (cantrips) to 9.");
      const taken = (block.levels ?? []).some((other, index) => other.level === level && !(at.list === "levels" && at.index === index));
      if (taken) return fail(`Another list already has level ${level}.`);
      const slots = form.slots.trim() === "" ? undefined : parseWhole(form.slots, 0, MAX_WHOLE);
      if (form.slots.trim() !== "" && slots === undefined) return fail("Slots are a whole number from 0.");
      const lowerLevel = form.lowerLevel.trim() === "" ? undefined : parseWhole(form.lowerLevel, 0, level);
      if (form.lowerLevel.trim() !== "" && lowerLevel === undefined) return fail(`The pact magic lowest level is a whole number from 0 to ${level}.`);
      const next: SpellcastingLevel = { level, ...(slots !== undefined ? { slots } : {}), ...(lowerLevel !== undefined ? { lowerLevel } : {}), spells };
      return { block: writeLists(block, at, next, "levels") };
    }
    const counted = isCounted(form.kind);
    const count = !counted || form.count.trim() === "" ? undefined : parseWhole(form.count, 1, Number.MAX_SAFE_INTEGER);
    if (counted && form.count.trim() !== "" && count === undefined) return fail("The count is a whole number from 1.");
    const next: SpellFrequencyGroup = {
      frequency: form.kind,
      ...(count !== undefined ? { count } : {}),
      ...(takesEach(form.kind) && form.each ? { each: true } : {}),
      spells,
    };
    return { block: writeLists(block, at, next, "frequencyGroups") };
  });

/**
 * A new, empty spell list and where it lands: the next free slot level when the block has slot
 * levels (or no lists), otherwise 1/day each.
 */
export const addList = (draft: EntityDraft, modes: EntityDraftModes, key: number): { parse: EntityParse; at: ListAt | null } => {
  const found = findBlock(draft, modes, key);
  if (!found) return { parse: fail("This spellcasting block was removed."), at: null };
  const { block } = found;
  const used = new Set((block.levels ?? []).map(level => level.level));
  const free = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].find(level => !used.has(level));
  const slotted = (block.levels?.length ?? 0) > 0 || (block.frequencyGroups?.length ?? 0) === 0;
  if (slotted && free !== undefined) {
    return { parse: writeBlock(draft, modes, key, () => ({ block: writeLists(block, null, { level: free, spells: [] }, "levels") })), at: { list: "levels", index: block.levels?.length ?? 0 } };
  }
  const group: SpellFrequencyGroup = { frequency: "daily", count: 1, each: true, spells: [] };
  return { parse: writeBlock(draft, modes, key, () => ({ block: writeLists(block, null, group, "frequencyGroups") })), at: { list: "frequencyGroups", index: block.frequencyGroups?.length ?? 0 } };
};

export const removeList = (draft: EntityDraft, modes: EntityDraftModes, key: number, at: ListAt): EntityParse =>
  writeBlock(draft, modes, key, block => ({ block: writeLists(block, at, null) }));

const writeSpells = (draft: EntityDraft, modes: EntityDraftModes, key: number, at: ListAt, change: (spells: SpellEntry[]) => SpellEntry[]): EntityParse =>
  writeBlock(draft, modes, key, block => {
    const list = readList(block, at);
    if (!list) return fail("This spell list was removed.");
    return { block: writeLists(block, at, { ...list, spells: change(list.spells) }) };
  });

/** A spell picked from the index (with its source) or typed (a name the index does not know). */
export const addSpell = (draft: EntityDraft, modes: EntityDraftModes, key: number, at: ListAt, spell: SpellEntry): EntityParse => {
  const nameProblem = textProblem(spell.name, ENTITY_LIMITS.entryName, true);
  if (nameProblem) return fail(`Spell name: ${nameProblem}`);
  const sourceProblem = spell.source === undefined ? undefined : textProblem(spell.source, ENTITY_LIMITS.spellSource);
  if (sourceProblem) return fail(`Spell source: ${sourceProblem}`);
  const entry: SpellEntry = { name: spell.name.trim(), ...(spell.source ? { source: spell.source.trim() } : {}) };
  return writeSpells(draft, modes, key, at, spells => [...spells, entry]);
};

/** Removes one spell; any note stored on another spell stays as it is. */
export const removeSpell = (draft: EntityDraft, modes: EntityDraftModes, key: number, at: ListAt, index: number): EntityParse =>
  writeSpells(draft, modes, key, at, spells => spells.filter((_, at) => at !== index));

/** Shows or hides the block's spell list in view mode (its text already names the spells). */
export const setListHidden = (draft: EntityDraft, modes: EntityDraftModes, key: number, hidden: boolean): EntityParse =>
  writeBlock(draft, modes, key, block => {
    const next = { ...block, hideSpellList: hidden ? true : undefined };
    if (!hidden) delete next.hideSpellList;
    return { block: next };
  });
