import { getSocketIO } from "src/socket/index.js";
import { emitCurrentEncounterChanged, emitEncounterEnded } from "./encounterTransport.js";

/**
 * Tells everyone still in a deleted encounter's room that it is gone, and the campaign's watchers
 * that its current encounter may have changed (the row cascades away only if it was current).
 */
export function notifyEncounterDeleted(encounterId: number, campaignId: number): void {
  const namespace = getSocketIO().of("/encounter");
  emitEncounterEnded(namespace, encounterId);
  emitCurrentEncounterChanged(namespace, campaignId);
}
