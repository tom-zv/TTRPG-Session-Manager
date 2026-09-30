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

async function deleteEncounter(id: number): Promise<boolean> {
  // Queued behind any request in progress, so a running engine cannot store state for a deleted row.
  return encounterRequestQueue.enqueue(id, async () => {
    const result = await encounterModel.deleteEncounter(id);

    if (!result) {
      throw new NotFoundError(`Encounter with ID ${id} not found`);
    }

    encounterEngineManager.discardEngine(id);
    return result;
  });
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
  getSystemId,
};
