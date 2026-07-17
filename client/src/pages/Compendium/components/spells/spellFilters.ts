import type { SpellCastingUnit, SpellSchool, SpellSummary } from "shared/domain/dnd5e/spell.js";

export type CastingFilter = "" | "action" | "bonus action" | "reaction" | "longer";
export type SpellSort = "name" | "level";

export interface SpellFilterState {
  search: string;
  levels: number[];
  school: SpellSchool | "";
  className: string;
  casting: CastingFilter;
  concentration: boolean;
  ritual: boolean;
  damageType: string;
  save: string;
}

export const EMPTY_SPELL_FILTERS: SpellFilterState = {
  search: "",
  levels: [],
  school: "",
  className: "",
  casting: "",
  concentration: false,
  ritual: false,
  damageType: "",
  save: "",
};

export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export const CASTING_FILTER_OPTIONS: Array<{ value: CastingFilter; label: string }> = [
  { value: "", label: "Any casting time" },
  { value: "action", label: "Action" },
  { value: "bonus action", label: "Bonus action" },
  { value: "reaction", label: "Reaction" },
  { value: "longer", label: "1 minute or longer" },
];

const LONGER_UNITS: readonly SpellCastingUnit[] = ["minute", "hour"];

export function hasActiveSpellFilters(filters: SpellFilterState): boolean {
  return (
    filters.search.trim() !== "" ||
    filters.levels.length > 0 ||
    filters.school !== "" ||
    filters.className !== "" ||
    filters.casting !== "" ||
    filters.concentration ||
    filters.ritual ||
    filters.damageType !== "" ||
    filters.save !== ""
  );
}

// Name search also matches aliases ("Firebolt" finds Fire Bolt).
export function filterSpells(spells: readonly SpellSummary[], filters: SpellFilterState): SpellSummary[] {
  const search = filters.search.trim().toLowerCase();
  const levels = new Set(filters.levels);

  return spells.filter(spell => {
    if (search && !spell.name.toLowerCase().includes(search) && !spell.aliases.some(alias => alias.toLowerCase().includes(search))) {
      return false;
    }
    if (levels.size > 0 && !levels.has(spell.level)) return false;
    if (filters.school && spell.school !== filters.school) return false;
    if (filters.className && !spell.classes.includes(filters.className)) return false;
    if (filters.casting === "longer" ? !LONGER_UNITS.includes(spell.castingUnit) : filters.casting && spell.castingUnit !== filters.casting) {
      return false;
    }
    if (filters.concentration && !spell.concentration) return false;
    if (filters.ritual && !spell.ritual) return false;
    if (filters.damageType && !spell.damageTypes.includes(filters.damageType)) return false;
    if (filters.save && !spell.saves.includes(filters.save)) return false;
    return true;
  });
}

export function sortSpells(spells: SpellSummary[], sort: SpellSort): SpellSummary[] {
  const byName = (left: SpellSummary, right: SpellSummary) => left.name.localeCompare(right.name);
  return [...spells].sort(sort === "level" ? (left, right) => left.level - right.level || byName(left, right) : byName);
}

// Option lists for the class, damage type and saving throw selects, from the spells themselves.
export function collectSpellFilterOptions(spells: readonly SpellSummary[]) {
  const sorted = (values: Iterable<string>) => [...new Set(values)].sort((left, right) => left.localeCompare(right));
  return {
    classes: sorted(spells.flatMap(spell => spell.classes)),
    damageTypes: sorted(spells.flatMap(spell => spell.damageTypes)),
    saves: sorted(spells.flatMap(spell => spell.saves)),
  };
}

export const formatSpellLevelShort = (level: number): string => (level === 0 ? "Cantrip" : String(level));

export const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
