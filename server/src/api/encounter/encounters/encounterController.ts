import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "src/middleware/userAuth.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import { HttpError } from "src/api/HttpErrors.js";
import { validateEncounterSettingsPatch } from "shared/domain/encounters/dnd5e/settings.js";
import encounterService from "./encounterService.js";
import { ValidationError } from "../../HttpErrors.js";
import { isSupportedSystem, SystemType } from "shared/domain/encounters/coreEncounter.js";
import {
  dnd5eEncounterDbToDomainDetails,
  dnd5eEncounterToInsertDb,
  dnd5eEncounterToUpdateDb,
} from "src/utils/format-transformers/encounter-transformers/dnd5e/encounter-transformer.js";
import { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import dnd5eEncounterService from "./dnd5e/dnd5eEncounterService.js";

async function insertEncounter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Expected body: { data: CreatePayload<DnD5eEncounterDetails> }
  // Which is: Omit<DnD5eEncounterDetails, 'id' | 'createdAt'>
  const { data } = req.body;
  const { system } = req.params as { system?: string };

  try {
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    // Validate required fields
    if (!data.name) {
      throw new ValidationError("Encounter name is required");
    }

    // Get the system_id from the database
    const systemId = await encounterService.getSystemId(system);

    let formattedData;
    switch (system) {
      case "dnd5e":
        formattedData = dnd5eEncounterToInsertDb(data, systemId);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }

    const insertId = await encounterService.insertEncounter(system, formattedData, (req as AuthRequest).userSession!.userDb.id);
    res.status(201).json({ insertId });
    
  } catch (error) {
    next(error);
  }
}

async function getEncounterDetails(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: string };

  try {
    if (!id) {
      throw new ValidationError("Encounter ID is required");
    }

    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    const encounterDetails = await encounterService.getEncounterDetailsById(Number(id));

    if (!encounterDetails) {
      throw new ValidationError(`Encounter with ID ${id} not found`);
    }

    res.status(200).json({ encounterDetails });
    
  } catch (error) {
    next(error);
  }
}

async function getAllEncounterSummaries(
  req: Request,
  res: Response,
  next: NextFunction
){
  const { system } = req.params as { system?: string };

  try {
    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    let encounterSummaries;
    
    switch (system) {
      case "dnd5e": {
        const encounterRecords = await encounterService.getAllEncountersBySystem(system);
        encounterSummaries = encounterRecords.map((encounter) => dnd5eEncounterDbToDomainDetails(encounter));
        break;
      }
      default:
        throw new ValidationError("Unsupported system.");
    }

    res.status(200).json({ encounters: encounterSummaries });
  } catch (error) {
    next(error);
  }
}

async function updateEncounter(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Expected body: { data: UpdatePayload<DnD5eEncounterDetails> }
  // Which is: Partial<Omit<DnD5eEncounterDetails, 'id' | 'createdAt'>>
  const { id, system } = req.params as { id: string; system?: SystemType };
  const { data } = req.body;

  try {
    if (!id) {
      throw new ValidationError("Encounter ID is required");
    }
    
    if (!data || Object.keys(data).length === 0) {
      throw new ValidationError("Update data is required");
    }

    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }
    
    // Validate status enum if provided
    if (data.status && !['planned', 'active', 'completed'].includes(data.status)) {
      throw new ValidationError("Status must be one of: planned, active, completed");
    }
    
    let formattedData;
    switch (system) {
      case "dnd5e":
        formattedData = dnd5eEncounterToUpdateDb(data);
        break;
      default:
        throw new ValidationError("Unsupported system.");
    }

    const result = await encounterService.updateEncounter(Number(id), formattedData);
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


async function getEncounterState(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: SystemType };

  try {
    if (!id) {
      throw new ValidationError("Encounter ID is required");
    }

    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    let encounterState: DnD5eEncounterState | null = null;

    switch (system) {
      case "dnd5e":
        encounterState = await dnd5eEncounterService.getEncounterState(Number(id));
        break;

      default:
        throw new ValidationError(`Unsupported system: ${system}`);
    }

    if (!encounterState) {
      throw new ValidationError(`Encounter with ID ${id} not found`);
    }

    res.status(200).json({ encounterState });
    
  } catch (error) {
    next(error);
  }
}

async function saveEncounterState(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { id, system } = req.params as { id: string; system?: string };
  const { encounterState } = req.body as { encounterState: DnD5eEncounterState };

  try {
    if (!id) {
      throw new ValidationError("Encounter ID is required");
    }

    if (!isSupportedSystem(system)) {
      throw new ValidationError("Unsupported system.");
    }

    if (!encounterState) {
      throw new ValidationError("encounterState is required");
    }

    switch (system){
      case 'dnd5e':
        await encounterRequestQueue.enqueue(Number(id), async () => {
          if (encounterEngineManager.hasEngine(Number(id))) {
            throw new HttpError(409, "A live encounter must be changed through live actions");
          }
          try { validateEncounterSettingsPatch(encounterState.settings ?? {}); }
          catch (error) { throw new ValidationError((error as Error).message); }
          if (encounterState.id !== Number(id) || encounterState.system !== system) {
            throw new ValidationError("Encounter state does not match the requested encounter");
          }
          if (!Array.isArray(encounterState.entityStates) || !Array.isArray(encounterState.initiativeOrder) ||
              encounterState.entityStates.some((entity) =>
                (entity.inGrave !== undefined && typeof entity.inGrave !== "boolean") ||
                !Number.isInteger(entity.deathSaveSuccesses) || entity.deathSaveSuccesses < 0 || entity.deathSaveSuccesses > 3 ||
                !Number.isInteger(entity.deathSaveFailures) || entity.deathSaveFailures < 0 || entity.deathSaveFailures > 3)) {
            throw new ValidationError("Invalid encounter membership or death-save counters");
          }
          await dnd5eEncounterService.saveEncounterState(Number(id), encounterState);
        });
        break;
      default:
        throw new ValidationError(`Unsupported system: ${system}`);
  }

    res.status(200).json({ success: true });
    
  } catch (error) {
    next(error);
  }
}


export default {
  insertEncounter,
  getEncounterDetails,
  getAllEncounterSummaries,
  updateEncounter,
  deleteEncounter,
  getEncounterState,
  saveEncounterState,
};
