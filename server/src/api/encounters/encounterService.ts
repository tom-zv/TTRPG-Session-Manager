import encounterModel, { getEncounterById } from "./encounterModel.js";
import { EncounterDB, encounterUpdateDataDB, EncounterInsertData } from "./types.js";

async function insertEncounter(data: EncounterInsertData): Promise<number> {

    const insertId = await encounterModel.insertEncounter(data);

    if (!insertId) {
        throw new Error("Failed to insert encounter");
    }

    return insertId;
}

async function assignEntitiesToEncounter(encounterId: number, entityIds: number[]): Promise<boolean> {
    const result = await encounterModel.assignEntitiesToEncounter(encounterId, entityIds);
    
    if (!result) {
        throw new Error("Failed to assign entities to encounter");
    }
    
    return result;
}

async function updateEncounter(
  id: number,
  data: encounterUpdateDataDB
): Promise<EncounterDB> {
  const result = await encounterModel.updateEncounter(id, data);
  
  if (!result) {
    throw new Error(`Failed to update encounter with ID ${id}`);
  }

  const updatedEncounter = await getEncounterById(id);
  
  if (!updatedEncounter) {
    throw new Error(`Encounter with ID ${id} not found after update`);
  }
  
  return updatedEncounter;
}

async function deleteEncounter(id: number): Promise<boolean> {
  const result = await encounterModel.deleteEncounter(id);
  
  if (!result) {
    throw new Error(`Failed to delete encounter with ID ${id}`);
  }
  
  return result;
}

async function getAllEncounters(): Promise<EncounterDB[]> {
  const encounters = await encounterModel.getAllEncounters();
  
  if (!encounters) {
    throw new Error("Failed to retrieve encounters");
  }
  
  return encounters;
}

export default {
  insertEncounter,
  assignEntitiesToEncounter,
  updateEncounter,
  deleteEncounter,
  getAllEncounters
}