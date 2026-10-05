import type { EncounterPhase, SystemType } from "shared/domain/encounters/coreEncounter.js";
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
  /** The stored combat phase, or null without stored state. */
  readPhase(encounterId: number): Promise<EncounterPhase | null>;
  /** A campaign's encounters of this system whose combat has ended, most recently changed first. */
  listEndedEncounterIds(campaignId: number): Promise<number[]>;
};

const ENCOUNTER_SYSTEMS: Record<SystemType, EncounterSystem> = {
  dnd5e: {
    async loadEngine(encounterId) {
      const state = await dnd5eEncounterSnapshotsModel.getSnapshot(encounterId);
      return state ? new DnD5eEncounterEngine(state) : null;
    },
    readPhase: (encounterId) => dnd5eEncounterSnapshotsModel.getPhase(encounterId),
    listEndedEncounterIds: (campaignId) => dnd5eEncounterSnapshotsModel.getEndedEncounterIds(campaignId),
  },
};

/** The game system comes from the stored encounter, never from the client. */
export async function loadEncounterEngine(encounterId: number): Promise<IEncounterEngine> {
  const details = await encounterModel.getEncounterDetailsById(encounterId);
  const engine = details ? await ENCOUNTER_SYSTEMS[details.system]?.loadEngine(encounterId) : null;
  if (!engine) throw new EncounterNotFoundError(encounterId);
  return engine;
}

/** The stored combat phase of an encounter of any system, or null when it has none. */
export async function readEncounterPhase(encounterId: number, system: SystemType): Promise<EncounterPhase | null> {
  return (await ENCOUNTER_SYSTEMS[system]?.readPhase(encounterId)) ?? null;
}

/** The campaign's encounters whose combat has ended (the stored phase decides), for every system. */
export async function listEndedEncounterIds(campaignId: number): Promise<number[]> {
  const perSystem = await Promise.all(Object.values(ENCOUNTER_SYSTEMS).map((system) => system.listEndedEncounterIds(campaignId)));
  return perSystem.flat();
}
