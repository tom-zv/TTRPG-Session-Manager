import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import dnd5eEncounterSnapshotsModel from "./dnd5eEncounterSnapshotsModel.js";
import { EncounterSettings, resolveEncounterSettings } from "shared/domain/encounters/dnd5e/settings.js";

/** Stores the starting state of a new encounter. Later changes go through the encounter engine. */
async function createSnapshot(insertId: number, settings: EncounterSettings = resolveEncounterSettings()): Promise<void> {
  const snapshot: DnD5eEncounterState = {
    id: insertId,
    system: "dnd5e",
    version: 0,
    phase: "setup",
    settings,
    currentRound: 0,
    currentTurn: 0,
    initiativeOrder: [],
    nextInstanceId: 0,
    entityStates: [],
  };

  await dnd5eEncounterSnapshotsModel.createEncounterSnapshot(
    insertId,
    snapshot
  );
}

export default {
  createSnapshot,
};
