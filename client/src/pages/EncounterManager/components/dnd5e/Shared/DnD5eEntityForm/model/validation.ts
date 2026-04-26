import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { ABILITY_KEYS, type AbilityKey } from "../../dnd5eUtils.js";
import type {
  AbilityScoresDraft,
  DnD5eEntityFormDraft,
  EntityFormParseResult,
  OpenSectionId,
} from "../DnD5eEntityForm.types.js";
import {
  calcPassivePerception,
  getProficiencyBonusForCr,
} from "./calculations.js";
import { SAVE_OPTIONS, SKILL_OPTIONS } from "./options.js";
import { createValidationState, type ValidationState } from "./validationState.js";
import {
  normalizeMultiline,
  rowsToActions,
  rowsToConditionImmunities,
  rowsToDamageModifiers,
  rowsToRecord,
  rowsToSpellcasting,
  rowsToTraits,
} from "./validationRows.js";

export const parseEntityDraft = (
  draft: DnD5eEntityFormDraft
): EntityFormParseResult => {
  const state = createValidationState();
  const name = draft.name.trim();
  const ac = readInteger(draft.ac, "Armor Class", state, {
    min: 1,
    field: "ac",
    fieldMessage: "AC must be a whole number of at least 1.",
  });
  const hp = readInteger(draft.hp, "Hit Points", state, {
    min: 1,
    field: "hp",
    fieldMessage: "HP must be a whole number of at least 1.",
  });
  const abilityScores = readAbilityScores(draft.abilityScores, state);
  const legendaryActionCount =
    readOptionalInteger(draft.legendaryActionCount, "Legendary action count", state, {
      min: 0,
      field: "legendaryActionCount",
      section: "legendary",
      fieldMessage: "Legendary action count must be a whole number of at least 0.",
    }) ?? 0;
  const speeds = readSpeeds(draft.speeds, state);
  const passivePerception =
    draft.passivePerceptionMode === "auto"
      ? calcPassivePerception(abilityScores.wis)
      : readOptionalInteger(draft.passivePerception, "Passive Perception", state, {
          min: 1,
          field: "passivePerception",
          section: "proficiencies",
          fieldMessage: "Passive Perception must be a whole number of at least 1.",
        });
  const proficiencyBonus = getProficiencyBonusForCr(draft.cr);

  if (!name) state.markField("name", "Name is required.");

  const saves = rowsToRecord(
    draft.saves,
    "Saving Throws",
    "saves",
    SAVE_OPTIONS,
    abilityScores,
    proficiencyBonus,
    state
  );
  const skills = rowsToRecord(
    draft.skills,
    "Skills",
    "skills",
    SKILL_OPTIONS,
    abilityScores,
    proficiencyBonus,
    state
  );
  const vulnerabilities = rowsToDamageModifiers(
    draft.vulnerabilities,
    "Vulnerabilities",
    "vulnerabilities",
    state
  );
  const resistances = rowsToDamageModifiers(
    draft.resistances,
    "Resistances",
    "resistances",
    state
  );
  const immunities = rowsToDamageModifiers(draft.immunities, "Immunities", "immunities", state);
  const conditionImmunities = rowsToConditionImmunities(draft.conditionImmunities, state);
  const traits = rowsToTraits(draft.traits, "traits", "Trait rows", state);
  const actions = rowsToActions(draft.actions, state);
  const spellcasting = rowsToSpellcasting(draft.spellcasting, state);

  const commonState = state.toResultState();
  if (state.hasErrors()) return { ok: false, ...commonState };

  return {
    ok: true,
    ...commonState,
    entity: {
      name,
      imageUrl: draft.imageUrl.trim(),
      role: draft.role,
      creatureType: draft.creatureType.trim(),
      typeTags: normalizeStringArray(draft.typeTags),
      cr: draft.cr.trim(),
      ac,
      hp,
      hpFormula: draft.hpFormula.trim(),
      speeds,
      size: draft.size,
      alignment: draft.alignment.trim() || "unaligned",
      abilityScores,
      saves,
      skills,
      passivePerception,
      senses: normalizeStringArray(draft.senses),
      languages: normalizeStringArray(draft.languages),
      vulnerabilities,
      resistances,
      immunities,
      conditionImmunities,
      traits,
      actions,
      spellcasting,
      legendaryActionCount,
      legendaryHeader: normalizeMultiline(draft.legendaryHeaderText),
    },
  };
};

export const normalizeStringArray = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
};

type IntegerOptions = {
  min?: number;
  field: string;
  section?: OpenSectionId;
  fieldMessage: string;
};

const readInteger = (
  value: string,
  label: string,
  state: ValidationState,
  options: IntegerOptions
): number => {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  const invalid =
    !trimmed ||
    !Number.isInteger(parsed) ||
    (options.min != null && parsed < options.min);

  if (invalid) {
    const message = `${label} must be a whole number${
      options.min != null ? ` of at least ${options.min}` : ""
    }.`;
    state.markField(options.field, options.fieldMessage, options.section, message);
    return options.min ?? 0;
  }

  return parsed;
};

const readOptionalInteger = (
  value: string,
  label: string,
  state: ValidationState,
  options: IntegerOptions
): number | undefined => {
  if (!value.trim()) return undefined;
  return readInteger(value, label, state, options);
};

const readAbilityScores = (
  draft: AbilityScoresDraft,
  state: ValidationState
): Record<AbilityKey, number> =>
  ABILITY_KEYS.reduce<Record<AbilityKey, number>>((scores, ability) => {
    scores[ability] = readInteger(draft[ability], ability.toUpperCase(), state, {
      min: 1,
      field: `abilityScores.${ability}`,
      fieldMessage: `${ability.toUpperCase()} must be a whole number of at least 1.`,
    });
    return scores;
  }, {} as Record<AbilityKey, number>);

const readSpeeds = (
  rows: DnD5eEntityFormDraft["speeds"],
  state: ValidationState
): DnD5eEntityDetails["speeds"] => {
  const speeds: DnD5eEntityDetails["speeds"] = {};
  const filledRows = rows.filter((row) => row.type.trim() || row.value.trim());

  for (const row of filledRows) {
    const type = row.type.trim().toLowerCase();
    if (!type) {
      state.markField(`speeds.${row.id}`, "Each speed needs a movement type.");
      continue;
    }
    speeds[type] = readInteger(row.value, `${type} speed`, state, {
      min: 0,
      field: `speeds.${row.id}`,
      fieldMessage: `${type} speed must be a whole number of at least 0.`,
    });
  }

  if (Object.keys(speeds).length === 0) speeds.walk = 30;
  return speeds;
};
