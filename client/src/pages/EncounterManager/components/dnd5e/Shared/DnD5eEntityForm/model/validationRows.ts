import type {
  ConditionImmunity,
  DamageModifier,
  EntityAction,
  EntitySpellcasting,
  EntityTrait,
  SpellcastingLevel,
  SpellEntry,
  SpellFrequencyGroup,
} from "shared/domain/encounters/dnd5e/entity.js";
import {
  isSpellcastingDisplay,
  UNCOUNTED_SPELL_FREQUENCIES,
} from "shared/domain/encounters/dnd5e/entity.js";
import type { AbilityKey } from "../../dnd5eUtils.js";
import type {
  ActionEntryDraft,
  DamageModifierDraft,
  DnD5eEntityFormDraft,
  RecordEntryDraft,
  RecordOption,
  SpellGroupDraft,
  TextEntryDraft,
} from "../DnD5eEntityForm.types.js";
import { getRecordEntryValue } from "./calculations.js";
import type { ValidationState } from "./validationState.js";

export const rowsToRecord = (
  rows: RecordEntryDraft[],
  label: string,
  group: "saves" | "skills",
  options: readonly RecordOption[],
  abilityScores: Record<AbilityKey, number>,
  proficiencyBonus: number,
  state: ValidationState
): Record<string, string> => {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim().toLowerCase();
    const value = getRecordEntryValue(row, options, abilityScores, proficiencyBonus).trim();
    if (!key && !value) continue;
    if (!key || !value) {
      state.markRow(group, row.id, `${label} rows need both a name and a value.`, "proficiencies");
      continue;
    }
    record[key] = value;
  }
  return record;
};

export const rowsToDamageModifiers = (
  rows: DamageModifierDraft[],
  label: string,
  group: "vulnerabilities" | "resistances" | "immunities",
  state: ValidationState
): DamageModifier[] => {
  const modifiers: DamageModifier[] = [];
  for (const row of rows) {
    const damageType = row.damageType.trim().toLowerCase();
    const conditionNote = row.conditionNote.trim();
    if (!damageType && !conditionNote) continue;
    if (!damageType) {
      state.markRow(group, row.id, `${label} rows need a damage type.`, "defenses");
      continue;
    }
    modifiers.push({ damageType, conditionNote: conditionNote || undefined });
  }
  return modifiers;
};

export const rowsToConditionImmunities = (
  rows: DnD5eEntityFormDraft["conditionImmunities"],
  state: ValidationState
): ConditionImmunity[] => {
  const immunities: ConditionImmunity[] = [];
  for (const row of rows) {
    const conditionName = row.conditionName.trim().toLowerCase();
    const conditionNote = row.conditionNote.trim();
    if (!conditionName && !conditionNote) continue;
    if (!conditionName) {
      state.markRow(
        "conditionImmunities",
        row.id,
        "Condition immunity rows need a condition.",
        "defenses"
      );
      continue;
    }
    immunities.push({ conditionName, conditionNote: conditionNote || undefined });
  }
  return immunities;
};

export const rowsToTraits = (
  rows: TextEntryDraft[],
  group: "traits",
  label: string,
  state: ValidationState
): EntityTrait[] =>
  rows.reduce<EntityTrait[]>((entries, row, index) => {
    const name = row.name.trim();
    const description = row.description.trim();
    if (!name && !description) return entries;
    if (!name || !description) {
      state.markRow(group, row.id, `${label} need both a name and description.`, "entries");
      return entries;
    }
    entries.push({ name, description, sortOrder: index });
    return entries;
  }, []);

export const rowsToActions = (
  rows: ActionEntryDraft[],
  state: ValidationState
): EntityAction[] =>
  rows.reduce<EntityAction[]>((entries, row, index) => {
    const name = row.name.trim();
    const description = row.description.trim();
    if (!name && !description) return entries;
    if (!name || !description) {
      state.markRow("actions", row.id, "Action rows need both a name and description.", "entries");
      return entries;
    }
    entries.push({
      name,
      description,
      actionType: row.actionType.trim() || "action",
      sortOrder: index,
    });
    return entries;
  }, []);

export const rowsToSpellcasting = (
  rows: DnD5eEntityFormDraft["spellcasting"],
  state: ValidationState
): EntitySpellcasting[] =>
  rows.reduce<EntitySpellcasting[]>((entries, row) => {
    const name = row.name.trim();
    const descriptions = normalizeMultiline(row.descriptionsText);
    const saveDc = readOptionalRowInteger(row.saveDc, "Spell save DC", row.id, state, {
      min: 0,
      fieldMessage: "Spell save DC must be a whole number of at least 0.",
    });
    const spellAttackBonus = readOptionalRowInteger(
      row.spellAttackBonus,
      "Spell attack bonus",
      row.id,
      state,
      { fieldMessage: "Spell attack bonus must be a whole number." }
    );
    const { levels, frequencyGroups } = readSpellGroups(row.spellGroups, row.id, state);
    const hasAnyValue =
      name ||
      row.displayAs.trim() ||
      row.ability.trim() ||
      row.saveDc.trim() ||
      row.spellAttackBonus.trim() ||
      descriptions.length > 0 ||
      levels.length > 0 ||
      frequencyGroups.length > 0;

    if (!hasAnyValue) return entries;
    if (!name) {
      state.markRow("spellcasting", row.id, "Spellcasting rows need a name.", "spellcasting");
      return entries;
    }

    entries.push({
      name,
      displayAs: isSpellcastingDisplay(row.displayAs) ? row.displayAs : undefined,
      ability: optionalString(row.ability),
      saveDc,
      spellAttackBonus,
      descriptions,
      hideSpellList: row.showSpellList ? undefined : true,
      levels: levels.length > 0 ? levels : undefined,
      frequencyGroups: frequencyGroups.length > 0 ? frequencyGroups : undefined,
    });
    return entries;
  }, []);

const SPELL_NAME_MAX = 64;
const SPELL_NOTE_MAX = 512;

// Groups without spells are dropped; the stat block only stores lists that name spells.
const readSpellGroups = (
  groups: SpellGroupDraft[],
  rowId: string,
  state: ValidationState
): { levels: SpellcastingLevel[]; frequencyGroups: SpellFrequencyGroup[] } => {
  const levels: SpellcastingLevel[] = [];
  const frequencyGroups: SpellFrequencyGroup[] = [];

  for (const group of groups) {
    const spells = parseSpellLines(group, rowId, state);
    if (spells.length === 0) continue;

    if (group.kind === "level") {
      const level = readOptionalRowInteger(group.level, "Spell level", rowId, state, {
        min: 0,
        fieldMessage: "Spell level must be a whole number from 0 (cantrips) to 9.",
      });
      // A non-numeric level was already reported by readOptionalRowInteger.
      if (!group.level.trim() || (level !== undefined && level > 9)) {
        state.markRow("spellcasting", rowId, "Spell level must be a whole number from 0 (cantrips) to 9.", "spellcasting");
      }
      if (level === undefined || level > 9) continue;
      if (levels.some((existing) => existing.level === level)) {
        state.markRow("spellcasting", rowId, `Spell level ${level} is listed twice; merge its spells into one list.`, "spellcasting");
        continue;
      }
      const slots = readOptionalRowInteger(group.slots, "Spell slots", rowId, state, {
        min: 0,
        fieldMessage: "Spell slots must be a whole number of at least 0.",
      });
      levels.push({ level, slots, lowerLevel: group.lowerLevel, spells });
      continue;
    }

    const count = UNCOUNTED_SPELL_FREQUENCIES.includes(group.kind)
      ? undefined
      : readOptionalRowInteger(group.count, "Spell use count", rowId, state, {
          min: 1,
          fieldMessage: "Spell use counts must be a whole number of at least 1.",
        });
    frequencyGroups.push({
      frequency: group.kind,
      ...(count !== undefined ? { count } : {}),
      ...(count !== undefined && group.each ? { each: true } : {}),
      spells,
    });
  }

  levels.sort((left, right) => left.level - right.level);
  return { levels, frequencyGroups };
};

// "Fireball (level 5 version)" -> { name: "Fireball", note: "level 5 version" }; duplicates are dropped.
const parseSpellLines = (group: SpellGroupDraft, rowId: string, state: ValidationState): SpellEntry[] => {
  const spells: SpellEntry[] = [];
  const seen = new Set<string>();

  for (const line of normalizeMultiline(group.spellsText)) {
    const match = line.match(/^([^(]+?)\s*(?:\((.*)\))?$/);
    const name = (match?.[1] ?? line).trim();
    const note = match?.[2]?.trim() || undefined;
    if (name.length > SPELL_NAME_MAX || (note?.length ?? 0) > SPELL_NOTE_MAX) {
      state.markRow(
        "spellcasting",
        rowId,
        `Spell names can be up to ${SPELL_NAME_MAX} characters and notes up to ${SPELL_NOTE_MAX}.`,
        "spellcasting"
      );
      continue;
    }

    const key = `${name.toLowerCase()}|${note?.toLowerCase() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const source = group.sources[name.toLowerCase()];
    spells.push({ name, ...(source ? { source } : {}), ...(note ? { note } : {}) });
  }

  return spells;
};

export const optionalString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export const normalizeMultiline = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const readOptionalRowInteger = (
  value: string,
  label: string,
  id: string,
  state: ValidationState,
  options: { min?: number; fieldMessage?: string }
): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || (options.min != null && parsed < options.min)) {
    const message = `${label} must be a whole number${
      options.min != null ? ` of at least ${options.min}` : ""
    }.`;
    state.markRow(
      "spellcasting",
      id,
      options.fieldMessage ?? message,
      "spellcasting",
      message
    );
    return options.min ?? 0;
  }
  return parsed;
};
