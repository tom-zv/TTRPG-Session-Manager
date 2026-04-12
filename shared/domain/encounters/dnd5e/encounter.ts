import { CoreEncounter } from "../coreEncounter.js";
import { BaseEncounterState } from "../coreEncounter.js";
import { DnD5eEntitySummary, DnD5eEntity, DnD5eEntityState } from "./entity.js";

/**
 * DnD5e Encounter Details 
 */
export interface DnD5eEncounterDetails extends CoreEncounter {
  system: "dnd5e";
}

/**
 * DnD5e Encounter Summary 
 * Encounter metadata with lightweight entity summaries
 */
export interface DnD5eEncounterSummary extends DnD5eEncounterDetails {
  encounterEntitySummaries?: DnD5eEntitySummary[]; //TODO; entity summaries arent implemented yet
}

/**
 * DnD5e Encounter State 
 */
export interface DnD5eEncounterState extends BaseEncounterState {
  system: "dnd5e";
  currentRound: number;
  currentTurn: number;
  initiativeOrder: number[]; // Array of entity IDs in initiative order
  entityStates: DnD5eEntityState[];
}

/**
 * DnD5e Encounter 
 * Complete encounter - combines details + state + full entities 
 */
export type DnD5eEncounter = DnD5eEncounterDetails & Omit<DnD5eEncounterState, "entityStates"> & {
  entities: DnD5eEntity[];
}