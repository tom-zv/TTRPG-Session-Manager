import type { DnD5eEntitySize, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";

/** The GM's entity views. NPCs includes featured NPCs; Party means a PC marked as a party member. */
export const ENTITY_VIEWS = [
  { value: "all", label: "All" },
  { value: "party", label: "Party" },
  { value: "pcs", label: "PCs" },
  { value: "featured", label: "Featured NPCs" },
  { value: "npcs", label: "NPCs" },
  { value: "creatures", label: "Creatures" },
] as const;
export type EntityView = typeof ENTITY_VIEWS[number]["value"];

export const ENTITY_SORTS = [
  { value: "name", label: "Sort by name" },
  { value: "cr-asc", label: "CR, low to high" },
  { value: "cr-desc", label: "CR, high to low" },
  { value: "hp-asc", label: "Template HP, low to high" },
  { value: "hp-desc", label: "Template HP, high to low" },
] as const;
export type EntitySort = typeof ENTITY_SORTS[number]["value"];

export type EntityFilterState = {
  view: EntityView;
  search: string;
  creatureType: string;
  size: DnD5eEntitySize | "";
  /** Inclusive CR bounds, as CR strings from the index ("1/4", "5"); "" means no bound. */
  crMin: string;
  crMax: string;
};

export const EMPTY_ENTITY_FILTERS: EntityFilterState = {
  view: "all",
  search: "",
  creatureType: "",
  size: "",
  crMin: "",
  crMax: "",
};

const SIZE_ORDER: readonly DnD5eEntitySize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

/** A CR as a number: "0", "1/8", "1/2", "10". Missing or unparseable is null. */
export function parseCr(cr: string | undefined): number | null {
  const value = cr?.trim();
  if (!value) return null;
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

const matchesView = (entity: DnD5eEntitySummary, view: EntityView): boolean => {
  switch (view) {
    case "all": return true;
    case "party": return entity.role === "pc" && entity.inParty === true;
    case "pcs": return entity.role === "pc";
    case "featured": return entity.role === "npc" && entity.featuredNpc;
    case "npcs": return entity.role === "npc";
    case "creatures": return entity.role === "creature";
  }
};

/** Every active filter must match. A missing or unparseable CR is excluded only while a CR bound is set. */
export function filterEntities(entities: readonly DnD5eEntitySummary[], filters: EntityFilterState): DnD5eEntitySummary[] {
  const search = filters.search.trim().toLowerCase();
  const min = parseCr(filters.crMin);
  const max = parseCr(filters.crMax);
  const crBounded = min !== null || max !== null;

  return entities.filter(entity => {
    if (!matchesView(entity, filters.view)) return false;
    if (search && !entity.name.toLowerCase().includes(search)) return false;
    if (filters.creatureType && entity.creatureType?.toLowerCase() !== filters.creatureType.toLowerCase()) return false;
    if (filters.size && entity.size !== filters.size) return false;
    if (crBounded) {
      const cr = parseCr(entity.cr);
      if (cr === null) return false;
      if (min !== null && cr < min) return false;
      if (max !== null && cr > max) return false;
    }
    return true;
  });
}

const byName = (a: DnD5eEntitySummary, b: DnD5eEntitySummary) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.templateId - b.templateId;

/** Sorted copy. Missing CR sorts last in either direction; name, then template ID, break ties. */
export function sortEntities(entities: readonly DnD5eEntitySummary[], sort: EntitySort): DnD5eEntitySummary[] {
  const sorted = [...entities];
  switch (sort) {
    case "name":
      return sorted.sort(byName);
    case "cr-asc":
    case "cr-desc": {
      const direction = sort === "cr-asc" ? 1 : -1;
      return sorted.sort((a, b) => {
        const left = parseCr(a.cr);
        const right = parseCr(b.cr);
        if (left === null || right === null) {
          if (left !== right) return left === null ? 1 : -1;
          return byName(a, b);
        }
        return (left - right) * direction || byName(a, b);
      });
    }
    case "hp-asc":
    case "hp-desc": {
      const direction = sort === "hp-asc" ? 1 : -1;
      return sorted.sort((a, b) => (a.hp - b.hp) * direction || byName(a, b));
    }
  }
}

export type EntityFilterOptions = { creatureTypes: string[]; sizes: DnD5eEntitySize[]; crs: string[] };

/** Filter choices from the loaded index: creature types by name, sizes small to large, CRs by value. */
export function collectEntityFilterOptions(entities: readonly DnD5eEntitySummary[]): EntityFilterOptions {
  const creatureTypes = new Map<string, string>();
  const sizes = new Set<DnD5eEntitySize>();
  const crs = new Map<number, string>();
  for (const entity of entities) {
    const type = entity.creatureType?.trim();
    if (type && !creatureTypes.has(type.toLowerCase())) creatureTypes.set(type.toLowerCase(), type);
    sizes.add(entity.size);
    const cr = parseCr(entity.cr);
    if (cr !== null && !crs.has(cr)) crs.set(cr, entity.cr!.trim());
  }
  return {
    creatureTypes: [...creatureTypes.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    sizes: SIZE_ORDER.filter(size => sizes.has(size)),
    crs: [...crs.entries()].sort(([a], [b]) => a - b).map(([, label]) => label),
  };
}

export const hasActiveEntityFilters = (filters: EntityFilterState): boolean =>
  filters.view !== EMPTY_ENTITY_FILTERS.view ||
  filters.search.trim() !== "" ||
  filters.creatureType !== "" ||
  filters.size !== "" ||
  filters.crMin !== "" ||
  filters.crMax !== "";
