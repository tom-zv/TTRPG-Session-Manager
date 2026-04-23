import { corePool } from "src/db.js";
import { DnD5eEntitySummaryDB } from "./dnd5e/types.js";
import { DnD5eEntityDB } from "./dnd5e/types.js";
import { CoreEntityDB } from "./types.js";
import { ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import dnd5eModel from "./dnd5e/dnd5eEntityModel.js";
import { ValidationError } from "src/api/HttpErrors.js";
import type { SystemType } from "shared/domain/encounters/coreEncounter.js";

// Map systems to their entity types
export type EntityDB<T extends SystemType> = 
  T extends "dnd5e" ? DnD5eEntityDB
  : never;

// Map systems to their entity summary types
export type EntitySummaryDB<T extends SystemType> = 
  T extends "dnd5e" ? DnD5eEntitySummaryDB
  : never;

// Type for core.entities table columns only
interface CoreEntityTableData {
  name: string;
  image_url?: string;
}

/**
 * Extract only the fields that belong to the core.entities table
 */
function extractCoreEntityFields(data: Partial<CoreEntityDB>): Partial<CoreEntityTableData> {
  const coreFields: Partial<CoreEntityTableData> = {};
  
  if (data.name !== undefined) {
    coreFields.name = data.name;
  }
  
  if (data.image_url !== undefined) {
    coreFields.image_url = data.image_url;
  }
  
  return coreFields;
}

export async function insertCoreEntity(
  connection: PoolConnection,
  data: Partial<CoreEntityDB>
): Promise<number> {
  const coreData = extractCoreEntityFields(data);

  const [coreResult] = await connection.execute<ResultSetHeader>(
    "INSERT INTO core.entities (name, image_url) VALUES (?, ?)",
    [coreData.name, coreData.image_url || null]
  );

  return coreResult.insertId;
}

export async function updateCoreEntity(
  connection: PoolConnection,
  id: number,
  data: Partial<CoreEntityDB>
): Promise<void> {
  const coreData = extractCoreEntityFields(data);
  const coreFields: string[] = [];
  const coreValues: unknown[] = [];

  if (coreData.name !== undefined) {
    coreFields.push("name = ?");
    coreValues.push(coreData.name);
  }

  if (coreData.image_url !== undefined) {
    coreFields.push("image_url = ?");
    coreValues.push(coreData.image_url);
  }

  if (coreFields.length === 0) return;

  await connection.execute(
    `UPDATE core.entities SET ${coreFields.join(", ")} WHERE id = ?`,
    [...coreValues, id]
  );
}

export async function getEntityById<T extends SystemType>(
  system: T,
  id: number
): Promise<EntityDB<T>> {

  switch (system) {
    case "dnd5e":
      return (await dnd5eModel.getEntityById(id)) as EntityDB<T>;
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

export async function getEntitiesByIds<T extends SystemType>(
  system: T,
  ids: number[]
): Promise<EntityDB<T>[]> {

  switch (system) {
    case "dnd5e":
      return (await dnd5eModel.getEntitiesByIds(ids)) as EntityDB<T>[];
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

async function getAllEntities<T extends SystemType>(
  system: T
): Promise<EntityDB<T>[]> {

  const connection = await corePool.getConnection();

  try {
    switch (system) {
      case "dnd5e":
        return (await dnd5eModel.getAllEntities(connection)) as EntityDB<T>[];

      default:
        throw new ValidationError(`Unsupported system: ${String(system)}`);
    }
  } finally {
    connection.release();
  }
}

async function getEntitySummaries<T extends SystemType>(
  system: T
): Promise<EntitySummaryDB<T>[]> {

  switch (system) {
    case "dnd5e":
      return (await dnd5eModel.getEntitySummaries()) as EntitySummaryDB<T>[];
  }

}

async function insertEntity<T extends SystemType>(
  system: T,
  data: Omit<EntityDB<T>, "id" | "createdAt">
): Promise<number | null> {
  // Extract only core entity fields for core.entities table
  const coreData = extractCoreEntityFields(data);

  const connection = await corePool.getConnection();
  await connection.beginTransaction();

  try{
    const entityId = await insertCoreEntity(connection, coreData);

    switch (system) {
      case "dnd5e":
        await dnd5eModel.insertEntity(
          connection,
          entityId,
          data as Omit<DnD5eEntityDB, "id" | "createdAt">
        );
        break;
      default:
        throw new ValidationError(`Unsupported system: ${String(system)}`);
    }

    await connection.commit();
    return entityId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateEntity<T extends SystemType>(
  system: T,
  id: number,
  data: Partial<Omit<EntityDB<T>, "id" | "createdAt">>
): Promise<boolean> {
  // Check if entity exists
  const entity = await getEntityById(system, id);

  if (!entity) {
    throw new Error(`Entity with id ${id} not found`);
  }

  // Start transaction
  const connection = await corePool.getConnection();
  await connection.beginTransaction();

  try {
    await updateCoreEntity(connection, id, data);

    // Handle system-specific updates
    switch (system) {
      case "dnd5e":
        await dnd5eModel.updateEntity(
          connection,
          id,
          data as Omit<DnD5eEntityDB, "id" | "createdAt">
        );
        break;
      default:
        throw new ValidationError(`Unsupported system: ${String(system)}`);
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteEntity(id: number): Promise<boolean> {
  const [result] = await corePool.execute<ResultSetHeader>(
    "DELETE FROM entities WHERE id = ?",
    [id]
  );

  return result.affectedRows > 0;
}

export default {
  getEntityById,
  getEntitiesByIds,
  getAllEntities,
  getEntitySummaries,
  insertCoreEntity,
  updateCoreEntity,
  insertEntity,
  updateEntity,
  deleteEntity
};
