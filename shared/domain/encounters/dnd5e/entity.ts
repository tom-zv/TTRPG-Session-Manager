import { CoreEntity } from "../coreEntity.js";

export interface EntityTrait {
  name: string;
  description: string;
}

export interface EntityAction {
  name: string;
  description: string;
  actionType: string;
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
  descriptions: string[];  
  // slot-based spellcasting
  levels?: SpellcastingLevel[];
  // Usage-based spellcasting
  freqSpells?: { [freq: string]: string[] };  // e.g., 'at will', '1e' (1-each), '2'
}

export interface DnD5eEntityDetails extends CoreEntity {
  entityType: 'pc' | 'npc' | 'creature';
  cr?: string;
  ac: number;
  hp: number;
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
  resistances?: string[];
  immunities?: string[];
  vulnerabilities?: string[];
  traits?: EntityTrait[];
  actions?: EntityAction[];
  spellcasting?: EntitySpellcasting[];
}

// Summary types for lightweight list display
export interface DnD5eEntitySummary {
  templateId: number;
  name: string;
  entityType: 'pc' | 'npc' | 'creature';
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