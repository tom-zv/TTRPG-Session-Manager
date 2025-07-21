import { Request, Response, NextFunction } from "express";
import entityService from "./entityService.js";
import { ValidationError } from "../../HttpErrors.js";
import { SystemType } from "./entityModel.js";
import { dnd5eEntityToUpdateDb, dnd5eEntityToInsertDb, dnd5eEntitySummaryDbToDomain } from "src/utils/format-transformers/encounter-transformers/entity-transformer.js";

async function getEntityById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system: SystemType };

  try {
    if (!id) {
      throw new ValidationError("Entity ID is required");
    }
    
    // Validate system parameter
    if (system !== 'dnd5e') {
      throw new ValidationError("Unsupported system.");
    }
    
    const entity = await entityService.getEntityById(system, Number(id));
    res.status(200).json({ entity });
    
  } catch (error) {
    next(error);
  }
}

async function getAllEntities(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { system } = req.params as { system: SystemType };

  try {
    // Validate system parameter
    if (system !== 'dnd5e') {
      throw new ValidationError("Unsupported system.");
    }
    
    const entities = await entityService.getAllEntities(system);
    res.status(200).json({ entities });
    
  } catch (error) {
    next(error);
  }
}

async function getEntitySummaries(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { system } = req.params as { system: SystemType };

  try {
    // Validate system parameter
    if (system !== 'dnd5e') {
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
  const { system } = req.params as { system: SystemType };

  try {
    // Validate required fields
    if (!data.name) {
      throw new ValidationError("Entity name is required");
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
    res.status(201).json({ insertId });
  } catch (error) {
    next(error);
  }
}

async function updateEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system: SystemType };
  const { data } = req.body;

  try {
    if (!id) {
      throw new ValidationError("Entity ID is required");
    }
    
    if (!data || Object.keys(data).length === 0) {
      throw new ValidationError("Update data is required");
    }
    
    let formattedData;
    switch (system) {
      case 'dnd5e':
        formattedData = dnd5eEntityToUpdateDb(data);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }
    
    const result = await entityService.updateEntity(system, Number(id), formattedData);
    res.status(200).json(result);
    
  } catch (error) {
    next(error);
  }
}

async function deleteEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;

  try {
    if (!id) {
      throw new ValidationError("Entity ID is required");
    }
    
    const result = await entityService.deleteEntity(Number(id));
    res.status(200).json({ success: result });
    
  } catch (error) {
    next(error);
  }
}

export default {
  getEntityById,
  getAllEntities,
  getEntitySummaries,
  insertEntity,
  updateEntity,
  deleteEntity
};