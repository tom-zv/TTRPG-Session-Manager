// Query keys
export const ENCOUNTER_KEYS = {
  all: ['encounters', 'dnd5e'] as const,
  summaries: () => [...ENCOUNTER_KEYS.all, 'summaries'] as const,
  state: (id: number) => [...ENCOUNTER_KEYS.all, 'state', id] as const,
  entityTemplates: (encounterId: number) => [...ENCOUNTER_KEYS.all, 'entityTemplates', encounterId] as const,
}; 