import { getSocketIO } from "src/socket/index.js";
import { emitEncounterEnded } from "./encounterTransport.js";

/** Tells everyone still in a deleted encounter's room that it is gone. */
export function notifyEncounterDeleted(encounterId: number): void {
  emitEncounterEnded(getSocketIO().of("/encounter"), encounterId);
}
