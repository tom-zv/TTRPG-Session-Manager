import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { Namespace, Socket } from "socket.io";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import encounterConnectionManager from "src/services/encounters/encounterConnectionManager.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { validateRequest, validateUser } from "./encounterRequestValidator.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import encounterRateLimiter from "./encounterRateLimiter.js";
import { emitEncounterError, emitEncounterOperation, toAck } from "./encounterTransport.js";
import { EncounterAuthorizationError } from "src/services/encounters/EncounterAuthorizationError.js";
import { EncounterNotFoundError } from "src/services/encounters/encounterSystems.js";
import { EncounterSocketEvents } from "shared/sockets/encounters/socketEvents.js";

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
  socket.on(EncounterSocketEvents.REQUEST, async (payload: unknown, ackCallback?: unknown) => {
    console.log("REQUEST", payload);

    // The payload is untrusted until validated; the error path must not assume its shape.
    const callback = toAck(ackCallback);
    const requestId = typeof (payload as { requestId?: unknown } | null)?.requestId === "string"
      ? (payload as { requestId: string }).requestId
      : undefined;

    try {
      const requestValidation = validateRequest(payload);
      if (!requestValidation.valid) {
        throw new EncounterHandlerError(requestValidation.code, requestValidation.error);
      }
      const request = payload as EncounterRequest;

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
        const encounterEngine = await encounterEngineManager.getOrLoadEngine(request.encounterId);
        return await encounterEngine.dispatch(request, socket.data.user);
      });

      emitEncounterOperation(namespace, operation);
      callback?.({ success: true });
    } catch (error) {
      if (error instanceof EncounterHandlerError) {
        emitEncounterError(socket, error.code, error.message, requestId);
        callback?.({ success: false, error: error.message });
        return;
      }

      if (error instanceof EncounterNotFoundError) {
        emitEncounterError(socket, EncounterErrorCode.ENCOUNTER_NOT_FOUND, error.message, requestId);
        callback?.({ success: false, error: error.message });
        return;
      }

      if (error instanceof EncounterAuthorizationError) {
        emitEncounterError(socket, EncounterErrorCode.NOT_AUTHORIZED, error.message, requestId);
        callback?.({ success: false, error: error.message });
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to process request";
      emitEncounterError(
        socket,
        EncounterErrorCode.REQUEST_FAILED,
        errorMessage,
        requestId
      );
      callback?.({ success: false, error: errorMessage });
    }
  });
};
