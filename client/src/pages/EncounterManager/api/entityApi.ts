import type { Entity, CoreEntity } from "shared/domain/encounters/coreEntity.js";
import type { DnD5eEntity, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";

// Response types that match the backend API structure
interface EntityResponse<T = Entity> {
  entity: T;
}

interface EntitiesResponse<T = Entity> {
  entities: T[];
}

interface CreateEntityResponse {
  insertId: number;
}

interface DeleteEntityResponse {
  success: boolean;
}

// Request types for entity operations
export type CreateEntityRequest<T extends CoreEntity = CoreEntity> = Omit<T, 'id' | 'createdAt'>;
export type UpdateEntityRequest<T extends CoreEntity = CoreEntity> = Partial<Omit<T, 'id' | 'createdAt'>>;

export type SystemType = 'dnd5e';

// Helper types to extract entity types based on system
type EntityBySystem<T extends SystemType> = T extends 'dnd5e' ? DnD5eEntity : CoreEntity;
type EntitySummaryBySystem<T extends SystemType> = T extends 'dnd5e' ? DnD5eEntitySummary : CoreEntity;

export class EntityApi {
  /**
   * Get all entities for a specific system
   */
  static async getAllEntities<T extends SystemType>(
    system: T
  ): Promise<EntityBySystem<T>[]> {
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

    const data: EntitiesResponse = await response.json();
    return data.entities as EntityBySystem<T>[];
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

    const data: EntitiesResponse = await response.json();
    return data.entities as EntitySummaryBySystem<T>[];
  }

  /**
   * Get a specific entity by ID
   */
  static async getEntityById<T extends SystemType>(
    system: T,
    id: number
  ): Promise<EntityBySystem<T>> {
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

    const data: EntityResponse = await response.json();
    return data.entity as EntityBySystem<T>;
  }

  /**
   * Create a new entity
   */
  static async createEntity<T extends SystemType>(
    system: T,
    entityData: CreateEntityRequest<EntityBySystem<T>>
  ): Promise<number> {
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

    const data: CreateEntityResponse = await response.json();
    return data.insertId;
  }

  /**
   * Update an existing entity
   */
  static async updateEntity<T extends SystemType>(
    system: T,
    id: number,
    updateData: UpdateEntityRequest<EntityBySystem<T>>
  ): Promise<EntityBySystem<T>> {
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

    const data: EntityResponse = await response.json();
    return data.entity as EntityBySystem<T>;
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

    const data: DeleteEntityResponse = await response.json();
    return data.success;
  }
}

export default EntityApi;
