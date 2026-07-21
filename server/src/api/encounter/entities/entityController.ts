import { Request, Response, NextFunction } from "express";
import entityService from "./entityService.js";
import { ValidationError } from "../../HttpErrors.js";
import { isSupportedSystem } from "shared/domain/encounters/coreEncounter.js";
import { validateEntitySettingsPatch } from "shared/domain/encounters/dnd5e/settings.js";
import { notifyEntityTemplateUpdated } from "src/socket/namespaces/encounters/entityTemplateUpdates.js";
import {
  dnd5eEntityToUpdateDb,
  dnd5eEntityToInsertDb,
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
    if (!id) {
      throw new ValidationError("Entity ID is required");
    }
    
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    const entity = await entityService.getEntityById(system, Number(id));
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

async function insertEntity(req: Request, res: Response, next: NextFunction) {
  const { data } = req.body;
  const { system } = req.params as { system?: string };

  try {
    // Validate required fields
    if (!data.name) {
      throw new ValidationError("Entity name is required");
    }

    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    let formattedData;

    switch (system) {
      case "dnd5e": // TODO: validation
        if (data.settings !== undefined) {
          try { validateEntitySettingsPatch(data.settings); }
          catch (error) { throw new ValidationError((error as Error).message); }
        }
        formattedData = dnd5eEntityToInsertDb(data);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }

  const insertId = await entityService.insertEntity(system, formattedData);
    
    let insertedEntity;
    switch (system) {
      case "dnd5e":
        insertedEntity = await entityService.getEntityById(system, insertId);
        insertedEntity = dnd5eEntityDbToDomain(insertedEntity);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }
    res.status(201).json({ insertId, entity: insertedEntity });
  } catch (error) {
    next(error);
  }
}

async function updateEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: string };
  const { data } = req.body;

  try {
    if (!id) {
      throw new ValidationError("Entity ID is required");
    }
    
    if (!data || Object.keys(data).length === 0) {
      throw new ValidationError("Update data is required");
    }
    
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    let formattedData;
    switch (system) {
      case 'dnd5e':
        formattedData = dnd5eEntityToUpdateDb(data);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }
    
    if (data.settings !== undefined) {
      try { validateEntitySettingsPatch(data.settings); }
      catch (error) { throw new ValidationError((error as Error).message); }
    }
    const updatedEntity = await entityService.updateEntity(system, Number(id), formattedData);
    notifyEntityTemplateUpdated(Number(id));
    
    // Transform to domain format
    let transformedEntity;
    switch (system) {
      case 'dnd5e':
        transformedEntity = dnd5eEntityDbToDomain(updatedEntity);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }
    
    res.status(200).json({ entity: transformedEntity });
    
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
  insertEntity,
  updateEntity,
  setEntityControllers,
  deleteEntity
};
