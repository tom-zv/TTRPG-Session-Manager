interface CoreEntityDB {
  id: number;
  name: string;
  image_url?: string;
  created_at: string;
}

export interface EntityTraitDB {
  name: string;
  description: string;
}

export interface EntityActionDB {
  name: string;
  description: string;
  action_type: string;
}

// Represents spell slots for a particular level
export interface SpellcastingLevelDB {
  level: number;
  slots?: number;
  spells?: string[];
}

// Represents a complete spellcasting ability after DB query
export interface EntitySpellcastingDB {
  name: string;
  display_as?: string;
  descriptions: string[];  
  // slot-based spellcasting
  levels?: SpellcastingLevelDB[];
  // Use-per-frequency based spellcasting
  freq_spells?: { [freq: string]: string[] };  // e.g., 'at will', '1e' (1-each), '2'
}

export interface DnD5eEntityDB extends CoreEntityDB {
  entity_type: 'pc' | 'npc' | 'creature';
  cr?: string;
  ac: number;
  hp: number;
  speed: number;
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  allignment: string;
  ability_scores: {
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
  traits?: EntityTraitDB[];
  actions?: EntityActionDB[];
  spellcasting?: EntitySpellcastingDB[];
}

export type DnD5eEntityUpdateDB = Partial<DnD5eEntityDB>;

// Summary types for lightweight list display
export interface CoreEntitySummaryDB {
  id: number;
  name: string;
}

export interface DnD5eEntitySummaryDB extends CoreEntitySummaryDB {
  entity_type: 'pc' | 'npc' | 'creature';
  cr?: string;
}