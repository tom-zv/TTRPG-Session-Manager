import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";
import type {
  SystemType,
  EncounterSummaryBySystem,
  EncounterDetailsbySystem,
} from "shared/domain/encounters/coreEncounter.js";
import { CreatePayload, UpdatePayload } from "../types.js";

interface EncounterDetailsResponse<T = EncounterDetailsbySystem<SystemType>> {
  encounterDetails: T;
}

interface EncounterSummariesResponse<T = EncounterSummaryBySystem<SystemType>> {
  encounters: T[];
}


export class EncounterApi {
  /**
   * Get encounter summaries (encounter details + entity summaries)
   */
  static async getEncounterSummaries<T extends SystemType>(
    system: T
  ): Promise<EncounterSummaryBySystem<T>[]> {
    const response = await fetch(`/api/${system}/encounters/summaries`, {
      method: "GET",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to fetch encounter summaries" }));
      throw new Error(error.message || "Failed to fetch encounter summaries");
    }

    const data: EncounterSummariesResponse = await response.json();
    return data.encounters as EncounterSummaryBySystem<T>[];
  }

  /**
   * Get encounter details (metadata only, no entities)
   */
  static async getEncounterDetails<T extends SystemType>(
    system: T,
    id: number
  ): Promise<EncounterDetailsbySystem<T>> {
    const response = await fetch(`/api/${system}/encounters/${id}/details`, {
      method: "GET",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to fetch encounter details" }));
      throw new Error(error.message || "Failed to fetch encounter details");
    }

    const data: EncounterDetailsResponse = await response.json();
    return data.encounterDetails as EncounterDetailsbySystem<T>;
  }


  /**
   * Create a new encounter
   */
  static async createEncounter<T extends SystemType>(
    system: T,
    encounterData: CreatePayload<EncounterDetailsbySystem<T>>
  ): Promise<number> {
    const response = await fetch(`/api/${system}/encounters`, {
      method: "POST",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ data: encounterData }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to create encounter" }));
      throw new Error(error.message || "Failed to create encounter");
    }

    const data: { insertId: number } = await response.json();
    return data.insertId;
  }

  /**
   * Update an existing encounter
   */
  static async updateEncounter<T extends SystemType>(
    system: T,
    id: number,
    updateData: UpdatePayload<EncounterDetailsbySystem<T>>
  ): Promise<void> {
    const response = await fetch(`/api/${system}/encounters/${id}`, {
      method: "PUT",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ data: updateData }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to update encounter" }));
      throw new Error(error.message || "Failed to update encounter");
    }
  }

  /**
   * Delete an encounter by ID
   */
  static async deleteEncounter<T extends SystemType>(
    system: T,
    id: number
  ): Promise<boolean> {
    const response = await fetch(`/api/${system}/encounters/${id}`, {
      method: "DELETE",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Failed to delete encounter" }));
      throw new Error(error.message || "Failed to delete encounter");
    }

    const data: { success: boolean } = await response.json();
    return data.success;
  }
  
}

export default EncounterApi;
