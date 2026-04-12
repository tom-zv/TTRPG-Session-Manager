import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import dnd5eEncounterSnapshotsModel from "./dnd5eEncounterSnapshotsModel.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";

export async function saveInitialSnapshot(
  encounterId: number,
  snapshot: DnD5eEncounterState
) {
  await dnd5eEncounterSnapshotsModel.updateEncounterSnapshots(encounterId, {
    initial_snapshot: snapshot,
  });
}

export async function saveActiveSnapshot(
  encounterId: number,
  snapshot: DnD5eEncounterState
) {
  await dnd5eEncounterSnapshotsModel.updateEncounterSnapshots(encounterId, {
    active_snapshot: snapshot,
  });
}

/**
 * Save complete encounter state
 */
async function saveEncounterState(
  encounterId: number,
  encounterState: DnD5eEncounterState,
  snapshotType: "initial" | "active"
): Promise<void> {
  
  if (snapshotType === "initial") {
    await saveInitialSnapshot(encounterId, encounterState);
  } else {
    await saveActiveSnapshot(encounterId, encounterState);
  }
}


/**
 * Get encounter state 
 * @param encounterId - The encounter ID
 * @param snapshotType - Optional: 'active', 'initial', or 'live'
 *                       - 'live': Get from in-memory engine if active
 *                       - 'active': Get last persisted active snapshot
 *                       - 'initial': Get initial snapshot
 *                       - If not specified, prefers live -> active -> initial
 * @returns Object containing the state and which snapshot type was actually returned
 */
async function getEncounterState(
  encounterId: number,
  snapshotType?: "active" | "initial" | "live"
): Promise<{ encounterState: DnD5eEncounterState; returnedSnapshotType: 'active' | 'initial' | 'live' } | null> {

  // Handle specific snapshot type requests
  if (snapshotType === "initial") {
    const snapshot = await dnd5eEncounterSnapshotsModel.getInitialSnapshot(encounterId);
    return snapshot ? { encounterState: snapshot, returnedSnapshotType: 'initial' } : null;
  } 
  
  if (snapshotType === "active") {
    const snapshot = await dnd5eEncounterSnapshotsModel.getActiveSnapshot(encounterId);
    return snapshot ? { encounterState: snapshot, returnedSnapshotType: 'active' } : null;
  }

  // For 'live' or undefined: prefer live engine -> fall back to persisted snapshots
  const engine = encounterEngineManager.getEngine(encounterId);
  if (engine) {
    return {
      encounterState: engine.snapshot() as DnD5eEncounterState,
      returnedSnapshotType: 'live'
    };
  }

  // No live engine, get persisted snapshot (active -> initial)
  const result = await dnd5eEncounterSnapshotsModel.getSnapshot(encounterId);
  return result;
}   

async function createInitialSnapshot(insertId: number): Promise<void> {
  // Create initial empty state snapshot for the new encounter
  const initialSnapshot: DnD5eEncounterState = {
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
    initialSnapshot
  );
}

export default {
  saveInitialSnapshot,
  saveActiveSnapshot,
  saveEncounterState,
  getEncounterState,
  createInitialSnapshot,
};
