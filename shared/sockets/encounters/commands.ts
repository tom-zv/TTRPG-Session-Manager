import { AnySystemEncounterEvent } from "./types.js";

/**
 * Base command structure for encounter operations
 */
export type EncounterCommand = {
  encounterId: number;
  commandId: string;
  event: AnySystemEncounterEvent;
  timestamp: number;
}
