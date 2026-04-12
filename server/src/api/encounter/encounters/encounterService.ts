import encounterModel from "./encounterModel.js";
import { EncounterDB, encounterUpdateDataDB, EncounterInsertData } from "./types.js";
import { dnd5eEncounterDbToDomainDetails } from "src/utils/format-transformers/encounter-transformers/dnd5e/encounter-transformer.js";
import { AnySystemEncounterDetails, SystemType } from "shared/domain/encounters/coreEncounter.js";
import dnd5eEncounterService from "./dnd5e/dnd5eEncounterService.js";

async function insertEncounter(system: SystemType, data: EncounterInsertData): Promise<number> {
  const insertId = await encounterModel.insertEncounter(data);

  if (!insertId) {
    throw new Error("Failed to insert encounter");
  }

  switch (system) {
    case 'dnd5e':
      dnd5eEncounterService.createInitialSnapshot(insertId);
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
  const result = await encounterModel.deleteEncounter(id);

  if (!result) {
    throw new Error(`Failed to delete encounter with ID ${id}`);
  }

  return result;
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
