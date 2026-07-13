import { CoreEntity } from "../coreEntity.js";
import type { EntitySettings } from "./settings.js";

export interface DamageModifier {
  damageType: string;
  conditionNote?: string;
}

export interface ConditionImmunity {
  conditionName: string;
  conditionNote?: string;
}

export interface EntityTrait {
  name: string;
  description: string;
  sortOrder?: number;
}

export interface EntityAction {
  name: string;
  description: string;
  actionType: string;
  sortOrder?: number;
}

// Usage-based spellcasting frequencies, in stat block display order (5etools keys).
export const SPELL_FREQUENCIES = [
  "constant",
  "will",
  "rest",
  "restLong",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "recharge",
  "charges",
  "legendary",
  "ritual",
] as const;
export type SpellFrequency = typeof SPELL_FREQUENCIES[number];

// Frequencies whose groups carry no count (the spell list is not limited per period).
export const UNCOUNTED_SPELL_FREQUENCIES: readonly SpellFrequency[] = ["constant", "will", "ritual"];

// Where a spellcasting block is listed on the stat block; undefined means its own "Spellcasting" section.
export const SPELLCASTING_DISPLAYS = ["trait", "action", "bonus action", "reaction", "legendary"] as const;
export type SpellcastingDisplay = typeof SPELLCASTING_DISPLAYS[number];

export interface SpellEntry {
  name: string;
  source?: string;          // source book, e.g. 'XPHB'
  note?: string;            // e.g. 'level 5 version', 'self only'
}

// Spell slots and spells for one spell level (0 = cantrips)
export interface SpellcastingLevel {
  level: number;
  slots?: number;
  lowerLevel?: number;      // pact magic: slots cover lowerLevel..level
  spells: SpellEntry[];
}

export interface SpellFrequencyGroup {
  frequency: SpellFrequency;
  // Meaning depends on frequency: uses per period (daily, rest, charges...),
  // or lowest recharge roll (recharge 5 = 5-6). For legendary it is uses, always 1.
  count?: number;
  each?: boolean;           // count applies to each spell ('1/day each')
  spells: SpellEntry[];
}

// Represents a complete spellcasting ability
export interface EntitySpellcasting {
  name: string;
  displayAs?: SpellcastingDisplay;
  ability?: string;        // spellcasting ability: 'int', 'wis', 'cha'
  saveDc?: number;
  spellAttackBonus?: number;
  descriptions: string[];
  hideSpellList?: boolean; // the descriptions already name the spells
  // slot-based spellcasting
  levels?: SpellcastingLevel[];
  // usage-based spellcasting, in display order
  frequencyGroups?: SpellFrequencyGroup[];
}

export const isSpellFrequency = (value: unknown): value is SpellFrequency =>
  typeof value === "string" && (SPELL_FREQUENCIES as readonly string[]).includes(value);

export const isSpellcastingDisplay = (value: unknown): value is SpellcastingDisplay =>
  typeof value === "string" && (SPELLCASTING_DISPLAYS as readonly string[]).includes(value);

export interface DnD5eEntityDetails extends CoreEntity {
  settings?: EntitySettings;
  role: 'pc' | 'npc' | 'creature';
  creatureType?: string;   // 5etools type: 'beast', 'humanoid', 'fiend', etc.
  typeTags?: string[];     // 5etools type.tags: ['elf'], ['shapechanger']
  cr?: string;
  ac: number;
  hp: number;
  hpFormula?: string;      // e.g. '6d10 + 12'
  speeds: { [key: string]: number }; // e.g., { walk: 30, fly: 40, swim: 20 }
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  alignment: string;
  abilityScores: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  saves?: { [key: string]: string };   // e.g. { str: '+6', con: '+4' }
  skills?: { [key: string]: string };  // e.g. { perception: '+3' }
  passivePerception?: number;
  senses?: string[];
  languages?: string[];
  resistances?: DamageModifier[];
  immunities?: DamageModifier[];
  vulnerabilities?: DamageModifier[];
  conditionImmunities?: ConditionImmunity[];
  traits?: EntityTrait[];
  actions?: EntityAction[];
  spellcasting?: EntitySpellcasting[];
  legendaryActionCount?: number;
  legendaryHeader?: string[];
}

// Summary types for lightweight list display
export interface DnD5eEntitySummary {
  templateId: number;
  name: string;
  role: 'pc' | 'npc' | 'creature';
  hp: number;
  cr?: string;
  /** A player character marked as a party member (entity setting `party.member`). */
  inParty?: boolean;
}

export interface DnD5eEntityState {
  inGrave: boolean;
  /** Not shown to players. The GM sees and runs it as usual. */
  hidden: boolean;
  // runtime combat state
  instanceId: number; // Unique ID for this entity instance in the encounter
  templateId: number; // Reference to the base entity details
  displayName?: string;
  group?: number;
  initiative: number;
  maxHp: number; 
  currentHp: number;
  tempHp: number;
  isConcentrating: boolean;
  deathSaveSuccesses: number;
  deathSaveFailures: number;
  reactionUsed: boolean;
  conditions: Array<{
    name: string;
    duration: number | null;
    startedOnRound: number | null;
  }> | null; // poisoned, charmed, etc.
}

// Full entity type - combines details + state 
export interface DnD5eEntity extends DnD5eEntityDetails, DnD5eEntityState {}
