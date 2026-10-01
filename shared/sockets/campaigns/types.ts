/**
 * Campaign signals on the `/encounter` namespace. A player's client watches its selected campaign
 * and re-reads the current encounter (`GET /api/campaigns/:id/current-encounter`) on every change
 * signal and after every successful watch, so a missed signal during a disconnect is recovered.
 * The signal carries no selection: the stored selection is the only answer.
 */
export enum CampaignSocketEvents {
  /** Client → server, `{ campaignId }`, acknowledged with `SocketAck`. Replaces the previous watch. */
  WATCH = "campaign:watch",
  /** Client → server, `{ campaignId }`; stop receiving that campaign's signals. */
  UNWATCH = "campaign:unwatch",
  /** Server → client, `CurrentEncounterChanged`, sent after the change is committed. */
  CURRENT_ENCOUNTER_CHANGED = "campaign:currentEncounterChanged",
}

export type CampaignWatchRequest = { campaignId: number };

export type CurrentEncounterChanged = { campaignId: number };
