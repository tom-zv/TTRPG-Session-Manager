import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { getSocketIO } from "src/socket/index.js";
import { EncounterSocketEvents } from "shared/sockets/encounters/socketEvents.js";
import { getEncounterRoom } from "./encounterTransport.js";

export function notifyEntityTemplateUpdated(templateId: number): void {
  const rooms = encounterEngineManager.getActiveEncounterIds()
    .filter((id) => encounterEngineManager.getEngine(id)?.snapshot().entityStates.some((entity) => entity.templateId === templateId))
    .map(getEncounterRoom);
  if (rooms.length) {
    getSocketIO().of("/encounter").to(rooms).emit(EncounterSocketEvents.TEMPLATE_UPDATED, { templateId });
  }
}
