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
  getCampaignRoom,
  joinEncounterRooms,
  leaveEncounterRooms,
} from "./encounterTransport.js";
import campaignService from "src/api/campaigns/campaignService.js";
import { NotFoundError } from "src/api/HttpErrors.js";
import { CampaignSocketEvents, CampaignWatchRequest } from "shared/sockets/campaigns/types.js";
import { assertMayJoin } from "./encounterAccess.js";

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

/**
 * Each socket has at most one pending join. A newer join, or a leave of the pending encounter,
 * supersedes it, so a slow join of an old board can never move the socket out of a newer one, and
 * its failure is never reported as the newer session's.
 */
type PendingJoin = { encounterId: number; generation: number };
const pendingJoins = new WeakMap<Socket, PendingJoin>();
let joinGeneration = 0;

class JoinSupersededError extends Error {
  constructor() {
    super("Join superseded");
  }
}

const isCurrentJoin = (socket: Socket, pending: PendingJoin): boolean => pendingJoins.get(socket) === pending;

/** Campaign watches follow the same rule: only the newest watch of a socket may join its room. */
const watchGenerations = new WeakMap<Socket, number>();
let watchGeneration = 0;

const requireCampaignId = (data: CampaignWatchRequest | undefined): number => {
  const campaignId = data?.campaignId;
  if (typeof campaignId !== "number" || !Number.isInteger(campaignId) || campaignId <= 0) {
    throw new EncounterHandlerError(EncounterErrorCode.INVALID_REQUEST, "Missing campaignId");
  }
  return campaignId;
};

const leaveCampaignRooms = (socket: Socket): void => {
  for (const room of socket.rooms) {
    if (/^campaign:\d+$/.test(room)) void socket.leave(room);
  }
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

    let pending: PendingJoin | undefined;
    try {
      const userId = requireAuthenticatedUserId(socket);
      const encounterId = requireEncounterId(data);
      const joining: PendingJoin = { encounterId, generation: ++joinGeneration };
      pending = joining;
      pendingJoins.set(socket, joining);

      // Refuses early, so that a join without access never loads an engine.
      await assertMayJoin(socket.data.user, encounterId);

      const encounterState = await encounterRequestQueue.enqueue(encounterId, async () => {
        const engine = await encounterEngineManager.getOrLoadEngine(encounterId);

        try {
          // Admission: a reset queued ahead of this join, or a start elsewhere, may have changed
          // the selection since the first check. No await may follow before the room is joined.
          if (isCurrentJoin(socket, joining)) await assertMayJoin(socket.data.user, encounterId);
          if (socket.disconnected) {
            throw new EncounterHandlerError(EncounterErrorCode.REQUEST_FAILED, "Socket disconnected");
          }
          if (!isCurrentJoin(socket, joining)) throw new JoinSupersededError();
        } catch (error) {
          // Loading cleared the idle timeout; restart it when this join leaves the engine unused.
          if (encounterConnectionManager.getUserCount(encounterId) === 0) {
            encounterEngineManager.startInactivityTimeout(encounterId);
          }
          throw error;
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
      // Only the abandoned join's own caller hears about it; the socket's newer session must not.
      if (pending && !isCurrentJoin(socket, pending)) {
        const message = error instanceof Error ? error.message : "Failed to join encounter";
        callback?.({ success: false, error: message });
        return;
      }
      handleLifecycleError(socket, callback, error, "Failed to join encounter");
    } finally {
      if (pending && isCurrentJoin(socket, pending)) pendingJoins.delete(socket);
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
      // Leaving an encounter also abandons a join of it that is still pending.
      const pendingJoin = pendingJoins.get(socket);
      if (pendingJoin && (requestedEncounterId === null || pendingJoin.encounterId === requestedEncounterId)) {
        pendingJoins.delete(socket);
      }
      // A leave of another encounter than the tracked one (a late leave of an old board) is a no-op.
      const encounterId = requestedEncounterId === null || requestedEncounterId === trackedEncounterId
        ? trackedEncounterId
        : null;

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

  // A player's client watches its selected campaign for changes of the current encounter. One
  // watch per socket: a new watch replaces the previous one. Access is checked on every watch.
  socket.on(CampaignSocketEvents.WATCH, async (data: CampaignWatchRequest | undefined, ackCallback?: unknown) => {
    const callback = toCallback<SocketAck>(ackCallback);
    const generation = ++watchGeneration;
    watchGenerations.set(socket, generation);

    try {
      requireAuthenticatedUserId(socket);
      const campaignId = requireCampaignId(data);
      try {
        await campaignService.assertCampaignAccess(socket.data.user, campaignId);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new EncounterHandlerError(EncounterErrorCode.NOT_AUTHORIZED, error.message);
        }
        throw error;
      }
      if (watchGenerations.get(socket) !== generation) {
        throw new EncounterHandlerError(EncounterErrorCode.REQUEST_FAILED, "Watch superseded");
      }
      leaveCampaignRooms(socket);
      await socket.join(getCampaignRoom(campaignId));
      callback?.({ success: true });
    } catch (error) {
      // Answered through the acknowledgement only: a failed watch says nothing about the board.
      callback?.({ success: false, error: error instanceof Error ? error.message : "Failed to watch campaign" });
    }
  });

  socket.on(CampaignSocketEvents.UNWATCH, (data: CampaignWatchRequest | undefined, ackCallback?: unknown) => {
    const callback = toCallback<SocketAck>(ackCallback);
    watchGenerations.set(socket, ++watchGeneration);
    const campaignId = data?.campaignId;
    if (typeof campaignId === "number") void socket.leave(getCampaignRoom(campaignId));
    else leaveCampaignRooms(socket);
    callback?.({ success: true });
  });
};
