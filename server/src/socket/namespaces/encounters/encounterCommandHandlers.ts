import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { EncounterErrorCode } from "shared/sockets/encounters/errors.js";
import { Namespace, Socket } from "socket.io";
import encounterCommandQueue from "src/services/encounters/encounterCommandQueue.js";
import encounterConnectionManager from "src/services/encounters/encounterConnectionManager.js";
import encounterEngineManager from "src/services/encounters/encounterEngineManager.js";
import { validateCommand, validateUser } from "./encounterCommandValidator.js";
import { EncounterHandlerError } from "./encounterHandlerError.js";
import encounterRateLimiter from "./encounterRateLimiter.js";
import { emitEncounterCommand, emitEncounterError } from "./encounterTransport.js";

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
      "Join the encounter before sending commands"
    );
  }
};

export const registerEncounterCommandHandlers = (namespace: Namespace, socket: Socket): void => {
  socket.on("encounter:command", async (command: EncounterCommand) => {
    console.log("COMMAND", command);

    try {
      const commandValidation = validateCommand(command);
      if (!commandValidation.valid) {
        throw new EncounterHandlerError(commandValidation.code, commandValidation.error);
      }

      const userValidation = validateUser(socket);
      if (!userValidation.valid) {
        throw new EncounterHandlerError(userValidation.code, userValidation.error);
      }

      assertSocketJoinedEncounter(socket, command.encounterId);

      const userId = socket.data.user.id;
      if (encounterRateLimiter.isRateLimited(String(userId))) {
        throw new EncounterHandlerError(
          EncounterErrorCode.RATE_LIMITED,
          "Too many commands, slow down"
        );
      }

      await encounterCommandQueue.enqueue(command.encounterId, async () => {
        const encounterEngine = getEncounterEngine(command.encounterId);
        await encounterEngine.dispatch(command);
      });

      emitEncounterCommand(namespace, command);
    } catch (error) {
      if (error instanceof EncounterHandlerError) {
        emitEncounterError(socket, error.code, error.message, command.commandId);
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Failed to process command";
      emitEncounterError(
        socket,
        EncounterErrorCode.COMMAND_FAILED,
        errorMessage,
        command.commandId
      );
    }
  });
};
