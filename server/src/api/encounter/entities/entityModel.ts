import { corePool } from "src/db.js";
import type { DnD5eEntityDB, DnD5eEntitySummaryDB, DnD5eEntityUpdateDB, DnD5eEntityWriteDB } from "./dnd5e/types.js";
import { ExecuteValues, ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import dnd5eModel from "./dnd5e/dnd5eEntityModel.js";
import { ValidationError } from "src/api/HttpErrors.js";
import type { SystemType } from "shared/domain/encounters/coreEncounter.js";
import type { DnD5eInventory, DnD5eInventoryAppend, DnD5eInventoryItem } from "shared/domain/encounters/dnd5e/inventory.js";
import dnd5eInventoryModel from "./dnd5e/dnd5eInventoryModel.js";

// Map systems to their entity types
export type EntityDB<T extends SystemType> = 
  T extends "dnd5e" ? DnD5eEntityDB
  : never;

// Map systems to their entity summary types
export type EntitySummaryDB<T extends SystemType> = 
  T extends "dnd5e" ? DnD5eEntitySummaryDB
  : never;

// Map systems to their inventory types: a stored row, a read (rows as the viewer may see them,
// plus the revision) and the body that appends one catalog item
export type EntityInventoryItem<T extends SystemType> =
  T extends "dnd5e" ? DnD5eInventoryItem
  : never;
export type EntityInventory<T extends SystemType> =
  T extends "dnd5e" ? DnD5eInventory
  : never;
export type EntityInventoryAppend<T extends SystemType> =
  T extends "dnd5e" ? DnD5eInventoryAppend
  : never;

/** Who reads an inventory: GMs see hidden catalog items; a player reads only assigned characters. */
export type InventoryViewer = { isGm: boolean; assignedUserId: number | null };

export type InventoryReplaceResult<T extends SystemType> =
  | { status: "saved"; inventory: EntityInventory<T> }
  /** The expected revision was stale; nothing was written. */
  | { status: "conflict"; inventory: EntityInventory<T> }
  /** A row links an unavailable or non-concrete catalog item. `row` is 1-based. */
  | { status: "invalidLink"; row: number; reason: "unavailable" | "notConcrete" };

export type InventoryAppendResult<T extends SystemType> =
  | { status: "saved"; inventory: EntityInventory<T> }
  | { status: "itemUnavailable" }
  | { status: "full" };

// Type for core.entities table columns only
interface CoreEntityTableData {
  name: string;
  image_url?: string | null;
}

/**
 * Extract only the fields that belong to the core.entities table
 */
function extractCoreEntityFields(data: Partial<CoreEntityTableData>): Partial<CoreEntityTableData> {
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
  data: Partial<CoreEntityTableData>
): Promise<number> {
  const coreData = extractCoreEntityFields(data);

  const [coreResult] = await connection.execute<ResultSetHeader>(
    "INSERT INTO core.entities (name, image_url) VALUES (?, ?)",
    [coreData.name || null, coreData.image_url || null]
  );

  return coreResult.insertId;
}

export async function updateCoreEntity(
  connection: PoolConnection,
  id: number,
  data: Partial<CoreEntityTableData>
): Promise<void> {
  const coreData = extractCoreEntityFields(data);
  const coreFields: string[] = [];
  const coreValues: ExecuteValues[] = [];

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

async function getAssignedPcSummaries<T extends SystemType>(
  system: T,
  userId: number
): Promise<EntitySummaryDB<T>[]> {
  switch (system) {
    case "dnd5e":
      return (await dnd5eModel.getAssignedPcSummaries(userId)) as EntitySummaryDB<T>[];
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

async function getAssignedPcById<T extends SystemType>(
  system: T,
  userId: number,
  entityId: number
): Promise<EntityDB<T> | null> {
  switch (system) {
    case "dnd5e":
      return (await dnd5eModel.getAssignedPcById(userId, entityId)) as EntityDB<T> | null;
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

async function getInventory<T extends SystemType>(
  system: T,
  entityId: number,
  viewer: InventoryViewer
): Promise<EntityInventory<T> | null> {
  switch (system) {
    case "dnd5e":
      return (await dnd5eInventoryModel.getInventory(entityId, viewer)) as EntityInventory<T> | null;
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

async function replaceInventory<T extends SystemType>(
  system: T,
  entityId: number,
  items: EntityInventoryItem<T>[],
  expectedRevision: number | undefined
): Promise<InventoryReplaceResult<T> | null> {
  switch (system) {
    case "dnd5e":
      return (await dnd5eInventoryModel.replaceInventory(entityId, items, expectedRevision)) as InventoryReplaceResult<T> | null;
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

async function appendInventoryItem<T extends SystemType>(
  system: T,
  entityId: number,
  append: EntityInventoryAppend<T>
): Promise<InventoryAppendResult<T> | null> {
  switch (system) {
    case "dnd5e":
      return (await dnd5eInventoryModel.appendInventoryItem(entityId, append)) as InventoryAppendResult<T> | null;
    default:
      throw new ValidationError(`Unsupported system: ${String(system)}`);
  }
}

async function insertEntity<T extends SystemType>(
  system: T,
  data: DnD5eEntityWriteDB
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
          data
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
  data: DnD5eEntityUpdateDB
): Promise<void> {
  await getEntityById(system, id);

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
          data
        );
        break;
      default:
        throw new ValidationError(`Unsupported system: ${String(system)}`);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Replace the users who control an entity. Returns false when the entity does not exist. */
export async function setEntityControllers(entityId: number, userIds: number[]): Promise<boolean> {
  const connection = await corePool.getConnection();
  try {
    await connection.beginTransaction();
    const [entities] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM core.entities WHERE id = ? FOR UPDATE", [entityId]
    );
    if (!entities[0]) {
      await connection.rollback();
      return false;
    }
    await connection.execute("DELETE FROM core.user_entities WHERE entity_id = ?", [entityId]);
    for (const userId of userIds) {
      await connection.execute(
        "INSERT INTO core.user_entities (user_id, entity_id) VALUES (?, ?)", [userId, entityId]
      );
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
  getAssignedPcSummaries,
  getAssignedPcById,
  getInventory,
  replaceInventory,
  appendInventoryItem,
  insertCoreEntity,
  updateCoreEntity,
  insertEntity,
  updateEntity,
  setEntityControllers,
  deleteEntity
};
