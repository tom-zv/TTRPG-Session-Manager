import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { EncounterError, EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { EncounterMessages } from "shared/sockets/encounters/messages.js";
import { Namespace, Socket } from "socket.io";

export type EncounterInitData = {
  system: SystemType;
  encounterId: number;
};

export type EncounterRoomData = {
  encounterId: number;
};

export const getEncounterRoom = (encounterId: number): string => `encounter:${encounterId}`;

export const getEncounterGmRoom = (encounterId: number): string => `encounter:${encounterId}:gm`;

export const getEncounterPlayersRoom = (encounterId: number): string => `encounter:${encounterId}:players`;

export const getEncounterPlayerRoom = (encounterId: number, userId: number): string =>
  `encounter:${encounterId}:players:${userId}`;

export const emitEncounterError = (
  socket: Socket,
  code: EncounterErrorCode,
  message: string,
  commandId?: string
): void => {
  const payload: EncounterError = {
    code,
    message,
    commandId,
    timestamp: Date.now(),
  };

  socket.emit("error", payload);
};

export const emitEncounterCommand = (namespace: Namespace, command: EncounterCommand): void => {
  namespace.to(getEncounterRoom(command.encounterId)).emit(EncounterMessages.COMMAND, command);
};

export const emitEncounterEnded = (namespace: Namespace, encounterId: number): void => {
  namespace.to(getEncounterRoom(encounterId)).emit(EncounterMessages.END, { encounterId });
};

export const joinEncounterRooms = (socket: Socket, encounterId: number, isGm: boolean, userId: number): void => {
  socket.join(getEncounterRoom(encounterId));

  if (isGm) {
    socket.join(getEncounterGmRoom(encounterId));
  } else {
    socket.join(getEncounterPlayersRoom(encounterId));
  }

  socket.join(getEncounterPlayerRoom(encounterId, userId));
};

export const leaveEncounterRooms = (socket: Socket, encounterId: number, isGm: boolean, userId: number): void => {
  socket.leave(getEncounterRoom(encounterId));

  if (isGm) {
    socket.leave(getEncounterGmRoom(encounterId));
  } else {
    socket.leave(getEncounterPlayersRoom(encounterId));
  }

  socket.leave(getEncounterPlayerRoom(encounterId, userId));
};