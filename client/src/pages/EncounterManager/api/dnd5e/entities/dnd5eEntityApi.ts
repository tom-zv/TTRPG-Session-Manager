import EntityApi, { CreateEntityRequest, UpdateEntityRequest } from "../../entityApi.js";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import type { EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";
import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";

/**
 * API wrapper for DnD5e specific entity operations
 * Provides type-safe access to entity details and summaries
 */
export class DnD5eEntityApi {
  /** Assign the users who may run this entity. An empty list leaves it to the GM. */
  static async setControllers(id: number, userIds: number[]): Promise<number[]> {
    const response = await fetch(`/api/dnd5e/entities/${id}/controllers`, {
      method: "PUT",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ userIds }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to assign the player");
    return data.controllerUserIds;
  }

  static async patchSettings(id: number, patch: EntitySettings): Promise<EntitySettings> {
    const response = await fetch(`/api/dnd5e/entities/${id}/settings`, {
      method: "PATCH",
      headers: authenticatedJsonHeaders(),
      credentials: "include",
      body: JSON.stringify(patch),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to update entity settings");
    return data.settings;
  }
  /**
   * Get entity summaries for DnD5e (lightweight for lists)
   */
  static async getEntitySummaries(signal?: AbortSignal): Promise<DnD5eEntitySummary[]> {
    return EntityApi.getEntitySummaries('dnd5e', signal);
  }

  /**
   * Get a specific entity's details by ID
   */
  static async getEntityById(id: number, signal?: AbortSignal): Promise<DnD5eEntityDetails> {
    return EntityApi.getEntityById('dnd5e', id, signal);
  }

  /**
   * Batch fetch multiple entities by IDs in a single request
   * More efficient than calling getEntityById multiple times
   */
  static async getEntityTemplatesByIds(ids: number[], signal?: AbortSignal): Promise<DnD5eEntityDetails[]> {
    return EntityApi.getEntityTemplatesByIds('dnd5e', ids, signal);
  }

  /**
   * Create a new entity
   * @returns Object containing insertId and the created entity
   */
  static async createEntity(
    entityData: CreateEntityRequest<DnD5eEntityDetails>
  ): Promise<{ insertId: number; entity: DnD5eEntityDetails }> {
    return EntityApi.createEntity('dnd5e', entityData);
  }

  /**
   * Update an existing entity
   * @returns The updated entity
   */
  static async updateEntity(
    id: number, 
    updateData: UpdateEntityRequest<DnD5eEntityDetails>
  ): Promise<DnD5eEntityDetails> {
    return EntityApi.updateEntity('dnd5e', id, updateData);
  }

  /**
   * Delete an entity by ID
   */
  static async deleteEntity(id: number): Promise<boolean> {
    return EntityApi.deleteEntity('dnd5e', id);
  }
}

export default DnD5eEntityApi;
