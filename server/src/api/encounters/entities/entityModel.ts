import { corePool } from "src/db.js";
import { DnD5eEntityDB, DnD5eEntitySummaryDB } from "./types.js";
import { ResultSetHeader } from "mysql2";
import dnd5eModel from "./dnd5e/dnd5eEntityModel.js";
import { ValidationError } from "src/api/HttpErrors.js";
// supported systems
export type SystemType = 'dnd5e';

// Map systems to their entity types
export type EntityDB<T extends SystemType> = 
  T extends "dnd5e" ? DnD5eEntityDB
  : never;

// Map systems to their entity summary types
export type EntitySummaryDB<T extends SystemType> = 
  T extends "dnd5e" ? DnD5eEntitySummaryDB
  : never;


export async function getEntityById<T extends SystemType>(
  system: T,
  id: number
): Promise<EntityDB<T>> {

  if (system === "dnd5e") {
    return (await dnd5eModel.getEntityById(id)) as EntityDB<T>;
  } else throw new ValidationError(`Unsupported system: ${system}`);
}

async function getAllEntities<T extends SystemType>(
  system: T
): Promise<EntityDB<T>[]> {
  const connection = await corePool.getConnection();

  if (system === "dnd5e") {
    return (await dnd5eModel.getAllEntities(connection)) as EntityDB<T>[];
  } else throw new ValidationError(`Unsupported system: ${system}`);
}

async function getEntitySummaries<T extends SystemType>(
  system: T
): Promise<EntitySummaryDB<T>[]> {
  if (system === "dnd5e") {
    return (await dnd5eModel.getEntitySummaries()) as EntitySummaryDB<T>[];
  } else throw new ValidationError(`Unsupported system: ${system}`);
}

async function insertEntity<T extends SystemType>(
  system: T,
  data: Omit<EntityDB<T>, "id" | "createdAt">
): Promise<number | null> {
  // Extract core entity fields
  const { name, image_url } = data;

  const connection = await corePool.getConnection();
  await connection.beginTransaction();

  try{
    // Insert into core entities table
    const [coreResult] = await connection.execute<ResultSetHeader>(
        "INSERT INTO core.entities (name, image_url) VALUES (?, ?)",
        [name, image_url || null]
    );

    const entityId = coreResult.insertId;

    if (system === "dnd5e") {
        await dnd5eModel.insertEntity(connection, entityId, data as Omit<DnD5eEntityDB, "id" | "createdAt">);
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
    // Handle core fields

    const coreFields: string[] = [];
    const coreValues: unknown[] = [];

    if (data.name !== undefined) {
      coreFields.push("name = ?");
      coreValues.push(data.name);
    }

    if (data.image_url !== undefined) {
      coreFields.push("image_url = ?");
      coreValues.push(data.image_url);
    }

    const coreQuery = `
        UPDATE core.entities 
        SET ${coreFields.join(", ")}
        WHERE id = ?
      `;

    await connection.execute(coreQuery, [...coreValues, id]);

    // Handle system-specific updates
    if (system === "dnd5e") {
      await dnd5eModel.updateEntity(
        connection,
        id,
        data as Omit<DnD5eEntityDB, "id" | "createdAt">
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
  getAllEntities,
  getEntitySummaries,
  insertEntity,
  updateEntity,
  deleteEntity,
};
