export type CampaignDB = {
  id: number;
  name: string;
  description: string | null;
  created_by: number | null;
  created_at: string | Date;
  /** Selected by the GM list only. COUNT() can arrive as a string. */
  member_count?: number | string;
};

export type CampaignMemberDB = {
  campaign_id: number;
  user_id: number;
  username: string;
  added_at: string | Date;
};

export type CampaignUpdateDB = {
  name?: string;
  description?: string;
};
