import { Request, Response, NextFunction } from "express";
import entityService from "./entityService.js";
import { ValidationError } from "../../HttpErrors.js";
import type { AuthRequest } from "src/middleware/userAuth.js";
import { isSupportedSystem } from "shared/domain/encounters/coreEncounter.js";
import { validateDnD5eEntityWrite } from "shared/domain/encounters/dnd5e/entityValidation.js";
import { validateExpectedRevision, validateInventory, validateInventoryAppend } from "shared/domain/encounters/dnd5e/inventory.js";
import { notifyEntityTemplateUpdated } from "src/socket/namespaces/encounters/entityTemplateUpdates.js";
import {
  dnd5eEntityToWriteDb,
  dnd5eEntitySummaryDbToDomain,
  dnd5eEntityDbToDomain,
} from "src/utils/format-transformers/encounter-transformers/dnd5e/entity-transformer.js";

async function getEntityById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    const entityId = parseEntityId(id);
    
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    const entity = await entityService.getEntityById(system, entityId);
    // Apply transform function for dnd5e
    let transformedEntity;
    switch (system) {
      case 'dnd5e':
        transformedEntity = dnd5eEntityDbToDomain(entity);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }
    res.status(200).json({ entity: transformedEntity });
    
  } catch (error) {
    next(error);
  }
}

async function getEntitiesByIds(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { system } = req.params as { system?: string };
  const entityIds: unknown = req.body?.entityIds;

  try {
    if (!Array.isArray(entityIds) || entityIds.length === 0 || entityIds.length > 100 ||
        !entityIds.every((id: unknown) => typeof id === "number" && Number.isSafeInteger(id) && id > 0)) {
      throw new ValidationError("entityIds must contain 1 to 100 positive safe-integer IDs");
    }
    
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    const entities = await entityService.getEntitiesByIds(system, [...new Set<number>(entityIds)]);
    
    // Transform DB format to domain format
    let transformedEntities;
    switch (system) {
      case 'dnd5e':
        transformedEntities = entities.map(dnd5eEntityDbToDomain);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }
    
    res.status(200).json({ entities: transformedEntities });
    
  } catch (error) {
    next(error);
  }
}

async function getAllEntities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { system } = req.params as { system?: string };

  try {
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    const entities = await entityService.getAllEntities(system);
    const transformedEntities = entities.map(dnd5eEntityDbToDomain);

    res.status(200).json({ entities: transformedEntities });
  } catch (error){
    next(error);
  }
}

async function getEntitySummaries(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { system } = req.params as { system?: string };

  try {
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    const summaries = await entityService.getEntitySummaries(system);
    
    // Transform DB format to domain format
    const transformedSummaries = summaries.map(summary => 
      dnd5eEntitySummaryDbToDomain(summary)
    );
    
    res.status(200).json({ entities: transformedSummaries });
    
  } catch (error) {
    next(error);
  }
}

/** GET /entities/mine: the signed-in user's assigned player characters, as summaries. */
async function getMyEntitySummaries(req: Request, res: Response, next: NextFunction) {
  const { system } = req.params as { system?: string };

  try {
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    const userId = (req as AuthRequest).userSession!.userDb.id;
    const summaries = await entityService.getAssignedPcSummaries(system, userId);
    res.status(200).json({ entities: summaries.map(dnd5eEntitySummaryDbToDomain) });
  } catch (error) {
    next(error);
  }
}

/** GET /entities/mine/:id: one of the signed-in user's assigned player characters. */
async function getMyEntityById(req: Request, res: Response, next: NextFunction) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    const entityId = Number(id);
    if (!Number.isSafeInteger(entityId) || entityId <= 0) {
      throw new ValidationError("Entity ID must be a positive integer");
    }
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    const userId = (req as AuthRequest).userSession!.userDb.id;
    const entity = await entityService.getAssignedPc(system, userId, entityId);
    res.status(200).json({ entity: dnd5eEntityDbToDomain(entity) });
  } catch (error) {
    next(error);
  }
}

function parseEntityId(id: string | undefined): number {
  const entityId = Number(id);
  if (!Number.isSafeInteger(entityId) || entityId <= 0) {
    throw new ValidationError("Entity ID must be a positive integer");
  }
  return entityId;
}

/** GET /entities/:id/inventory: GMs for PCs and featured NPCs, players for their assigned PCs. */
async function getEntityInventory(req: Request, res: Response, next: NextFunction) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    const entityId = parseEntityId(id);
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    const user = (req as AuthRequest).userSession!.userDb;
    const inventory = await entityService.getInventory(system, { id: user.id, isGm: Boolean(user.is_gm) }, entityId);
    res.status(200).json(inventory);
  } catch (error) {
    next(error);
  }
}

// Runs a shared validator, turning its Error into a 400.
function validated<T>(validate: () => T): T {
  try { return validate(); }
  catch (error) { throw new ValidationError((error as Error).message); }
}

/**
 * PUT /entities/:id/inventory (GM): replace the whole list.
 * Body: { items, expectedRevision? }. Response: { items, revision }; a stale expectedRevision is a 409
 * whose body also carries the stored { items, revision }.
 */
async function replaceEntityInventory(req: Request, res: Response, next: NextFunction) {
  const { id, system } = req.params as { id: string; system?: string };
  const body: unknown = req.body;

  try {
    const entityId = parseEntityId(id);
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    if (typeof body !== "object" || body === null || !("items" in body)) {
      throw new ValidationError("items is required");
    }
    switch (system) {
      case "dnd5e": {
        const items = validated(() => validateInventory(body.items));
        const expectedRevision = validated(() =>
          validateExpectedRevision("expectedRevision" in body ? body.expectedRevision : undefined));
        const saved = await entityService.replaceInventory(system, entityId, items, expectedRevision);
        res.status(200).json(saved);
        break;
      }
      default:
        throw new ValidationError("Unsupported system.");
    }
  } catch (error) {
    next(error);
  }
}

/**
 * POST /entities/:id/inventory/items (GM): append one catalog item to the latest list.
 * Body: { itemId, quantity, notes? }. Response 201: the whole inventory, { items, revision }.
 */
async function appendEntityInventoryItem(req: Request, res: Response, next: NextFunction) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    const entityId = parseEntityId(id);
    switch (system) {
      case "dnd5e": {
        const append = validated(() => validateInventoryAppend(req.body));
        const saved = await entityService.appendInventoryItem(system, entityId, append);
        res.status(201).json(saved);
        break;
      }
      default:
        throw new ValidationError("Unsupported system.");
    }
  } catch (error) {
    next(error);
  }
}

async function insertEntity(req: Request, res: Response, next: NextFunction) {
  const { system } = req.params as { system?: string };

  try {
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    const result = validateDnD5eEntityWrite(req.body?.data);
    if (!result.ok) throw new ValidationError("Invalid entity data.", result.issues);

    const insertId = await entityService.insertEntity(system, dnd5eEntityToWriteDb(result.value));
    const entity = await entityService.getEntityById(system, insertId);
    res.status(201).json({ insertId, entity: dnd5eEntityDbToDomain(entity) });
  } catch (error) {
    next(error);
  }
}

async function updateEntity(req: Request, res: Response, next: NextFunction) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    const entityId = parseEntityId(id);
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    const result = validateDnD5eEntityWrite(req.body?.data, "update");
    if (!result.ok) throw new ValidationError("Invalid entity data.", result.issues);
    const overwriteImported: unknown = req.body?.overwriteImported;
    if (overwriteImported !== undefined && typeof overwriteImported !== "boolean") {
      throw new ValidationError("overwriteImported must be true or false.");
    }

    const entity = await entityService.updateEntity(system, entityId, dnd5eEntityToWriteDb(result.value), {
      overwriteImported: overwriteImported === true,
    });
    notifyEntityTemplateUpdated(entityId);
    res.status(200).json({ entity: dnd5eEntityDbToDomain(entity) });
  } catch (error) {
    next(error);
  }
}

async function setEntityControllers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: string };
  const { userIds } = req.body as { userIds?: unknown };

  try {
    const entityId = Number(id);
    if (!Number.isInteger(entityId) || entityId <= 0) {
      throw new ValidationError("Entity ID is required");
    }
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    if (!Array.isArray(userIds) || !userIds.every((userId) => Number.isInteger(userId) && userId > 0)) {
      throw new ValidationError("userIds must be an array of user IDs");
    }

    const controllerUserIds = await entityService.setEntityControllers(entityId, userIds as number[]);
    notifyEntityTemplateUpdated(entityId);
    res.status(200).json({ controllerUserIds });
  } catch (error) {
    next(error);
  }
}

async function deleteEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    if (!id) {
      throw new ValidationError("Entity ID is required");
    }
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    const result = await entityService.deleteEntity(Number(id));
    res.status(200).json({ success: result });
    
  } catch (error) {
    next(error);
  }
}

export default {
  getEntityById,
  getEntitiesByIds,
  getAllEntities,
  getEntitySummaries,
  getMyEntitySummaries,
  getMyEntityById,
  getEntityInventory,
  replaceEntityInventory,
  appendEntityInventoryItem,
  insertEntity,
  updateEntity,
  setEntityControllers,
  deleteEntity
};
