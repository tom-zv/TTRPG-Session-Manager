import type {
  ConditionImmunity,
  DamageModifier,
  DnD5eEntityDetails,
  EntityAction,
  EntitySpellcasting,
  EntityTrait,
} from "shared/domain/encounters/dnd5e/entity.js";

export type AbilityKey = keyof DnD5eEntityDetails["abilityScores"];

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

export const ABILITY_KEYS: AbilityKey[] = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Str",
  dex: "Dex",
  con: "Con",
  int: "Int",
  wis: "Wis",
  cha: "Cha",
};

export const ABILITY_FULL_NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
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

export const calcMod = (score: number): number => Math.floor((score - 10) / 2);

export const formatSignedNumber = (value: number): string =>
  value >= 0 ? `+${value}` : String(value);

export const formatSignedValue = (value: string | number): string => {
  if (typeof value === "number") return formatSignedNumber(value);

  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^[+-]/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `+${trimmed}`;
  return trimmed;
};

export const capitalize = (value: string | undefined): string => {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const titleCase = (value: string): string =>
  value
    .split(/([\s/-]+)/)
    .map((part) => (/^[\s/-]+$/.test(part) ? part : capitalize(part.toLowerCase())))
    .join("");

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

export const formatSpellFrequency = (frequency: string): string => {
  const normalized = frequency.trim().toLowerCase();
  if (!normalized) return frequency;
  if (normalized === "will" || normalized === "at will") return "At will";
  if (normalized === "constant") return "Constant";

  const legacyDailyMatch = normalized.match(/^(\d+)(e?)$/);
  if (legacyDailyMatch) {
    return `${legacyDailyMatch[1]}/day${legacyDailyMatch[2] ? " each" : ""}`;
  }

  const underscoreIndex = normalized.indexOf("_");
  const kind = underscoreIndex >= 0 ? normalized.slice(0, underscoreIndex) : normalized;
  const detail = underscoreIndex >= 0 ? normalized.slice(underscoreIndex + 1) : undefined;

  if (!detail) return titleCase(kind);
  if (kind === "ritual") return `Ritual (${detail})`;

  const period = getFrequencyPeriod(kind);
  const detailMatch = detail.match(/^(\d+)(e?)$/);
  if (period && detailMatch) {
    return `${detailMatch[1]}/${period}${detailMatch[2] ? " each" : ""}`;
  }

  return `${titleCase(kind)} ${detail}`;
};

export const sortSpellFrequencyEntries = (
  left: [string, string[]],
  right: [string, string[]]
): number => {
  const leftOrder = getFrequencySortOrder(left[0]);
  const rightOrder = getFrequencySortOrder(right[0]);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left[0].localeCompare(right[0]);
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

const getFrequencyPeriod = (kind: string): string | undefined => {
  switch (kind) {
    case "daily":
      return "day";
    case "weekly":
      return "week";
    case "rest":
      return "rest";
    default:
      return undefined;
  }
};

const getFrequencySortOrder = (frequency: string): number => {
  const normalized = frequency.trim().toLowerCase();
  if (normalized === "constant") return 0;
  if (normalized === "will" || normalized === "at will") return 1;
  if (normalized.startsWith("rest")) return 2;
  if (normalized.startsWith("daily") || /^\d+e?$/.test(normalized)) return 3;
  if (normalized.startsWith("weekly")) return 4;
  if (normalized.startsWith("ritual")) return 5;
  return Number.MAX_SAFE_INTEGER;
};
