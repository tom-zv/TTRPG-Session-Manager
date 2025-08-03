import EntityApi, { CreateEntityRequest, UpdateEntityRequest } from "../../entityApi.js";
import type { DnD5eEntity, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";

/**
 * API wrapper for DnD5e specific entity operations
 */
export class DnD5eEntityApi {
  static async getAllEntities(): Promise<DnD5eEntity[]> {
    return EntityApi.getAllEntities('dnd5e');
  }

  static async getEntitySummaries(): Promise<DnD5eEntitySummary[]> {
    return EntityApi.getEntitySummaries('dnd5e');
  }

  static async getEntityById(id: number): Promise<DnD5eEntity> {
    return EntityApi.getEntityById('dnd5e', id);
  }

  static async createEntity(entityData: CreateEntityRequest<DnD5eEntity>): Promise<number> {
    return EntityApi.createEntity('dnd5e', entityData);
  }

  static async updateEntity(id: number, updateData: UpdateEntityRequest<DnD5eEntity>): Promise<DnD5eEntity> {
    return EntityApi.updateEntity('dnd5e', id, updateData);
  }

  static async deleteEntity(id: number): Promise<boolean> {
    return EntityApi.deleteEntity('dnd5e', id);
  }
}

export default DnD5eEntityApi;