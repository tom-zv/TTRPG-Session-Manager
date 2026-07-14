import type { SpellCastingUnit, SpellSchool, SpellTagType } from "shared/domain/dnd5e/spell.js";

// dnd5e.spells row, as written by the importer and the API.
export interface SpellWriteDB {
  name: string;
  source: string;
  page: number | null;
  level: number;
  school: SpellSchool;
  ritual: boolean;
  concentration: boolean;
  casting_time: string;
  casting_unit: SpellCastingUnit;
  casting_trigger: string | null;
  range_text: string;
  range_feet: number | null;
  comp_v: boolean;
  comp_s: boolean;
  comp_m: boolean;
  material: string | null;
  material_cost_cp: number | null;
  material_consumed: boolean;
  duration: string;
  description: string;
  higher_levels: string | null;
}

export interface SpellDB extends SpellWriteDB {
  id: number;
  locally_edited: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SpellTagDB {
  tag_type: SpellTagType;
  tag: string;
}
