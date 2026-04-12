// Query keys
export const ENTITY_KEYS = {
  all: ['entities', 'dnd5e'] as const,
  summaries: () => [...ENTITY_KEYS.all, 'summaries'] as const,
  template: (id: number) => [...ENTITY_KEYS.all, 'template', id] as const,
};
