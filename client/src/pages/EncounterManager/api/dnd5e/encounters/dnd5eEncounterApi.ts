import { CreatePayload, UpdatePayload } from "src/pages/EncounterManager/types.js";
import EncounterApi from "../../encounterApi.js";
import type { 
  DnD5eEncounterSummary, 
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
  static async getEncounterSummaries(campaignId: number, signal?: AbortSignal): Promise<DnD5eEncounterSummary[]> {
    return EncounterApi.getEncounterSummaries("dnd5e", campaignId, signal);
  }

  /** One encounter, read within the campaign it is opened from. */
  static async getEncounterDetails(campaignId: number, id: number, signal?: AbortSignal): Promise<DnD5eEncounterDetails> {
    return EncounterApi.getEncounterDetails("dnd5e", campaignId, id, signal);
  }


  /**
   * Create a new encounter
   */
  static async createEncounter(
    campaignId: number,
    encounterData: CreatePayload<DnD5eEncounterDetails>
  ): Promise<number> {
    return EncounterApi.createEncounter("dnd5e", campaignId, encounterData);
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
