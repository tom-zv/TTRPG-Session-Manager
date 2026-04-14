import { Socket } from "socket.io-client";
import { getSocket } from "../socket.js";
import { EncounterMessages } from "shared/sockets/encounters/messages.js";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
import { SocketAck } from "shared/sockets/types.js";

export interface EncounterDataCallbacks {
  applyOperation: (operation: EncounterOperation) => void;
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
    this.socket.on(EncounterMessages.REQUEST, (operation: EncounterOperation) => {
       this.callbacks.applyOperation(operation);
    });
  }

  async sendMessage(
    messageType: EncounterMessages,
    request?: EncounterRequest
  ): Promise<SocketAck> {
    return new Promise((resolve) => {
      this.socket.emit(
        messageType,
        request,
        
        (ack: SocketAck) => {
          resolve(ack);
        }
      );
    });
  }

}
