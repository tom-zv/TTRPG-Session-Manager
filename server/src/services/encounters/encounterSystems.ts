import type { SystemType } from "shared/domain/encounters/coreEncounter.js";
import encounterModel from "src/api/encounter/encounters/encounterModel.js";
import dnd5eEncounterSnapshotsModel from "src/api/encounter/encounters/dnd5e/dnd5eEncounterSnapshotsModel.js";
import { DnD5eEncounterEngine } from "./dnd5e/dnd5eEncounterEngine.js";
import type { IEncounterEngine } from "./encounterEngine.js";

export class EncounterNotFoundError extends Error {
  constructor(encounterId: number) {
    super(`Encounter ${encounterId} not found`);
    this.name = "EncounterNotFoundError";
  }
}

/** What the generic layers need from a game system. A new system is one entry here. */
type EncounterSystem = {
  /** Builds an engine from the stored state, or returns null when the encounter has none. */
  loadEngine(encounterId: number): Promise<IEncounterEngine | null>;
};

const ENCOUNTER_SYSTEMS: Record<SystemType, EncounterSystem> = {
  dnd5e: {
    async loadEngine(encounterId) {
      const state = await dnd5eEncounterSnapshotsModel.getSnapshot(encounterId);
      return state ? new DnD5eEncounterEngine(state) : null;
    },
  },
};

/** The game system comes from the stored encounter, never from the client. */
export async function loadEncounterEngine(encounterId: number): Promise<IEncounterEngine> {
  const details = await encounterModel.getEncounterDetailsById(encounterId);
  const engine = details ? await ENCOUNTER_SYSTEMS[details.system]?.loadEngine(encounterId) : null;
  if (!engine) throw new EncounterNotFoundError(encounterId);
  return engine;
}
