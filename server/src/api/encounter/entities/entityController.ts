import { Request, Response, NextFunction } from "express";
import entityService from "./entityService.js";
import { ValidationError } from "../../HttpErrors.js";
import { isSupportedSystem } from "shared/domain/encounters/coreEncounter.js";
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
  const { entityIds } = req.body as { entityIds?: number[] };

  try {
    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      throw new ValidationError("entityIds array is required and must not be empty");
    }
    
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    const entities = await entityService.getEntitiesByIds(system, entityIds);
    
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
    
    const updatedEntity = await entityService.updateEntity(system, Number(id), formattedData);
    
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
  deleteEntity
};