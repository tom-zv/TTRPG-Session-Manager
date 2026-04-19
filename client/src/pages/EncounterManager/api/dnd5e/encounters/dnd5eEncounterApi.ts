import { CreatePayload, UpdatePayload } from "src/pages/EncounterManager/types.js";
import EncounterApi from "../../encounterApi.js";
import type { 
  DnD5eEncounterSummary, 
  DnD5eEncounterState,
  DnD5eEncounterDetails
} from "shared/domain/encounters/dnd5e/encounter.js";

/**
 * API wrapper for DnD5e specific encounter operations
 * Provides type-safe access to encounter summaries, details, entities, and state
 */
export class DnD5eEncounterApi {
  /**
   * Get encounter summaries (encounter details + entity summaries)
   */
  static async getEncounterSummaries(): Promise<DnD5eEncounterSummary[]> {
    return EncounterApi.getEncounterSummaries("dnd5e");
  }


  /**
   * Get encounter state (encounter state + entity states bundled together)
   */
  static async getEncounterState(
    id: number
  ): Promise<{ encounterState: DnD5eEncounterState }> {
    return EncounterApi.getEncounterState("dnd5e", id);
  }

  /**
   * Save encounter state (encounter state + entity states bundled together)
   */
  static async saveEncounterState(
    id: number,
    encounterState: DnD5eEncounterState
  ): Promise<void> {
    return EncounterApi.saveEncounterState("dnd5e", id, encounterState);
  }

  /**
   * Create a new encounter
   */
  static async createEncounter(
    encounterData: CreatePayload<DnD5eEncounterDetails>
  ): Promise<number> {
    return EncounterApi.createEncounter("dnd5e", encounterData);
  }

  /**
   * Update an existing encounter
   */
  static async updateEncounter(
    id: number,
    updateData: UpdatePayload<DnD5eEncounterDetails>
  ): Promise<void> {
    return EncounterApi.updateEncounter("dnd5e", id, updateData);
  }

  /**
   * Delete an encounter by ID
   */
  static async deleteEncounter(id: number): Promise<boolean> {
    return EncounterApi.deleteEncounter("dnd5e", id);
  }

}

export default DnD5eEncounterApi;
