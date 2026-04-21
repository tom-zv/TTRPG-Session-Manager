import { CoreEntity } from "../coreEntity.js";

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

// Represents spell slots for a particular level
export interface SpellcastingLevel {
  level: number;
  slots?: number;
  spells?: string[];
}

// Represents a complete spellcasting ability
export interface EntitySpellcasting {
  name: string;
  displayAs?: string;
  ability?: string;        // spellcasting ability: 'int', 'wis', 'cha'
  saveDc?: number;
  spellAttackBonus?: number;
  descriptions: string[];
  // slot-based spellcasting
  levels?: SpellcastingLevel[];
  // Usage-based spellcasting
  freqSpells?: { [freq: string]: string[] };  // e.g., 'at will', '1e' (1-each), '2'
}

export interface DnD5eEntityDetails extends CoreEntity {
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
}

export interface DnD5eEntityState {
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