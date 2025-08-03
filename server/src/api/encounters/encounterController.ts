import { Request, Response, NextFunction } from "express";
import encounterService from "./encounterService.js";
import { ValidationError } from "../HttpErrors.js";

async function insertEncounter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { data } = req.body;

  try {
    // Validate required fields
    if (!data.name) {
      throw new ValidationError("Encounter name is required");
    }

    const insertId = encounterService.insertEncounter(data);
    res.status(201).json({ insertId });
    
  } catch (error) {
    next(error);
  }
}

async function getAllEncounters(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const encounters = await encounterService.getAllEncounters();
    res.status(200).json({ encounters });
  } catch (error) {
    next(error);
  }
}

async function assignEntitiesToEncounter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { encounterId, entityIds } = req.body;

  try {
    if (!encounterId) {
      throw new ValidationError("Encounter ID is required");
    }
    
    if (!entityIds || !Array.isArray(entityIds) || entityIds.length === 0) {
      throw new ValidationError("Entity IDs array is required");
    }
    
    await encounterService.assignEntitiesToEncounter(encounterId, entityIds);
    res.status(200).json();
    
  } catch (error) {
    next(error);
  }
}

async function updateEncounter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;
  const { data } = req.body;

  try {
    if (!id) {
      throw new ValidationError("Encounter ID is required");
    }
    
    if (!data || Object.keys(data).length === 0) {
      throw new ValidationError("Update data is required");
    }
    
    // Validate status enum if provided
    if (data.status && !['planned', 'active', 'completed'].includes(data.status)) {
      throw new ValidationError("Status must be one of: planned, active, completed");
    }
    
    const result = await encounterService.updateEncounter(Number(id), data);
    res.status(200).json(result);
    
  } catch (error) {
    next(error);
  }
}

async function deleteEncounter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id } = req.params;

  try {
    if (!id) {
      throw new ValidationError("Encounter ID is required");
    }
    
    const result = await encounterService.deleteEncounter(Number(id));
    res.status(200).json({ success: result });
    
  } catch (error) {
    next(error);
  }
}

export default {
  insertEncounter,
  getAllEncounters,
  assignEntitiesToEncounter,
  updateEncounter,
  deleteEncounter
};
