import type {
  ConditionImmunity,
  DamageModifier,
  DnD5eEntityDetails,
  EntityAction,
  EntitySpellcasting,
  EntityTrait,
} from "shared/domain/encounters/dnd5e/entity.js";
import { ABILITY_KEYS } from "../../dnd5eUtils.js";
import type {
  ActionEntryDraft,
  AbilityScoresDraft,
  ConditionImmunityDraft,
  DamageModifierDraft,
  DnD5eEntityFormDraft,
  RecordEntryDraft,
  SpeedDraft,
  SpellcastingDraft,
  TextEntryDraft,
} from "../DnD5eEntityForm.types.js";
import { DEFAULT_ABILITY_SCORES } from "./calculations.js";

export const createRowId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createBlankSpeed = (type = ""): SpeedDraft => ({
  id: createRowId("speed"),
  type,
  value: type === "walk" ? "30" : "",
});

export const createBlankRecordEntry = (prefix: string): RecordEntryDraft => ({
  id: createRowId(prefix),
  key: "",
  value: "",
  mode: "custom",
});

export const createBlankDamageModifier = (prefix: string): DamageModifierDraft => ({
  id: createRowId(prefix),
  damageType: "",
  conditionNote: "",
});

export const createBlankConditionImmunity = (): ConditionImmunityDraft => ({
  id: createRowId("condition-immunity"),
  conditionName: "",
  conditionNote: "",
});

export const createBlankTrait = (): TextEntryDraft => ({
  id: createRowId("trait"),
  name: "",
  description: "",
});

export const createBlankAction = (actionType = "action"): ActionEntryDraft => ({
  id: createRowId("action"),
  name: "",
  description: "",
  actionType,
});

export const createBlankSpellcasting = (): SpellcastingDraft => ({
  id: createRowId("spellcasting"),
  name: "Spellcasting",
  displayAs: "spellcasting",
  ability: "",
  saveDc: "",
  spellAttackBonus: "",
  descriptionsText: "",
});

export const createEntityDraft = (
  entity?: DnD5eEntityDetails
): DnD5eEntityFormDraft => {
  const abilityScores = ABILITY_KEYS.reduce<AbilityScoresDraft>((draft, ability) => {
    draft[ability] = String(entity?.abilityScores?.[ability] ?? DEFAULT_ABILITY_SCORES[ability]);
    return draft;
  }, {} as AbilityScoresDraft);

  const speeds = Object.entries(entity?.speeds ?? { walk: 30 }).map(([type, value], index) => ({
    id: `speed-${index}-${type}`,
    type,
    value: String(value),
  }));

  return {
    name: entity?.name ?? "",
    imageUrl: entity?.imageUrl ?? "",
    role: entity?.role ?? "creature",
    creatureType: entity?.creatureType ?? "",
    typeTags: entity?.typeTags ?? [],
    cr: entity?.cr ?? "",
    ac: String(entity?.ac ?? 10),
    hp: String(entity?.hp ?? 1),
    hpFormula: entity?.hpFormula ?? "",
    speeds: speeds.length > 0 ? speeds : [createBlankSpeed("walk")],
    size: entity?.size ?? "medium",
    alignment: entity?.alignment ?? "unaligned",
    abilityScores,
    saves: recordToRows(entity?.saves, "save"),
    skills: recordToRows(entity?.skills, "skill"),
    passivePerceptionMode: entity?.passivePerception ? "manual" : "auto",
    passivePerception: entity?.passivePerception ? String(entity.passivePerception) : "",
    senses: entity?.senses ?? [],
    languages: entity?.languages ?? [],
    vulnerabilities: damageModifiersToRows(entity?.vulnerabilities, "vulnerability"),
    resistances: damageModifiersToRows(entity?.resistances, "resistance"),
    immunities: damageModifiersToRows(entity?.immunities, "immunity"),
    conditionImmunities: conditionImmunitiesToRows(entity?.conditionImmunities),
    traits: textEntriesToRows(entity?.traits, "trait"),
    actions: actionsToRows(entity?.actions),
    spellcasting: spellcastingToRows(entity?.spellcasting),
    legendaryActionCount: String(entity?.legendaryActionCount ?? 0),
    legendaryHeaderText: entity?.legendaryHeader?.join("\n") ?? "",
  };
};

const recordToRows = (
  record: Record<string, string> | undefined,
  prefix: string
): RecordEntryDraft[] =>
  Object.entries(record ?? {}).map(([key, value], index) => ({
    id: `${prefix}-${index}-${key}`,
    key,
    value,
    mode: "custom",
  }));

const damageModifiersToRows = (
  modifiers: DamageModifier[] | undefined,
  prefix: string
): DamageModifierDraft[] =>
  (modifiers ?? []).map((modifier, index) => ({
    id: `${prefix}-${index}-${modifier.damageType}`,
    damageType: modifier.damageType,
    conditionNote: modifier.conditionNote ?? "",
  }));

const conditionImmunitiesToRows = (
  immunities: ConditionImmunity[] | undefined
): ConditionImmunityDraft[] =>
  (immunities ?? []).map((immunity, index) => ({
    id: `condition-immunity-${index}-${immunity.conditionName}`,
    conditionName: immunity.conditionName,
    conditionNote: immunity.conditionNote ?? "",
  }));

const textEntriesToRows = (
  entries: EntityTrait[] | undefined,
  prefix: string
): TextEntryDraft[] =>
  (entries ?? []).map((entry, index) => ({
    id: `${prefix}-${index}-${entry.name}`,
    name: entry.name,
    description: entry.description,
  }));

const actionsToRows = (actions: EntityAction[] | undefined): ActionEntryDraft[] =>
  (actions ?? []).map((action, index) => ({
    id: `action-${index}-${action.actionType}-${action.name}`,
    name: action.name,
    description: action.description,
    actionType: action.actionType,
  }));

const spellcastingToRows = (
  spellcasting: EntitySpellcasting[] | undefined
): SpellcastingDraft[] =>
  (spellcasting ?? []).map((entry, index) => ({
    id: `spellcasting-${index}-${entry.name}`,
    name: entry.name,
    displayAs: entry.displayAs ?? "spellcasting",
    ability: entry.ability ?? "",
    saveDc: entry.saveDc != null ? String(entry.saveDc) : "",
    spellAttackBonus:
      entry.spellAttackBonus != null ? String(entry.spellAttackBonus) : "",
    descriptionsText: entry.descriptions?.join("\n") ?? "",
    levels: entry.levels,
    freqSpells: entry.freqSpells,
  }));
