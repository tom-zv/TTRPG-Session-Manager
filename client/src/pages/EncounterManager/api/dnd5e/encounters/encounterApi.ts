import { CreatePayload, UpdatePayload } from "src/pages/EncounterManager/types.js";
import EncounterApi from "../../encounterApi.js";
import type { Dnd5eEncounter } from "shared/domain/encounters/dnd5e/encounter.js";

/**
 * API wrapper for DnD5e specific encounter operations
 */
export class DnD5eEncounterApi {
  static async getAllEncounters(): Promise<Dnd5eEncounter[]> {
    return EncounterApi.getAllEncounters("dnd5e");
  }

  static async getEncounterById(id: number): Promise<Dnd5eEncounter> {
    return EncounterApi.getEncounterById("dnd5e", id);
  }

  static async createEncounter(
    encounterData: CreatePayload<Dnd5eEncounter>
  ): Promise<number> {
    return EncounterApi.createEncounter("dnd5e", encounterData);
  }

  static async updateEncounter(
    id: number,
    updateData: UpdatePayload<Dnd5eEncounter>
  ): Promise<Dnd5eEncounter> {
    return EncounterApi.updateEncounter("dnd5e", id, updateData);
  }

  static async deleteEncounter(id: number): Promise<boolean> {
    return EncounterApi.deleteEncounter("dnd5e", id);
  }

  static async assignEntitiesToEncounter(
    encounterId: number,
    entityIds: number[]
  ): Promise<void> {
    return EncounterApi.assignEntitiesToEncounter(
      "dnd5e",
      encounterId,
      entityIds
    );
  }
}

export default DnD5eEncounterApi;
