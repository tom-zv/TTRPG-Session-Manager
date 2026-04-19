import { Socket } from "socket.io-client";
import { getSocket } from "../socket.js";
import { EncounterSocketEvents } from "shared/sockets/encounters/socketEvents.js";
import { EncounterOperation, EncounterRequest } from "shared/sockets/encounters/types.js";
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
  private readonly handleOperation: (operation: EncounterOperation) => void;
  private readonly handleEncounterEnd: (payload: EncounterRoomRequest) => void;
  private readonly handleError: (error: EncounterError) => void;

  constructor(callbacks: EncounterDataCallbacks) {
    this.callbacks = callbacks;
    this.socket = getSocket("/encounter");

    this.handleOperation = (operation: EncounterOperation) => {
      this.callbacks.applyOperation(operation);
    };
    this.handleEncounterEnd = (payload: EncounterRoomRequest) => {
      this.callbacks.onEncounterEnd?.(payload);
    };
    this.handleError = (error: EncounterError) => {
      this.callbacks.onError?.(error);
    };

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on(EncounterSocketEvents.OPERATION, this.handleOperation);

    this.socket.on(EncounterSocketEvents.END, this.handleEncounterEnd);

    this.socket.on("error", this.handleError);
  }

  dispose(): void {
    this.socket.off(EncounterSocketEvents.OPERATION, this.handleOperation);
    this.socket.off(EncounterSocketEvents.END, this.handleEncounterEnd);
    this.socket.off("error", this.handleError);
  }

  async sendMessage(
    messageType: EncounterSocketEvents,
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
