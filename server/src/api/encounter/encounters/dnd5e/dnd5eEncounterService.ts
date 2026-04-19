import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import dnd5eEncounterSnapshotsModel from "./dnd5eEncounterSnapshotsModel.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";

export async function saveSnapshot(
  encounterId: number,
  snapshot: DnD5eEncounterState
) {
  await dnd5eEncounterSnapshotsModel.saveSnapshot(encounterId, snapshot);
}

/**
 * Save complete encounter state
 */
async function saveEncounterState(
  encounterId: number,
  encounterState: DnD5eEncounterState
): Promise<void> {
  await saveSnapshot(encounterId, encounterState);
}


/**
 * Get encounter state 
 * @param encounterId - The encounter ID
 * @returns Encounter state from live engine if available, otherwise persisted state
 */
async function getEncounterState(
  encounterId: number
): Promise<DnD5eEncounterState | null> {
  const engine = encounterEngineManager.getEngine(encounterId);
  if (engine) {
    return engine.snapshot() as DnD5eEncounterState;
  }

  return dnd5eEncounterSnapshotsModel.getSnapshot(encounterId);
}   

async function createSnapshot(insertId: number): Promise<void> {
  const snapshot: DnD5eEncounterState = {
    id: insertId,
    system: "dnd5e",
    version: 0,
    currentRound: 0,
    currentTurn: 0,
    initiativeOrder: [],
    entityStates: [],
  };

  await dnd5eEncounterSnapshotsModel.createEncounterSnapshot(
    insertId,
    snapshot
  );
}

export default {
  saveSnapshot,
  saveEncounterState,
  getEncounterState,
  createSnapshot,
};
