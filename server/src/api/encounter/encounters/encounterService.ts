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

async function insertEncounter(system: SystemType, data: EncounterInsertData, creatorId: number): Promise<number> {
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

async function getAllEncountersBySystem(system: SystemType): Promise<EncounterDB[]> {
  return encounterModel.getAllEncountersBySystem(system);
}

async function getEncounterDetailsById(
  encounterId: number
): Promise<AnySystemEncounterDetails | null> {
  const encounterDb = await encounterModel.getEncounterDetailsById(encounterId);

  if (!encounterDb) {
    return null;
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
  getAllEncountersBySystem,
  getEncounterDetailsById,
  updateEncounter,
  deleteEncounter,
  getSystemId,
};
