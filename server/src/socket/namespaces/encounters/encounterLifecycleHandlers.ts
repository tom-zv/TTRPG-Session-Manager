import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { SocketAck } from "shared/sockets/types.js";
import { Namespace, Socket } from "socket.io";
import encounterConnectionManager from "src/services/encounters/encounterConnectionManager.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import encounterRateLimiter from "./encounterRateLimiter.js";
import {
  emitEncounterEnded,
  emitEncounterError,
  EncounterInitData,
  EncounterRoomData,
  joinEncounterRooms,
  leaveEncounterRooms,
} from "./encounterTransport.js";

type AckCallback = (ack: SocketAck) => void;

const handleLifecycleError = (
  socket: Socket,
  callback: AckCallback | undefined,
  error: unknown,
  fallbackMessage: string
): void => {
  if (error instanceof EncounterHandlerError) {
    emitEncounterError(socket, error.code, error.message);
    callback?.({ success: false, error: error.message });
    return;
  }

  const errorMessage = error instanceof Error ? error.message : fallbackMessage;
  emitEncounterError(socket, EncounterErrorCode.REQUEST_FAILED, errorMessage);
  callback?.({ success: false, error: errorMessage });
};

const requireAuthenticatedUserId = (socket: Socket): number => {
  const userId = socket.data.user?.id;

  if (!userId) {
    throw new EncounterHandlerError(
      EncounterErrorCode.NOT_AUTHENTICATED,
      "User not authenticated"
    );
  }

  return userId;
};

const requireEncounterId = (
  data: EncounterRoomData | EncounterInitData | undefined
): number => {
  if (typeof data?.encounterId !== "number") {
    throw new EncounterHandlerError(
      EncounterErrorCode.INVALID_REQUEST,
      "Missing encounterId"
    );
  }

  return data.encounterId;
};

const leaveTrackedEncounter = (socket: Socket, encounterId: number, userId: number): void => {
  leaveEncounterRooms(socket, encounterId, Boolean(socket.data.user?.is_gm), userId);

  console.log(`User ${socket.data.user?.username} left encounter ${encounterId}`);

  const encounterEmpty = encounterConnectionManager.removeUser(encounterId, socket.id);
  if (encounterEmpty) {
    encounterEngineManager.startInactivityTimeout(encounterId);
  }
};

export const registerEncounterLifecycleHandlers = (namespace: Namespace, socket: Socket): void => {
  socket.on("disconnect", () => {
    console.log(`User ${socket.data.user?.username} disconnected from encounters`);

    const userId = socket.data.user?.id;
    if (userId) {
      encounterRateLimiter.cleanup(String(userId));
    }

    const encounterId = encounterConnectionManager.removeUserBySocketId(socket.id);
    if (encounterId !== null) {
      console.log(`No users connected to encounter ${encounterId}, starting inactivity timeout`);
      encounterEngineManager.startInactivityTimeout(encounterId);
    }
  });

  socket.on("encounter:init", async (data: EncounterInitData, callback?: AckCallback) => {
    console.log("INIT", data);

    try {
      if (!socket.data.user?.is_gm) {
        throw new EncounterHandlerError(
          EncounterErrorCode.NOT_AUTHORIZED,
          "Only GMs can initialize encounters"
        );
      }

      if (!data?.system) {
        throw new EncounterHandlerError(
          EncounterErrorCode.INVALID_REQUEST,
          "Missing encounter system"
        );
      }

      const encounterId = requireEncounterId(data);

      if (encounterEngineManager.hasEngine(encounterId)) {
        await encounterEngineManager.cleanupEngine(encounterId);
        emitEncounterEnded(namespace, encounterId);
      }

      await encounterEngineManager.initializeEngine(data.system, encounterId);
      callback?.({ success: true });
    } catch (error) {
      handleLifecycleError(socket, callback, error, "Failed to initialize encounter");
    }
  });

  socket.on("encounter:join", async (data: EncounterRoomData, callback?: AckCallback) => {
    console.log("JOIN", data);

    try {
      const userId = requireAuthenticatedUserId(socket);
      const encounterId = requireEncounterId(data);

      if (!encounterEngineManager.hasEngine(encounterId)) {
        throw new EncounterHandlerError(
          EncounterErrorCode.NO_ACTIVE_ENCOUNTER,
          "No active encounter"
        );
      }

      const currentEncounterId = encounterConnectionManager.getEncounterIdBySocketId(socket.id);
      if (currentEncounterId !== null && currentEncounterId !== encounterId) {
        leaveTrackedEncounter(socket, currentEncounterId, userId);
      }

      joinEncounterRooms(socket, encounterId, Boolean(socket.data.user?.is_gm), userId);

      console.log(`User ${socket.data.user?.username} joined encounter ${encounterId}`);

      encounterConnectionManager.addUser(encounterId, socket.id);
      encounterEngineManager.clearInactivityTimeout(encounterId);

      callback?.({ success: true });
    } catch (error) {
      handleLifecycleError(socket, callback, error, "Failed to join encounter");
    }
  });

  socket.on("encounter:leave", (data?: EncounterRoomData, callback?: AckCallback) => {
    console.log("LEAVE", data);

    try {
      const userId = requireAuthenticatedUserId(socket);
      const trackedEncounterId = encounterConnectionManager.getEncounterIdBySocketId(socket.id);
      const requestedEncounterId =
        typeof data?.encounterId === "number" ? data.encounterId : null;
      const encounterId = trackedEncounterId ?? requestedEncounterId;

      if (encounterId === null) {
        callback?.({ success: true });
        return;
      }

      leaveTrackedEncounter(socket, encounterId, userId);
      callback?.({ success: true });
    } catch (error) {
      handleLifecycleError(socket, callback, error, "Failed to leave encounter");
    }
  });
};
