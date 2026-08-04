import type { SystemType } from "shared/domain/encounters/coreEncounter.js";
import {
  getEntityById as getEntityByIdFromModel,
  EntityDB,
  EntitySummaryDB,
} from "./entityModel.js";
import entityModel from "./entityModel.js";
import encounterModel from "../encounters/encounterModel.js";
import { HttpError, NotFoundError, ValidationError } from "src/api/HttpErrors.js";
import userModel from "src/api/users/userModel.js";

async function getEntityById<T extends SystemType>(system: T, id: number): Promise<EntityDB<T>> {
  const entity = await getEntityByIdFromModel(system, id);
  
  if (!entity) {
    throw new Error(`Entity with ID ${id} not found`);
  }
  
  return entity;
}

async function getEntitiesByIds<T extends SystemType>(
  system: T, 
  ids: number[]
): Promise<EntityDB<T>[]> {
  if (!ids || ids.length === 0) {
    return [];
  }
  
  const entities = await entityModel.getEntitiesByIds(system, ids);
  
  if (!entities) {
    throw new Error(`Failed to retrieve entities for system ${system}`);
  }
  
  return entities;
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

/** The player characters assigned to a user, for their Compendium. */
async function getAssignedPcSummaries<T extends SystemType>(system: T, userId: number): Promise<EntitySummaryDB<T>[]> {
  return entityModel.getAssignedPcSummaries(system, userId);
}

/**
 * One player character assigned to the user. A missing, unassigned or non-PC entity is the same 404,
 * so a player cannot tell which IDs exist.
 */
async function getAssignedPc<T extends SystemType>(system: T, userId: number, entityId: number): Promise<EntityDB<T>> {
  const entity = await entityModel.getAssignedPcById(system, userId, entityId);
  if (!entity) throw new NotFoundError("Character not found");
  return entity;
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

/** Assign the users who may run this entity in an encounter. An empty list leaves it to the GM. */
async function setEntityControllers(entityId: number, userIds: number[]): Promise<number[]> {
  const uniqueIds = [...new Set(userIds)];
  const users = await Promise.all(uniqueIds.map((userId) => userModel.getUserById(userId)));
  const missing = uniqueIds.filter((_, index) => !users[index]);
  if (missing.length > 0) {
    throw new ValidationError(`Unknown user ID${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
  }

  const found = await entityModel.setEntityControllers(entityId, uniqueIds);
  if (!found) {
    throw new NotFoundError(`Entity with ID ${entityId} not found`);
  }

  return uniqueIds;
}

async function deleteEntity(id: number): Promise<boolean> {
  // Encounters refer to entities by ID, so one that is still in use must stay. The foreign key on
  // core.encounter_entities enforces this; checking first gives the user a usable message.
  const encounterIds = await encounterModel.getEncounterIdsUsingEntity(id);
  if (encounterIds.length > 0) {
    throw new HttpError(
      409,
      `This entity is used in ${encounterIds.length} encounter${encounterIds.length === 1 ? "" : "s"}. Remove it from them first.`
    );
  }

  const result = await entityModel.deleteEntity(id);
  
  if (!result) {
    throw new Error(`Failed to delete entity with ID ${id}`);
  }
  
  return result;
}

export default {
  getEntityById,
  getEntitiesByIds,
  getAllEntities,
  getEntitySummaries,
  getAssignedPcSummaries,
  getAssignedPc,
  insertEntity,
  updateEntity,
  setEntityControllers,
  deleteEntity
}