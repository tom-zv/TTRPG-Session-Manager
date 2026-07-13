import type {
  ConditionImmunity,
  DamageModifier,
  DnD5eEntityDetails,
  EntityAction,
  EntitySpellcasting,
  EntityTrait,
  SpellcastingLevel,
  SpellFrequency,
  SpellFrequencyGroup,
} from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  capitalize,
  formatSignedValue,
  titleCase,
} from "../dnd5eUtils.js";
import type { AbilityKey } from "../dnd5eUtils.js";
export {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  ABILITY_LABELS,
  calcMod,
  capitalize,
  formatSignedNumber,
  formatSignedValue,
  titleCase,
} from "../dnd5eUtils.js";
export type { AbilityKey } from "../dnd5eUtils.js";

export type EntityCardEntry =
  | {
      kind: "trait";
      key: string;
      name: string;
      description: string;
      sortOrder: number;
    }
  | {
      kind: "action";
      key: string;
      name: string;
      description: string;
      sortOrder: number;
    }
  | {
      kind: "spellcasting";
      key: string;
      spellcasting: EntitySpellcasting;
      sortOrder: number;
    };

export type EntityCardSection = {
  key: string;
  title: string;
  entries: EntityCardEntry[];
};

const SECTION_ORDER = [
  "trait",
  "spellcasting",
  "action",
  "bonus action",
  "reaction",
  "legendary",
  "mythic",
  "lair",
  "regional",
  "villain",
];

const SECTION_TITLES: Record<string, string> = {
  trait: "Traits",
  spellcasting: "Spellcasting",
  action: "Actions",
  "bonus action": "Bonus Actions",
  reaction: "Reactions",
  legendary: "Legendary Actions",
  mythic: "Mythic Actions",
  lair: "Lair Actions",
  regional: "Regional Effects",
  villain: "Villain Actions",
};

export const formatCreatureSummary = (entity: DnD5eEntityDetails): string => {
  const typeName = entity.creatureType || entity.role;
  const typeTags =
    entity.typeTags && entity.typeTags.length > 0
      ? ` (${entity.typeTags.join(", ")})`
      : "";
  const typeLine = [
    capitalize(entity.size),
    typeName ? `${titleCase(typeName)}${typeTags}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return [typeLine, entity.alignment].filter(Boolean).join(", ");
};

export const formatHp = (entity: DnD5eEntityDetails): string =>
  entity.hpFormula ? `${entity.hp} (${entity.hpFormula})` : String(entity.hp);

export const formatSpeeds = (speeds: DnD5eEntityDetails["speeds"] | undefined): string => {
  if (!speeds || Object.keys(speeds).length === 0) return "—";

  return Object.entries(speeds)
    .map(([type, value]) => {
      const prefix = type === "walk" ? "" : `${titleCase(type)} `;
      return `${prefix}${value} ft.`;
    })
    .join(", ");
};

export const formatDamageModifier = (modifier: DamageModifier): string =>
  modifier.conditionNote
    ? `${modifier.damageType} (${modifier.conditionNote})`
    : modifier.damageType;

export const formatConditionImmunity = (immunity: ConditionImmunity): string =>
  immunity.conditionNote
    ? `${immunity.conditionName} (${immunity.conditionNote})`
    : immunity.conditionName;

export const formatRecordEntries = (record: Record<string, string> | undefined): string[] => {
  if (!record) return [];

  const abilityIndex = new Map(ABILITY_KEYS.map((ability, index) => [ability, index]));

  return Object.entries(record)
    .sort(([left], [right]) => {
      const leftAbilityIndex = abilityIndex.get(left as AbilityKey);
      const rightAbilityIndex = abilityIndex.get(right as AbilityKey);
      if (leftAbilityIndex !== undefined || rightAbilityIndex !== undefined) {
        return (leftAbilityIndex ?? Number.MAX_SAFE_INTEGER) - (rightAbilityIndex ?? Number.MAX_SAFE_INTEGER);
      }

      return left.localeCompare(right);
    })
    .map(([key, value]) => {
      const label = ABILITY_LABELS[key as AbilityKey] ?? titleCase(key);
      return `${label} ${formatSignedValue(value)}`;
    });
};

export const formatSpellLevel = (level: number): string => {
  if (level === 0) return "Cantrips";
  return `${level}${getOrdinalSuffix(level)} level`;
};

export const formatSpellLevelLabel = (level: SpellcastingLevel): string => {
  const levels = level.lowerLevel != null && level.lowerLevel < level.level
    ? `${level.lowerLevel}${getOrdinalSuffix(level.lowerLevel)}–${level.level}${getOrdinalSuffix(level.level)} level`
    : formatSpellLevel(level.level);
  if (level.slots == null) return levels;
  return `${levels} (${level.slots} slot${level.slots === 1 ? "" : "s"})`;
};

const FREQUENCY_PERIODS: Partial<Record<SpellFrequency, string>> = {
  rest: "rest",
  restLong: "long rest",
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

// "At will", "2/day each", "1/long rest", "Recharge 5–6", "3 charges each", "Ritual"
export const formatSpellFrequencyGroup = ({ frequency, count, each }: SpellFrequencyGroup): string => {
  const eachSuffix = each ? " each" : "";
  const period = FREQUENCY_PERIODS[frequency];
  if (period) return count != null ? `${count}/${period}${eachSuffix}` : `Per ${period}`;

  switch (frequency) {
    case "will":
      return "At will";
    case "constant":
      return "Constant";
    case "ritual":
      return "Ritual";
    case "recharge":
      return count == null || count >= 6 ? "Recharge 6" : `Recharge ${count}–6`;
    case "charges":
      return count != null ? `${count} charge${count === 1 ? "" : "s"}${eachSuffix}` : "Charges";
    case "legendary":
      return "Legendary action";
    default:
      return titleCase(frequency);
  }
};

export const buildEntitySections = (entity: DnD5eEntityDetails): EntityCardSection[] => {
  const groups = new Map<string, EntityCardEntry[]>();
  const firstSeen = new Map<string, number>();
  let seenIndex = 0;

  const addEntry = (sectionKey: string, entry: EntityCardEntry): void => {
    if (!groups.has(sectionKey)) {
      groups.set(sectionKey, []);
      firstSeen.set(sectionKey, seenIndex++);
    }

    groups.get(sectionKey)!.push(entry);
  };

  entity.traits?.forEach((trait, index) => {
    addEntry("trait", traitToEntry(trait, index));
  });

  entity.actions?.forEach((action, index) => {
    addEntry(normalizeEntrySection(action.actionType), actionToEntry(action, index));
  });

  entity.spellcasting?.forEach((spellcasting, index) => {
    addEntry(normalizeSpellcastingSection(spellcasting.displayAs), {
      kind: "spellcasting",
      key: `spellcasting-${index}-${spellcasting.name}`,
      spellcasting,
      sortOrder: Number.MAX_SAFE_INTEGER - 1000 + index,
    });
  });

  if (
    (entity.legendaryHeader?.length || entity.legendaryActionCount) &&
    !groups.has("legendary")
  ) {
    groups.set("legendary", []);
    firstSeen.set("legendary", seenIndex++);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      const leftOrder = getSectionSortOrder(left);
      const rightOrder = getSectionSortOrder(right);
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return (firstSeen.get(left) ?? 0) - (firstSeen.get(right) ?? 0);
    })
    .map(([sectionKey, entries]) => ({
      key: sectionKey,
      title: getSectionTitle(sectionKey),
      entries: [...entries].sort((left, right) => left.sortOrder - right.sortOrder),
    }));
};

const traitToEntry = (trait: EntityTrait, index: number): EntityCardEntry => ({
  kind: "trait",
  key: `trait-${index}-${trait.name}`,
  name: trait.name,
  description: trait.description,
  sortOrder: trait.sortOrder ?? index,
});

const actionToEntry = (action: EntityAction, index: number): EntityCardEntry => ({
  kind: "action",
  key: `action-${index}-${action.actionType}-${action.name}`,
  name: action.name,
  description: action.description,
  sortOrder: action.sortOrder ?? index,
});

const normalizeSpellcastingSection = (displayAs: string | undefined): string =>
  displayAs ? normalizeEntrySection(displayAs) : "spellcasting";

const normalizeEntrySection = (value: string | undefined): string => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "action";

  switch (normalized) {
    case "trait":
    case "traits":
      return "trait";
    case "action":
    case "actions":
      return "action";
    case "bonus":
    case "bonus action":
    case "bonus actions":
      return "bonus action";
    case "reaction":
    case "reactions":
      return "reaction";
    case "legendary":
    case "legendary action":
    case "legendary actions":
      return "legendary";
    case "mythic":
    case "mythic action":
    case "mythic actions":
      return "mythic";
    case "lair":
    case "lair action":
    case "lair actions":
      return "lair";
    case "regional":
    case "regional effect":
    case "regional effects":
      return "regional";
    case "villain":
    case "villain action":
    case "villain actions":
      return "villain";
    case "spellcasting":
      return "spellcasting";
    default:
      return normalized;
  }
};

const getSectionTitle = (sectionKey: string): string =>
  SECTION_TITLES[sectionKey] ?? titleCase(sectionKey);

const getSectionSortOrder = (sectionKey: string): number => {
  const order = SECTION_ORDER.indexOf(sectionKey);
  return order >= 0 ? order : Number.MAX_SAFE_INTEGER;
};

const getOrdinalSuffix = (num: number): string => {
  const ones = num % 10;
  const tens = num % 100;
  if (ones === 1 && tens !== 11) return "st";
  if (ones === 2 && tens !== 12) return "nd";
  if (ones === 3 && tens !== 13) return "rd";
  return "th";
};
