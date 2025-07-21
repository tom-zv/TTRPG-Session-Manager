import { dnd5ePool } from "src/db.js";
import { DnD5eEntityDB, DnD5eEntitySummaryDB } from "../types.js";
import { RowDataPacket, PoolConnection } from "mysql2/promise";

// System-specific handler for DnD5e
export async function insertEntity(
  connection: PoolConnection,
  entityId: number,
  data: Omit<DnD5eEntityDB, "id" | "createdAt">
): Promise<void> {
    
  const { fields, values } = prepareEntityFields(data, false);

  // Insert main entity record
  const query = `UPDATE dnd5e.entities SET ${fields.join(", ")} WHERE id = ?`;

  await connection.execute(query, [...values, entityId]);

  // Handle join tables if present in data
  await handleDamageTypes(connection, entityId, "entity_resistances", data.resistances, false);
  await handleDamageTypes(connection, entityId, "entity_vulnerabilities", data.vulnerabilities, false);
  await handleDamageTypes(connection, entityId, "entity_immunities", data.immunities, false);
}

export async function updateEntity(
  connection: PoolConnection,
  entityId: number,
  data: Omit<DnD5eEntityDB, "id" | "createdAt">
): Promise<void> {

  const { fields, values } = prepareEntityFields(data, false);

  // Insert main entity record
  const query = `
      INSERT INTO dnd5e.entities 
      (id, ${fields.join(", ")})
      VALUES (${Array(values.length + 1)
        .fill("?")
        .join(", ")})
    `;

  await connection.execute(query, [entityId, ...values]);

  // Handle join tables if present in data
  await handleDamageTypes(connection, entityId, "entity_resistances", data.resistances, false);
  await handleDamageTypes(connection, entityId, "entity_vulnerabilities", data.vulnerabilities, false);
  await handleDamageTypes(connection, entityId, "entity_immunities", data.immunities, false);
}

export async function getEntityById(
  entityId: number
): Promise<DnD5eEntityDB> {
  // Get the base entity data
  const [entityRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT 
      c.id, c.name, c.image_url, c.created_at,
      e.entity_type, e.challenge_rating, e.armor_class, e.initiative_modifier,
      e.speed, e.max_hp, e.current_hp, e.ability_scores, e.legendary_resistances
    FROM 
      core.entities c
    JOIN 
      dnd5e.entities e ON c.id = e.id
    WHERE 
      c.id = ?`,
    [entityId]
  );

  if (entityRows.length === 0) {
    throw new Error(`Entity with id ${entityId} not found`);
  }

  const entity = entityRows[0] as DnD5eEntityDB;

  // Get resistances
  const [resistanceRows] = await dnd5ePool.execute<string[] & RowDataPacket[]>(
    `SELECT damage_type
     FROM dnd5e.entity_resistances
     WHERE entity_id = ?`,
    [entityId]
  );
  entity.resistances = resistanceRows;

  // Get vulnerabilities
  const [vulnerabilityRows] = await dnd5ePool.execute<string[] & RowDataPacket[]>(
    `SELECT damage_type
     FROM dnd5e.entity_vulnerabilities
     WHERE entity_id = ?`,
    [entityId]
  );
  entity.vulnerabilities = vulnerabilityRows;

  // Get immunities
  const [immunityRows] = await dnd5ePool.execute<string[] & RowDataPacket[]>(
    `SELECT damage_type
     FROM dnd5e.entity_immunities
     WHERE entity_id = ?`,
    [entityId]
  );
  entity.immunities = immunityRows;

  return entity;
}

export async function getAllEntities(
  connection: PoolConnection
): Promise<DnD5eEntityDB[]> {
  // Get all base entity data
  const [entityRows] = await connection.execute<RowDataPacket[]>(
    `SELECT 
      c.id, c.name, c.image_url, c.created_at,
      e.entity_type, e.challenge_rating, e.armor_class, e.initiative_modifier,
      e.speed, e.max_hp, e.current_hp, e.ability_scores, e.legendary_resistances
    FROM 
      core.entities c
    JOIN 
      dnd5e.entities e ON c.id = e.id
    ORDER BY 
      c.name`
  );

  const entities = entityRows as DnD5eEntityDB[];

  // For each entity, fetch its join table data
  for (const entity of entities) {
    // Get resistances
    const [resistanceRows] = await connection.execute<string[] & RowDataPacket[]>(
      `SELECT damage_type
       FROM dnd5e.entity_resistances
       WHERE entity_id = ?`,
      [entity.id]
    );
    entity.resistances = resistanceRows;

    // Get vulnerabilities
    const [vulnerabilityRows] = await connection.execute<string[] & RowDataPacket[]>(
      `SELECT damage_type
       FROM dnd5e.entity_vulnerabilities
       WHERE entity_id = ?`,
      [entity.id]
    );
    entity.vulnerabilities = vulnerabilityRows;

    // Get immunities
    const [immunityRows] = await connection.execute<string[] & RowDataPacket[]>(
      `SELECT damage_type
       FROM dnd5e.entity_immunities
       WHERE entity_id = ?`,
      [entity.id]
    );
    entity.immunities = immunityRows;
  }

  return entities;
}

export async function getEntitySummaries(): Promise<DnD5eEntitySummaryDB[]> {
  // Get lightweight entity data for list display
  const [entityRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT 
      c.id, c.name,
      e.entity_type, e.cr,
    FROM 
      core.entities c
    JOIN 
      dnd5e.entities e ON c.id = e.id
    ORDER BY 
      c.name`
  );

  return entityRows as DnD5eEntitySummaryDB[];
}

function prepareEntityFields(
  data: Omit<DnD5eEntityDB, "id" | "createdAt">,
  isUpdate: boolean
): { fields: string[]; values: unknown[] } {
  const fields: string[] = [];
  const values: unknown[] = [];

  const directFields = Object.keys(data).filter(key => 
    key !== 'resistances' && 
    key !== 'vulnerabilities' && 
    key !== 'immunities'
  );

  for (const field of directFields) {
    if (data[field as keyof typeof data] !== undefined) {
      if (isUpdate) {
        fields.push(`${field} = ?`);
      } else {
        fields.push(field);
      }
      values.push(data[field as keyof typeof data]);
    }
  }
  return { fields, values };
}

async function handleDamageTypes(
  connection: PoolConnection,
  entityId: number,
  table: string,
  damageTypes: string[] | undefined,
  isUpdate: boolean
): Promise<void> {
  // For updates, clear existing relationships first
  if (isUpdate && damageTypes !== undefined) {
    await connection.execute(`DELETE FROM dnd5e.${table} WHERE entity_id = ?`, [
      entityId,
    ]);
  }

  // Insert new relationships if provided
  if (
    damageTypes &&
    Array.isArray(damageTypes) &&
    damageTypes.length > 0
  ) {
    for (const damageType of damageTypes) {
      await connection.execute(
        `INSERT INTO dnd5e.${table} (entity_id, damage_type) VALUES (?, ?)`,
        [entityId, damageType]
      );
    }
  }
}


export default{
  getAllEntities,
  getEntityById,
  getEntitySummaries,
  updateEntity,
  insertEntity
}