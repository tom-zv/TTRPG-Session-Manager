import { EncounterRequest } from "shared/sockets/encounters/requests.js";
import { toEncounterOperationDTO } from "shared/sockets/encounters/types.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { Namespace, Socket } from "socket.io";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import encounterConnectionManager from "src/services/encounters/encounterConnectionManager.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { validateRequest, validateUser } from "./encounterRequestValidator.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import encounterRateLimiter from "./encounterRateLimiter.js";
import { emitEncounterError, emitEncounterOperation } from "./encounterTransport.js";

const getEncounterEngine = (encounterId: number) => {
  const encounterEngine = encounterEngineManager.getEngine(encounterId);
  if (!encounterEngine) {
    throw new EncounterHandlerError(
      EncounterErrorCode.NO_ACTIVE_ENCOUNTER,
      "No active encounter"
    );
  }

  return encounterEngine;
};

const assertSocketJoinedEncounter = (socket: Socket, encounterId: number): void => {
  const trackedEncounterId = encounterConnectionManager.getEncounterIdBySocketId(socket.id);

  if (trackedEncounterId !== encounterId) {
    throw new EncounterHandlerError(
      EncounterErrorCode.NOT_AUTHORIZED,
      "Join the encounter before sending requests"
    );
  }
};

export const registerEncounterRequestHandlers = (namespace: Namespace, socket: Socket): void => {
  socket.on("encounter:request", async (request: EncounterRequest) => {
    console.log("REQUEST", request);

    try {
      const requestValidation = validateRequest(request);
      if (!requestValidation.valid) {
        throw new EncounterHandlerError(requestValidation.code, requestValidation.error);
      }

      const userValidation = validateUser(socket);
      if (!userValidation.valid) {
        throw new EncounterHandlerError(userValidation.code, userValidation.error);
      }

      assertSocketJoinedEncounter(socket, request.encounterId);

      if (request.kind === "undo") {
        throw new EncounterHandlerError(
          EncounterErrorCode.REQUEST_FAILED,
          "Undo requests are not implemented yet"
        );
      }

      const userId = socket.data.user.id;
      if (encounterRateLimiter.isRateLimited(String(userId))) {
        throw new EncounterHandlerError(
          EncounterErrorCode.RATE_LIMITED,
          "Too many requests, slow down"
        );
      }

      const operation = await encounterRequestQueue.enqueue(request.encounterId, async () => {
        const encounterEngine = getEncounterEngine(request.encounterId);
        return await encounterEngine.dispatch(request);
      });

      emitEncounterOperation(namespace, toEncounterOperationDTO(operation));
    } catch (error) {
      if (error instanceof EncounterHandlerError) {
        emitEncounterError(socket, error.code, error.message, request.requestId);
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to process request";
      emitEncounterError(
        socket,
        EncounterErrorCode.REQUEST_FAILED,
        errorMessage,
        request.requestId
      );
    }
  });
};
