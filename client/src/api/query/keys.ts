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
};
