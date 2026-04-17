import { Socket } from "socket.io-client";
import { getSocket } from "../socket.js";
import { EncounterMessages } from "shared/sockets/encounters/messages.js";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";
import { EncounterOperation } from "shared/sockets/encounters/types.js";
import { EncounterError } from "shared/sockets/encounters/errors.js";
import { SocketAck } from "shared/sockets/types.js";
import { SystemType } from "shared/domain/encounters/coreEncounter.js";

export type EncounterRoomRequest = {
  encounterId: number;
};

export type EncounterInitRequest = EncounterRoomRequest & {
  system: SystemType;
};

type EncounterSocketRequest = EncounterRequest | EncounterRoomRequest | EncounterInitRequest;

export interface EncounterDataCallbacks {
  applyOperation: (operation: EncounterOperation) => void;
  onError?: (error: EncounterError) => void;
  onEncounterEnd?: (payload: EncounterRoomRequest) => void;
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

    this.socket.on(EncounterMessages.END, (payload: EncounterRoomRequest) => {
      this.callbacks.onEncounterEnd?.(payload);
    });

    this.socket.on("error", (error: EncounterError) => {
      this.callbacks.onError?.(error);
    });
  }

  async sendMessage(
    messageType: EncounterMessages,
    request?: EncounterSocketRequest
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
