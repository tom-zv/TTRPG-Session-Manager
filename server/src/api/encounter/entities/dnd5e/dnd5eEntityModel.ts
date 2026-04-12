import { dnd5ePool } from "src/db.js";
import { DnD5eEntitySummaryDB } from "./types.js";
import { DnD5eEntityDB } from "./types.js";
import { RowDataPacket, PoolConnection } from "mysql2/promise";
import { DnD5eEntityState } from "shared/domain/encounters/dnd5e/entity.js";

// Type for dnd5e.entities table 
interface DnD5eEntityTableData {
  entity_type: 'pc' | 'npc' | 'creature';
  cr?: string;
  ac: number;
  hp: number;
  speeds: { [key: string]: number };
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';
  alignment: string;
  ability_scores: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
}

/**
 * Extract only the fields that belong to the dnd5e.entities table
 */
function extractDnD5eTableFields(data: Omit<DnD5eEntityDB, "id" | "createdAt">): DnD5eEntityTableData {
  return {
    entity_type: data.entity_type,
    cr: data.cr,
    ac: data.ac,
    hp: data.hp,
    speeds: data.speeds,
    size: data.size,
    alignment: data.alignment,
    ability_scores: data.ability_scores,
  };
}

// System-specific handler for DnD5e
export async function insertEntity(
  connection: PoolConnection,
  entityId: number,
  data: Omit<DnD5eEntityDB, "id" | "createdAt">
): Promise<void> {
    
  const tableData = extractDnD5eTableFields(data);
  const { fields, values } = prepareEntityFields(tableData, false);

  // Insert main entity record
  const query = `
      INSERT INTO dnd5e.entities 
      (id, ${fields.join(", ")})
      VALUES (?, ${values.map(() => '?').join(", ")})
    `;

  await connection.execute(query, [entityId, ...values]);

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

  const tableData = extractDnD5eTableFields(data);
  const { fields, values } = prepareEntityFields(tableData, true);

  // Update main entity record
  const query = `UPDATE dnd5e.entities SET ${fields.join(", ")} WHERE id = ?`;

  await connection.execute(query, [...values, entityId]);

  // Handle join tables if present in data
  await handleDamageTypes(connection, entityId, "entity_resistances", data.resistances, true);
  await handleDamageTypes(connection, entityId, "entity_vulnerabilities", data.vulnerabilities, true);
  await handleDamageTypes(connection, entityId, "entity_immunities", data.immunities, true);
}

export async function getEntityById(
  entityId: number
): Promise<DnD5eEntityDB> {
  // Get the base entity data
  const [entityRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT 
      c.id, c.name, c.image_url, c.created_at,
      e.entity_type, e.cr, e.ac, e.speeds, e.hp, e.ability_scores
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

export async function getEntitiesByIds(
  entityIds: number[]
): Promise<DnD5eEntityDB[]> {
  if (!entityIds || entityIds.length === 0) {
    return [];
  }

  // Get the base entity data for all IDs
  const placeholders = entityIds.map(() => '?').join(',');
  const [entityRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT 
      c.id, c.name, c.image_url, c.created_at,
      e.entity_type, e.cr, e.ac, e.speeds, e.hp, e.ability_scores
    FROM 
      core.entities c
    JOIN 
      dnd5e.entities e ON c.id = e.id
    WHERE 
      c.id IN (${placeholders})`,
    entityIds
  );

  if (entityRows.length === 0) {
    return [];
  }

  // Get all resistances in one query
  const [resistanceRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT entity_id, damage_type
     FROM dnd5e.entity_resistances
     WHERE entity_id IN (${placeholders})`,
    entityIds
  );

  // Get all vulnerabilities in one query
  const [vulnerabilityRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT entity_id, damage_type
     FROM dnd5e.entity_vulnerabilities
     WHERE entity_id IN (${placeholders})`,
    entityIds
  );

  // Get all immunities in one query
  const [immunityRows] = await dnd5ePool.execute<RowDataPacket[]>(
    `SELECT entity_id, damage_type
     FROM dnd5e.entity_immunities
     WHERE entity_id IN (${placeholders})`,
    entityIds
  );

  // Build lookup maps for damage types
  const resistancesMap = new Map<number, string[]>();
  const vulnerabilitiesMap = new Map<number, string[]>();
  const immunitiesMap = new Map<number, string[]>();

  resistanceRows.forEach((row: RowDataPacket) => {
    const entityId = (row as { entity_id: number }).entity_id;
    const damageType = (row as { damage_type: string }).damage_type;
    if (!resistancesMap.has(entityId)) {
      resistancesMap.set(entityId, []);
    }
    resistancesMap.get(entityId)!.push(damageType);
  });

  vulnerabilityRows.forEach((row: RowDataPacket) => {
    const entityId = (row as { entity_id: number }).entity_id;
    const damageType = (row as { damage_type: string }).damage_type;
    if (!vulnerabilitiesMap.has(entityId)) {
      vulnerabilitiesMap.set(entityId, []);
    }
    vulnerabilitiesMap.get(entityId)!.push(damageType);
  });

  immunityRows.forEach((row: RowDataPacket) => {
    const entityId = (row as { entity_id: number }).entity_id;
    const damageType = (row as { damage_type: string }).damage_type;
    if (!immunitiesMap.has(entityId)) {
      immunitiesMap.set(entityId, []);
    }
    immunitiesMap.get(entityId)!.push(damageType);
  });

  // Combine all data
  const entities = entityRows.map((row: RowDataPacket) => {
    const entity = row as DnD5eEntityDB;
    entity.resistances = resistancesMap.get(entity.id) || [];
    entity.vulnerabilities = vulnerabilitiesMap.get(entity.id) || [];
    entity.immunities = immunitiesMap.get(entity.id) || [];
    return entity;
  });

  return entities;
}

export async function getAllEntities(
  connection: PoolConnection
): Promise<DnD5eEntityDB[]> {
  // Get all base entity data
  const [entityRows] = await connection.execute<RowDataPacket[]>(
    `SELECT 
      c.id, c.name, c.image_url, c.created_at,
      e.entity_type, e.cr, e.ac, e.speeds, e.hp, e.ability_scores
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
      e.entity_type, e.cr, e.hp
    FROM 
      core.entities c
    JOIN 
      dnd5e.entities e ON c.id = e.id
    ORDER BY 
      c.name`
  );

  return entityRows as DnD5eEntitySummaryDB[];
}

/**
 * Prepare fields and values for SQL query from dnd5e.entities table data
 */
function prepareEntityFields(
  data: DnD5eEntityTableData,
  isUpdate: boolean
): { fields: string[]; values: unknown[] } {
  const fields: string[] = [];
  const values: unknown[] = [];

  const directFields = Object.keys(data) as (keyof DnD5eEntityTableData)[];

  for (const field of directFields) {
    const value = data[field];
    if (value !== undefined) {
      if (isUpdate) {
        fields.push(`${field} = ?`);
      } else {
        fields.push(field);
      }
      values.push(value);
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

/**
 * Create a default entity state for a newly assigned entity
 * @param templateId The ID of the base entity template
 * @param instanceId The unique ID for this entity instance in the encounter
 */
async function createDefaultEntityState(
  templateId: number,
  instanceId: number
): Promise<DnD5eEntityState> {
  const entity = await getEntityById(templateId);
  return {
    instanceId,
    templateId,
    initiative: 0,
    maxHp: entity.hp,
    currentHp: entity.hp, 
    tempHp: 0,
    isConcentrating: false,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    reactionUsed: false,
    conditions: null,
  };
}


export default{
  getAllEntities,
  getEntityById,
  getEntitiesByIds,
  getEntitySummaries,
  updateEntity,
  insertEntity,
  createDefaultEntityState
}