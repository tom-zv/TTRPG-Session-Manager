export const SPELL_KEYS = {
  all: ["spells", "dnd5e"] as const,
  index: () => [...SPELL_KEYS.all, "index"] as const,
  detail: (id: number) => [...SPELL_KEYS.all, "detail", id] as const,
  casters: (id: number) => [...SPELL_KEYS.all, "casters", id] as const,
};
