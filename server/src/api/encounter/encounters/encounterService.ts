import encounterModel from "./encounterModel.js";
import userModel from "src/api/users/userModel.js";
import { resolveEncounterSettings } from "shared/domain/encounters/dnd5e/settings.js";
import { EncounterDB, encounterUpdateDataDB, EncounterInsertData } from "./types.js";
import { dnd5eEncounterDbToDomainDetails } from "src/utils/format-transformers/encounter-transformers/dnd5e/encounter-transformer.js";
import { AnySystemEncounterDetails, SystemType } from "shared/domain/encounters/coreEncounter.js";
import dnd5eEncounterService from "./dnd5e/dnd5eEncounterService.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import { NotFoundError } from "src/api/HttpErrors.js";
import campaignService from "src/api/campaigns/campaignService.js";
import type { UserDB } from "src/api/users/types.js";
import currentEncounterModel from "src/api/campaigns/currentEncounterModel.js";
import type { CurrentEncounterDTO } from "shared/DTO/campaigns/types.js";
import { currentEncounterToDto } from "src/utils/format-transformers/campaign-transformer.js";
import { listEndedEncounterIds } from "src/services/encounters/encounterSystems.js";

export const ENCOUNTER_NOT_FOUND = "Encounter not found";

/** Create an encounter in `data.campaign_id`, which must exist. */
async function insertEncounter(system: SystemType, data: EncounterInsertData, creator: Pick<UserDB, "id" | "is_gm">): Promise<number> {
  await campaignService.assertCampaignAccess(creator, data.campaign_id);
  const creatorId = creator.id;
  const preferences = await userModel.getPreferences(creatorId);
  const insertId = await encounterModel.insertEncounter(data);

  if (!insertId) {
    throw new Error("Failed to insert encounter");
  }

  switch (system) {
    case 'dnd5e':
      await dnd5eEncounterService.createSnapshot(insertId, resolveEncounterSettings(preferences.encounterDefaults?.dnd5e));
      break;
    default:
      throw new Error(`Unsupported system: ${system}`);
  }

  return insertId;
}

/** One campaign's encounters, for a user who can reach that campaign. */
async function getCampaignEncountersBySystem(
  user: Pick<UserDB, "id" | "is_gm">,
  campaignId: number,
  system: SystemType
): Promise<EncounterDB[]> {
  await campaignService.assertCampaignAccess(user, campaignId);
  return encounterModel.getCampaignEncountersBySystem(campaignId, system);
}

/**
 * A direct read of one encounter, scoped to the campaign the caller has selected. An encounter of
 * another campaign answers like a missing one, so a stale or edited URL never shows it as part of
 * the selected campaign.
 */
async function getCampaignEncounterDetails(
  user: Pick<UserDB, "id" | "is_gm">,
  campaignId: number,
  encounterId: number
): Promise<AnySystemEncounterDetails> {
  await campaignService.assertCampaignAccess(user, campaignId);
  const encounterDb = await encounterModel.getEncounterDetailsById(encounterId);

  if (!encounterDb || encounterDb.campaign_id !== campaignId) {
    throw new NotFoundError(ENCOUNTER_NOT_FOUND);
  }

  switch (encounterDb.system) {
    case "dnd5e":
      return dnd5eEncounterDbToDomainDetails(encounterDb);
    default:
      throw new Error(`Unsupported system: ${encounterDb.system}`);
  }
}

async function updateEncounter(
  id: number,
  data: encounterUpdateDataDB
): Promise<EncounterDB> {
  const result = await encounterModel.updateEncounter(id, data);

  if (!result) {
    throw new Error(`Failed to update encounter with ID ${id}`);
  }

  const updatedEncounterDb = await encounterModel.getEncounterDetailsById(id);

  if (!updatedEncounterDb) {
    throw new Error(`Encounter with ID ${id} not found after update`);
  }

  return updatedEncounterDb;
}

/**
 * Delete an encounter; returns its campaign. Deleting the campaign's current encounter clears the
 * selection through the cascade on `core.campaign_current_encounters`; any other one leaves it.
 */
async function deleteEncounter(id: number): Promise<{ campaignId: number }> {
  // Queued behind any request in progress, so a running engine cannot store state for a deleted row.
  return encounterRequestQueue.enqueue(id, async () => {
    const encounter = await encounterModel.getEncounterDetailsById(id);
    if (!encounter || !(await encounterModel.deleteEncounter(id))) {
      throw new NotFoundError(`Encounter with ID ${id} not found`);
    }

    encounterEngineManager.discardEngine(id);
    return { campaignId: encounter.campaign_id };
  });
}

/**
 * The encounter a campaign's players are shown, for a user who can reach that campaign. GM notes
 * are never part of it.
 */
async function getCurrentEncounter(
  user: Pick<UserDB, "id" | "is_gm">,
  campaignId: number
): Promise<CurrentEncounterDTO | null> {
  await campaignService.assertCampaignAccess(user, campaignId);
  const encounterId = await currentEncounterModel.getCurrentEncounterId(campaignId);
  if (encounterId === null) return null;
  const encounterDb = await encounterModel.getEncounterDetailsById(encounterId);
  return encounterDb ? currentEncounterToDto(encounterDb) : null;
}

/**
 * A campaign's history: its encounters whose combat has ended, by the stored phase, most recently
 * changed first. The status label cannot put prep here. GM notes are never part of it.
 */
async function getEncounterHistory(
  user: Pick<UserDB, "id" | "is_gm">,
  campaignId: number
): Promise<CurrentEncounterDTO[]> {
  await campaignService.assertCampaignAccess(user, campaignId);
  const ids = await listEndedEncounterIds(campaignId);
  const encounters = await Promise.all(ids.map((id) => encounterModel.getEncounterDetailsById(id)));
  return encounters.flatMap((encounterDb) =>
    encounterDb && encounterDb.campaign_id === campaignId ? [currentEncounterToDto(encounterDb)] : []);
}

async function getSystemId(systemName: SystemType): Promise<number> {
  return encounterModel.getSystemId(systemName);
}

export default {
  insertEncounter,
  getCampaignEncountersBySystem,
  getCampaignEncounterDetails,
  updateEncounter,
  deleteEncounter,
  getCurrentEncounter,
  getEncounterHistory,
  getSystemId,
};
