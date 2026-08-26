import { formatSignedNumber } from "src/pages/EncounterManager/components/dnd5e/Shared/dnd5eUtils.js";
import type { EntitySpellcasting } from "shared/domain/encounters/dnd5e/entity.js";
import {
  calcPassivePerception,
  getProficiencyBonusForCr,
  getRecordDefaultValue,
  getSpellAttackBonus,
  getSpellSaveDc,
  type RecordEntryMode,
} from "./calculations.js";
import type { EntityDraft } from "./defaults.js";
import { SAVE_OPTIONS, SKILL_OPTIONS } from "./options.js";

export type ProficiencyField = "saves" | "skills";
export type ProficiencyModes = Partial<Record<string, RecordEntryMode>>;
export type PassivePerceptionMode = "auto" | "manual";

/** Whether a spellcasting block's save DC and spell attack follow its ability and PB, or are typed. */
export interface SpellcastingModes {
  saveDc: PassivePerceptionMode;
  spellAttackBonus: PassivePerceptionMode;
}

export interface EntityDraftModes {
  saves: ProficiencyModes;
  skills: ProficiencyModes;
  passivePerception: PassivePerceptionMode;
  /** One per block of `draft.spellcasting`, in the same order. */
  spellcasting: SpellcastingModes[];
}

const RECORD_OPTIONS = { saves: SAVE_OPTIONS, skills: SKILL_OPTIONS };

const parseModifier = (value?: string): number | undefined => {
  const text = value?.trim();
  if (!text || !/^[+-]?\d+$/.test(text)) return undefined;
  const modifier = Number(text);
  return Number.isSafeInteger(modifier) ? modifier : undefined;
};

export const getAutoPassivePerception = (draft: EntityDraft): number => {
  const perception = Object.entries(draft.skills ?? {}).find(([key]) => key.trim().toLowerCase() === "perception");
  const bonus = parseModifier(perception?.[1]);
  return bonus === undefined ? calcPassivePerception(draft.abilityScores.wis) : 10 + bonus;
};

export const inferProficiencyModes = (draft: EntityDraft, field: ProficiencyField): ProficiencyModes => {
  const options = RECORD_OPTIONS[field];
  const pb = getProficiencyBonusForCr(draft.cr);
  return Object.fromEntries(Object.entries(draft[field] ?? {}).map(([key, text]): [string, RecordEntryMode] => {
    const value = parseModifier(text);
    if (value !== undefined) {
      if (value === getRecordDefaultValue(key, options, draft.abilityScores, pb)) return [key, "proficient"];
      if (value === getRecordDefaultValue(key, options, draft.abilityScores, pb, "expertise")) return [key, "expertise"];
    }
    return [key, "custom"];
  }));
};

/** A new block follows its ability. */
export const AUTO_SPELLCASTING: SpellcastingModes = { saveDc: "auto", spellAttackBonus: "auto" };

/** The save DC and spell attack a block's ability gives, with the draft's scores and CR. */
export const getAutoSpellcastingValues = (
  draft: EntityDraft,
  block: Pick<EntitySpellcasting, "ability">,
): { saveDc?: number; spellAttackBonus?: number } => {
  const pb = getProficiencyBonusForCr(draft.cr);
  return {
    saveDc: getSpellSaveDc(block.ability, draft.abilityScores, pb),
    spellAttackBonus: getSpellAttackBonus(block.ability, draft.abilityScores, pb),
  };
};

/** Automatic when the stored value is the one the ability gives. */
export const inferSpellcastingModes = (draft: EntityDraft): SpellcastingModes[] =>
  (draft.spellcasting ?? []).map(block => {
    const auto = getAutoSpellcastingValues(draft, block);
    return {
      saveDc: block.saveDc !== undefined && block.saveDc === auto.saveDc ? "auto" : "manual",
      spellAttackBonus: block.spellAttackBonus !== undefined && block.spellAttackBonus === auto.spellAttackBonus ? "auto" : "manual",
    };
  });

/**
 * The blocks after a change of ability scores or CR: automatic values follow it, typed ones stay.
 * A block whose values did not change keeps its object.
 */
export const refreshSpellcastingValues = (
  draft: EntityDraft,
  modes: readonly SpellcastingModes[],
): EntityDraft["spellcasting"] => {
  const blocks = draft.spellcasting;
  if (!blocks) return blocks;
  return blocks.map((block, index) => {
    const mode = modes[index];
    if (!mode) return block;
    const auto = getAutoSpellcastingValues(draft, block);
    const next = { ...block };
    if (mode.saveDc === "auto") next.saveDc = auto.saveDc;
    if (mode.spellAttackBonus === "auto") next.spellAttackBonus = auto.spellAttackBonus;
    if (next.saveDc === undefined) delete next.saveDc;
    if (next.spellAttackBonus === undefined) delete next.spellAttackBonus;
    return next.saveDc === block.saveDc && next.spellAttackBonus === block.spellAttackBonus ? block : next;
  });
};

export const inferEntityModes = (draft: EntityDraft): EntityDraftModes => ({
  saves: inferProficiencyModes(draft, "saves"),
  skills: inferProficiencyModes(draft, "skills"),
  passivePerception: draft.passivePerception == null || draft.passivePerception === getAutoPassivePerception(draft)
    ? "auto"
    : "manual",
  spellcasting: inferSpellcastingModes(draft),
});

export const refreshProficiencyValues = (
  previous: EntityDraft,
  draft: EntityDraft,
  field: ProficiencyField,
  modes: ProficiencyModes,
): EntityDraft[ProficiencyField] => {
  const record = draft[field];
  if (!record) return record;

  const options = RECORD_OPTIONS[field];
  const previousPb = getProficiencyBonusForCr(previous.cr);
  const pb = getProficiencyBonusForCr(draft.cr);
  return Object.fromEntries(Object.entries(record).map(([key, value]) => {
    const mode = modes[key];
    if (mode !== "proficient" && mode !== "expertise") return [key, value];
    const next = getRecordDefaultValue(key, options, draft.abilityScores, pb, mode);
    const before = getRecordDefaultValue(key, options, previous.abilityScores, previousPb, mode);
    return [key, next === undefined || next === before ? value : formatSignedNumber(next)];
  }));
};
