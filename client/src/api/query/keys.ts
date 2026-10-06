// Query keys for app-wide data
export const USER_KEYS = {
  all: ['users'] as const,
  list: () => [...USER_KEYS.all, 'list'] as const,
};

// Campaign answers depend on the account (a GM sees every campaign, a player their memberships), so
// they are keyed by user: another account in the same tab never reads the previous one's answer.
export const CAMPAIGN_KEYS = {
  all: ['campaigns'] as const,
  list: (userId: number) => [...CAMPAIGN_KEYS.all, userId, 'list'] as const,
  members: (userId: number, campaignId: number) => [...CAMPAIGN_KEYS.all, userId, 'members', campaignId] as const,
  /** What the campaign's players are shown. Re-read on every change signal and after a (re)watch. */
  currentEncounter: (userId: number, campaignId: number) => [...CAMPAIGN_KEYS.all, userId, 'currentEncounter', campaignId] as const,
  /**
   * The campaign's ended encounters. Re-read on mount, on each change signal and whenever a board
   * of this campaign sees a phase change.
   */
  encounterHistory: (userId: number, campaignId: number) => [...CAMPAIGN_KEYS.all, userId, 'encounterHistory', campaignId] as const,
};

/** Every account's history key of one campaign, for code that does not know the account. */
export const isEncounterHistoryKey = (queryKey: readonly unknown[], campaignId: number): boolean =>
  queryKey[0] === CAMPAIGN_KEYS.all[0] && queryKey[2] === 'encounterHistory' && queryKey[3] === campaignId;
