/**
 * Campaign selection rules for the shell. The selected campaign scopes encounter prep now, and the
 * player board (S3) and Compendium (S6) later.
 *
 * Order: a valid campaign in the URL, then the account's last valid choice in this browser, then
 * the only campaign the account can open, then nothing (the shell shows a chooser). A stored or
 * URL campaign the account can no longer open is ignored.
 */

export const encounterPaths = {
  section: "/encounter-manager",
  campaign: (campaignId: number) => `/encounter-manager/${campaignId}`,
  encounter: (campaignId: number, encounterId: number) => `/encounter-manager/${campaignId}/${encounterId}`,
};

const positiveId = (segment: string): number => {
  const id = /^\d+$/.test(segment) ? Number(segment) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
};

/**
 * `/encounter-manager[/:campaignId[/:encounterId]]`, or null on another section. A segment that is
 * not an ID parses as 0, which no campaign or encounter has.
 */
export function parseEncounterPath(pathname: string): { campaignId: number | null; encounterId: number | null } | null {
  const [section, campaign, encounter] = pathname.split("/").filter(Boolean);
  if (section !== "encounter-manager") return null;
  return {
    campaignId: campaign === undefined ? null : positiveId(campaign),
    encounterId: encounter === undefined ? null : positiveId(encounter),
  };
}

export type CampaignSelectionSource = "url" | "stored" | "sole";

export interface CampaignResolution {
  selectedId: number | null;
  source: CampaignSelectionSource | null;
  /** The URL names a campaign this account cannot open. */
  urlUnavailable: boolean;
}

export function resolveCampaignSelection(
  accessibleIds: readonly number[],
  urlId: number | null,
  storedId: number | null,
): CampaignResolution {
  const accessible = new Set(accessibleIds);
  const urlUnavailable = urlId !== null && !accessible.has(urlId);
  if (urlId !== null && !urlUnavailable) return { selectedId: urlId, source: "url", urlUnavailable };
  if (storedId !== null && accessible.has(storedId)) return { selectedId: storedId, source: "stored", urlUnavailable };
  if (accessibleIds.length === 1) return { selectedId: accessibleIds[0], source: "sole", urlUnavailable };
  return { selectedId: null, source: null, urlUnavailable };
}

// The last choice is remembered per account, so another account in this browser starts from its own.
const storageKey = (userId: number) => `ttrpg.lastCampaign.${userId}`;

export function readLastCampaign(userId: number): number | null {
  const id = positiveId(localStorage.getItem(storageKey(userId)) ?? "");
  return id === 0 ? null : id;
}

export function writeLastCampaign(userId: number, campaignId: number): void {
  localStorage.setItem(storageKey(userId), String(campaignId));
}
