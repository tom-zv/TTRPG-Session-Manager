import { Socket } from "socket.io-client";
import { getSocket } from "../socket.js";
import { EncounterMessages } from "shared/sockets/encounters/messages.js";
import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { AnySystemEncounterEvent } from "shared/sockets/encounters/types.js";
import { SocketAck } from "shared/sockets/types.js";

export interface EncounterDataCallbacks {
  applyEvent: (event: AnySystemEncounterEvent) => void;
}

export class EncounterSocketService {
  private socket: Socket;
  private callbacks: EncounterDataCallbacks;

  constructor(callbacks: EncounterDataCallbacks) {
    this.callbacks = callbacks;
    this.socket = getSocket("/encounter");
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on(EncounterMessages.COMMAND, (command: EncounterCommand) => {
       this.callbacks.applyEvent(command.event);
    });
  }

  async sendMessage(
    messageType: EncounterMessages,
    command?: EncounterCommand
  ): Promise<SocketAck> {
    return new Promise((resolve) => {
      this.socket.emit(
        messageType,
        command,
        
        (ack: SocketAck) => {
          resolve(ack);
        }
      );
    });
  }

}
