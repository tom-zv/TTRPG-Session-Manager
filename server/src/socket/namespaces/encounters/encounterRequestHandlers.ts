import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { Namespace, Socket } from "socket.io";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import encounterConnectionManager from "src/services/encounters/encounterConnectionManager.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { validateRequest, validateUser } from "./encounterRequestValidator.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import encounterRateLimiter from "./encounterRateLimiter.js";
import { emitEncounterError, emitEncounterOperation } from "./encounterTransport.js";
import { SocketAck } from "shared/sockets/types.js";
import { EncounterAuthorizationError } from "src/services/encounters/EncounterAuthorizationError.js";
import { EncounterSocketEvents } from "shared/sockets/encounters/socketEvents.js";

type AckCallback = (ack: SocketAck) => void;

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
  socket.on(EncounterSocketEvents.REQUEST, async (request: EncounterRequest, callback?: AckCallback) => {
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

      const userId = socket.data.user.id;
      if (encounterRateLimiter.isRateLimited(String(userId))) {
        throw new EncounterHandlerError(
          EncounterErrorCode.RATE_LIMITED,
          "Too many requests, slow down"
        );
      }

      const operation = await encounterRequestQueue.enqueue(request.encounterId, async () => {
        const encounterEngine = getEncounterEngine(request.encounterId);
        return await encounterEngine.dispatch(request, socket.data.user);
      });

      emitEncounterOperation(namespace, operation);
      callback?.({ success: true });
    } catch (error) {
      if (error instanceof EncounterHandlerError) {
        emitEncounterError(socket, error.code, error.message, request.requestId);
        callback?.({ success: false, error: error.message });
        return;
      }

      if (error instanceof EncounterAuthorizationError) {
        emitEncounterError(socket, EncounterErrorCode.NOT_AUTHORIZED, error.message, request.requestId);
        callback?.({ success: false, error: error.message });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to process request";
      emitEncounterError(
        socket,
        EncounterErrorCode.REQUEST_FAILED,
        errorMessage,
        request.requestId
      );
      callback?.({ success: false, error: errorMessage });
    }
  });
};
