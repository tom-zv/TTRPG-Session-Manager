import EntityApi, { CreateEntityRequest, UpdateEntityRequest } from "../../entityApi.js";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";

/**
 * API wrapper for DnD5e specific entity operations
 * Provides type-safe access to entity details and summaries
 */
export class DnD5eEntityApi {
  /**
   * Get entity summaries for DnD5e (lightweight for lists)
   */
  static async getEntitySummaries(): Promise<DnD5eEntitySummary[]> {
    return EntityApi.getEntitySummaries('dnd5e');
  }

  /**
   * Get a specific entity's details by ID
   */
  static async getEntityById(id: number): Promise<DnD5eEntityDetails> {
    return EntityApi.getEntityById('dnd5e', id);
  }

  /**
   * Batch fetch multiple entities by IDs in a single request
   * More efficient than calling getEntityById multiple times
   */
  static async getEntityTemplatesByIds(ids: number[]): Promise<DnD5eEntityDetails[]> {
    return EntityApi.getEntityTemplatesByIds('dnd5e', ids);
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