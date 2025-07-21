import { SystemType, getEntityById as getEntityByIdFromModel, EntityDB, EntitySummaryDB } from "./entityModel.js";
import entityModel from "./entityModel.js";

async function getEntityById<T extends SystemType>(system: T, id: number): Promise<EntityDB<T>> {
  const entity = await getEntityByIdFromModel(system, id);
  
  if (!entity) {
    throw new Error(`Entity with ID ${id} not found`);
  }
  
  return entity;
}

async function getAllEntities<T extends SystemType>(system: T): Promise<EntityDB<T>[]> {
  const entities = await entityModel.getAllEntities(system);
  
  if (!entities) {
    throw new Error(`Failed to retrieve entities for system ${system}`);
  }
  
  return entities;
}

async function getEntitySummaries<T extends SystemType>(system: T): Promise<EntitySummaryDB<T>[]> {
  const entities = await entityModel.getEntitySummaries(system);
  
  if (!entities) {
    throw new Error(`Failed to retrieve entity summaries for system ${system}`);
  }
  
  return entities;
}

async function insertEntity<T extends SystemType>(
  system: T, 
  data: Omit<EntityDB<T>, "id" | "createdAt">
): Promise<number> {
  const insertId = await entityModel.insertEntity(system, data);

  if (!insertId) {
    throw new Error(`Failed to insert entity for system ${system}`);
  }

  return insertId;
}

async function updateEntity<T extends SystemType>(
  system: T,
  id: number,
  data: Partial<Omit<EntityDB<T>, "id" | "createdAt">>
): Promise<EntityDB<T>> {
  const result = await entityModel.updateEntity(system, id, data);
  
  if (!result) {
    throw new Error(`Failed to update entity with ID ${id} for system ${system}`);
  }

  const updatedEntity = await getEntityById(system, id);
  
  return updatedEntity;
}

async function deleteEntity(id: number): Promise<boolean> {
  const result = await entityModel.deleteEntity(id);
  
  if (!result) {
    throw new Error(`Failed to delete entity with ID ${id}`);
  }
  
  return result;
}

export default {
  getEntityById,
  getAllEntities,
  getEntitySummaries,
  insertEntity,
  updateEntity,
  deleteEntity
}