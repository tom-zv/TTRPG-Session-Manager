// Query keys
export const ENCOUNTER_KEYS = {
  all: ['encounters', 'dnd5e'] as const,
  /** Prefix of every campaign's summaries; invalidate it after any encounter change. */
  summaries: () => [...ENCOUNTER_KEYS.all, 'summaries'] as const,
  /** One campaign's summaries as one account reads them. */
  campaignSummaries: (userId: number, campaignId: number) => [...ENCOUNTER_KEYS.summaries(), userId, campaignId] as const,
  /** A direct read of one encounter within the campaign it was opened from. */
  details: (userId: number, campaignId: number, encounterId: number) =>
    [...ENCOUNTER_KEYS.all, 'details', userId, campaignId, encounterId] as const,
  state: (id: number) => [...ENCOUNTER_KEYS.all, 'state', id] as const,
  entityTemplates: (encounterId: number) => [...ENCOUNTER_KEYS.all, 'entityTemplates', encounterId] as const,
}; 