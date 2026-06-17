import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { EncounterJoinAck } from "shared/sockets/encounters/types.js";
import { SocketAck } from "shared/sockets/types.js";
import { Socket } from "socket.io";
import encounterConnectionManager from "src/services/encounters/encounterConnectionManager.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import encounterRequestQueue from "src/services/encounters/encounterRequestQueue.js";
import { EncounterNotFoundError } from "src/services/encounters/encounterSystems.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import encounterRateLimiter from "./encounterRateLimiter.js";
import {
  emitEncounterError,
  EncounterRoomData,
  joinEncounterRooms,
  leaveEncounterRooms,
} from "./encounterTransport.js";

type FailureAck = (ack: { success: false; error: string }) => void;

/** The acknowledgement argument comes from the client, so it may be missing or not a function. */
const toCallback = <TAck>(callback: unknown): ((ack: TAck) => void) | undefined =>
  typeof callback === "function" ? (callback as (ack: TAck) => void) : undefined;

const handleLifecycleError = (
  socket: Socket,
  callback: FailureAck | undefined,
  error: unknown,
  fallbackMessage: string
): void => {
  if (error instanceof EncounterHandlerError) {
    emitEncounterError(socket, error.code, error.message);
    callback?.({ success: false, error: error.message });
    return;
  }

  if (error instanceof EncounterNotFoundError) {
    emitEncounterError(socket, EncounterErrorCode.ENCOUNTER_NOT_FOUND, error.message);
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

const requireEncounterId = (data: EncounterRoomData | undefined): number => {
  const encounterId = data?.encounterId;
  if (typeof encounterId !== "number" || !Number.isInteger(encounterId) || encounterId <= 0) {
    throw new EncounterHandlerError(
      EncounterErrorCode.INVALID_REQUEST,
      "Missing encounterId"
    );
  }

  return encounterId;
};

const leaveTrackedEncounter = (socket: Socket, encounterId: number, userId: number): void => {
  leaveEncounterRooms(socket, encounterId, Boolean(socket.data.user?.is_gm), userId);

  console.log(`User ${socket.data.user?.username} left encounter ${encounterId}`);

  const encounterEmpty = encounterConnectionManager.removeUser(encounterId, socket.id);
  if (encounterEmpty) {
    encounterEngineManager.startInactivityTimeout(encounterId);
  }
};

export const registerEncounterLifecycleHandlers = (socket: Socket): void => {
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

  // Joining is also how a client (re)synchronizes: the acknowledgement carries the current state.
  // It runs in the encounter's request queue, so the returned state and the room membership are
  // consistent: every operation after that state reaches this socket.
  socket.on("encounter:join", async (data: EncounterRoomData | undefined, ackCallback?: unknown) => {
    console.log("JOIN", data);
    const callback = toCallback<EncounterJoinAck>(ackCallback);

    try {
      const userId = requireAuthenticatedUserId(socket);
      const encounterId = requireEncounterId(data);

      const encounterState = await encounterRequestQueue.enqueue(encounterId, async () => {
        const engine = await encounterEngineManager.getOrLoadEngine(encounterId);

        if (socket.disconnected) {
          throw new EncounterHandlerError(EncounterErrorCode.REQUEST_FAILED, "Socket disconnected");
        }

        const currentEncounterId = encounterConnectionManager.getEncounterIdBySocketId(socket.id);
        if (currentEncounterId !== null && currentEncounterId !== encounterId) {
          leaveTrackedEncounter(socket, currentEncounterId, userId);
        }

        joinEncounterRooms(socket, encounterId, Boolean(socket.data.user?.is_gm), userId);
        encounterConnectionManager.addUser(encounterId, socket.id);
        encounterEngineManager.clearInactivityTimeout(encounterId);

        return engine.snapshot();
      });

      console.log(`User ${socket.data.user?.username} joined encounter ${encounterId}`);
      callback?.({ success: true, encounterState });
    } catch (error) {
      handleLifecycleError(socket, callback, error, "Failed to join encounter");
    }
  });

  socket.on("encounter:leave", (data?: EncounterRoomData, ackCallback?: unknown) => {
    console.log("LEAVE", data);
    const callback = toCallback<SocketAck>(ackCallback);

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
