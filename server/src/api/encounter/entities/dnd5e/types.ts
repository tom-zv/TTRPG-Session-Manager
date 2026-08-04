
import { CoreEntityDB, CoreEntitySummaryDB } from "../types.js";
import type { EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";
import type {
  DnD5eEntitySize,
  SpellcastingDisplay,
  SpellEntry,
  SpellFrequencyGroup,
} from "shared/domain/encounters/dnd5e/entity.js";

export interface DamageModifierDB {
  damage_type: string;
  condition_note?: string;
}

export interface ConditionImmunityDB {
  condition_name: string;
  condition_note?: string;
}

export interface EntityTraitDB {
  name: string;
  description: string;
  sort_order?: number;
}

export interface EntityActionDB {
  name: string;
  description: string;
  action_type: string;
  sort_order?: number;
}

// Represents spell slots for a particular level
export interface SpellcastingLevelDB {
  level: number;
  slots?: number;
  lower_level?: number;
  spells: SpellEntry[];
}

// Represents a complete spellcasting ability after DB query
export interface EntitySpellcastingDB {
  name: string;
  display_as?: SpellcastingDisplay;
  ability?: string;           // spellcasting ability: 'int', 'wis', 'cha'
  save_dc?: number;
  spell_attack_bonus?: number;
  descriptions: string[];
  hide_spell_list?: boolean;
  // slot-based spellcasting
  levels?: SpellcastingLevelDB[];
  // usage-based spellcasting, in display order
  frequency_groups?: SpellFrequencyGroup[];
}

export interface DnD5eEntityDB extends CoreEntityDB {
  settings?: EntitySettings;
  role: 'pc' | 'npc' | 'creature';
  creature_type?: string;
  type_tags?: string[];
  cr?: string;
  ac: number;
  hp: number;
  hp_formula?: string;
  speeds: { [key: string]: number };
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  alignment: string;
  ability_scores: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  saves?: { [key: string]: string };
  skills?: { [key: string]: string };
  passive_perception?: number;
  senses?: string[];
  languages?: string[];
  resistances?: DamageModifierDB[];
  immunities?: DamageModifierDB[];
  vulnerabilities?: DamageModifierDB[];
  condition_immunities?: ConditionImmunityDB[];
  traits?: EntityTraitDB[];
  actions?: EntityActionDB[];
  spellcasting?: EntitySpellcastingDB[];
  legendary_action_count?: number;
  legendary_header?: string[];
}

export type DnD5eEntityUpdateDB = Partial<DnD5eEntityDB>;

export interface DnD5eEntitySummaryDB extends CoreEntitySummaryDB {
  role: 'pc' | 'npc' | 'creature';
  cr?: string | null;
  hp: number;
  creature_type?: string | null;
  size: DnD5eEntitySize;
  in_party?: number | boolean;
}
