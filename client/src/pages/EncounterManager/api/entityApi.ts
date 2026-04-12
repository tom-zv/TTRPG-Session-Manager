import type { 
  EntityDetailsBySystem,
  EntitySummaryBySystem,
  CoreEntity
} from "shared/domain/encounters/coreEntity.js";
import type { SystemType } from "shared/domain/encounters/coreEncounter.js";

interface EntityDetailsResponse<T = EntityDetailsBySystem<SystemType>> {
  entity: T;
}

interface EntityDetailsArrayResponse<T = EntityDetailsBySystem<SystemType>> {
  entities: T[];
}

interface EntitySummariesResponse<T = EntitySummaryBySystem<SystemType>> {
  entities: T[];
}

interface InsertEntityResponse {
  insertId: number;
  entity: EntityDetailsBySystem<SystemType>;
}

// Request types for entity operations
export type CreateEntityRequest<T extends CoreEntity = CoreEntity> = Omit<T, 'templateId' | 'createdAt'>;
export type UpdateEntityRequest<T extends CoreEntity = CoreEntity> = Partial<Omit<T, 'templateId' | 'createdAt'>>;



export class EntityApi {
  /**
   * Get all entity details for a specific system
   */
  static async getAllEntities<T extends SystemType>(
    system: T
  ): Promise<EntityDetailsBySystem<T>[]> {
    const response = await fetch(`/api/${system}/entities`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch entities' }));
      throw new Error(error.message || 'Failed to fetch entities');
    }

    const data: EntityDetailsArrayResponse = await response.json();
    return data.entities as EntityDetailsBySystem<T>[];
  }

  /**
   * Get entity summaries for a specific system (lightweight data for lists)
   */
  static async getEntitySummaries<T extends SystemType>(
    system: T
  ): Promise<EntitySummaryBySystem<T>[]> {
    const response = await fetch(`/api/${system}/entities/summary`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch entity summaries' }));
      throw new Error(error.message || 'Failed to fetch entity summaries');
    }

    const data: EntitySummariesResponse = await response.json();
    return data.entities as EntitySummaryBySystem<T>[];
  }

  /**
   * Get a specific entity by ID
   */
  static async getEntityById<T extends SystemType>(
    system: T,
    id: number
  ): Promise<EntityDetailsBySystem<T>> {
    const response = await fetch(`/api/${system}/entities/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch entity' }));
      throw new Error(error.message || 'Failed to fetch entity');
    }

    const data: EntityDetailsResponse = await response.json();
    return data.entity as EntityDetailsBySystem<T>;
  }

  /**
   * Batch fetch entities by IDs (single HTTP request)
   */
  static async getEntityTemplatesByIds<T extends SystemType>(
    system: T,
    entityIds: number[]
  ): Promise<EntityDetailsBySystem<T>[]> {
    if (!entityIds || entityIds.length === 0) {
      return [];
    }

    const response = await fetch(`/api/${system}/entities/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ entityIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to batch fetch entities' }));
      throw new Error(error.message || 'Failed to batch fetch entities');
    }

    const data: EntityDetailsArrayResponse = await response.json();
    return data.entities as EntityDetailsBySystem<T>[];
  }

  /**
   * Create a new entity
   */
  static async createEntity<T extends SystemType>(
    system: T,
    entityData: CreateEntityRequest<EntityDetailsBySystem<T>>
  ): Promise<{ insertId: number; entity: EntityDetailsBySystem<T> }> {
    const response = await fetch(`/api/${system}/entities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ data: entityData }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to create entity' }));
      throw new Error(error.message || 'Failed to create entity');
    }

    const data: InsertEntityResponse = await response.json();
    return {
      insertId: data.insertId,
      entity: data.entity as EntityDetailsBySystem<T>
    };
  }

  /**
   * Update an existing entity
   * @returns The updated entity
   */
  static async updateEntity<T extends SystemType>(
    system: T,
    id: number,
    updateData: UpdateEntityRequest<EntityDetailsBySystem<T>>
  ): Promise<EntityDetailsBySystem<T>> {
    const response = await fetch(`/api/${system}/entities/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ data: updateData }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to update entity' }));
      throw new Error(error.message || 'Failed to update entity');
    }

    const data: EntityDetailsResponse = await response.json();
    return data.entity as EntityDetailsBySystem<T>;
  }

  /**
   * Delete an entity by ID
   */
  static async deleteEntity<T extends SystemType>(
    system: T,
    id: number
  ): Promise<boolean> {
    const response = await fetch(`/api/${system}/entities/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete entity' }));
      throw new Error(error.message || 'Failed to delete entity');
    }

    const data: {success: boolean} = await response.json();
    return data.success;
  }
}

export default EntityApi;
