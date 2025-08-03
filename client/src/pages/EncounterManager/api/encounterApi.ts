import type { CoreEncounter } from "shared/domain/encounters/coreEncounter.js";
import type { Dnd5eEncounter } from "shared/domain/encounters/dnd5e/encounter.js";

// Response types that match the backend API structure
interface EncounterResponse<T = CoreEncounter> {
  encounter: T;
}

interface EncountersResponse<T = CoreEncounter> {
  encounters: T[];
}

interface CreateEncounterResponse {
  insertId: number;
}

interface DeleteEncounterResponse {
  success: boolean;
}

// Request types for encounter operations
export type CreateEncounterRequest<T extends CoreEncounter = CoreEncounter> = Omit<T, 'id' | 'createdAt'>;
export type UpdateEncounterRequest<T extends CoreEncounter = CoreEncounter> = Partial<Omit<T, 'id' | 'createdAt'>>;

export type SystemType = 'dnd5e';

// Helper types to extract encounter types based on system
type EncounterBySystem<T extends SystemType> = T extends 'dnd5e' ? Dnd5eEncounter : CoreEncounter;

export class EncounterApi {
  /**
   * Get all encounters for a specific system
   */
  static async getAllEncounters<T extends SystemType>(
    system: T
  ): Promise<EncounterBySystem<T>[]> {
    const response = await fetch(`/api/${system}/encounters`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch encounters' }));
      throw new Error(error.message || 'Failed to fetch encounters');
    }

    const data: EncountersResponse = await response.json();
    return data.encounters as EncounterBySystem<T>[];
  }

  /**
   * Get a specific encounter by ID
   */
  static async getEncounterById<T extends SystemType>(
    system: T,
    id: number
  ): Promise<EncounterBySystem<T>> {
    const response = await fetch(`/api/${system}/encounters/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch encounter' }));
      throw new Error(error.message || 'Failed to fetch encounter');
    }

    const data: EncounterResponse = await response.json();
    return data.encounter as EncounterBySystem<T>;
  }

  /**
   * Create a new encounter
   */
  static async createEncounter<T extends SystemType>(
    system: T,
    encounterData: CreateEncounterRequest<EncounterBySystem<T>>
  ): Promise<number> {
    const response = await fetch(`/api/${system}/encounters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ data: encounterData }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create encounter' }));
      throw new Error(error.message || 'Failed to create encounter');
    }

    const data: CreateEncounterResponse = await response.json();
    return data.insertId;
  }

  /**
   * Update an existing encounter
   */
  static async updateEncounter<T extends SystemType>(
    system: T,
    id: number,
    updateData: UpdateEncounterRequest<EncounterBySystem<T>>
  ): Promise<EncounterBySystem<T>> {
    const response = await fetch(`/api/${system}/encounters/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ data: updateData }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update encounter' }));
      throw new Error(error.message || 'Failed to update encounter');
    }

    const data: EncounterResponse = await response.json();
    return data.encounter as EncounterBySystem<T>;
  }

  /**
   * Delete an encounter by ID
   */
  static async deleteEncounter<T extends SystemType>(
    system: T,
    id: number
  ): Promise<boolean> {
    const response = await fetch(`/api/${system}/encounters/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete encounter' }));
      throw new Error(error.message || 'Failed to delete encounter');
    }

    const data: DeleteEncounterResponse = await response.json();
    return data.success;
  }

  /**
   * Assign entities to an encounter
   */
  static async assignEntitiesToEncounter<T extends SystemType>(
    system: T,
    encounterId: number,
    entityIds: number[]
  ): Promise<void> {
    const response = await fetch(`/api/${system}/encounters/assign-entities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ encounterId, entityIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to assign entities to encounter' }));
      throw new Error(error.message || 'Failed to assign entities to encounter');
    }
  }
}

export default EncounterApi;