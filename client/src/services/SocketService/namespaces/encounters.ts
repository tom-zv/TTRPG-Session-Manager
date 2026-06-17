import { Socket } from "socket.io-client";
import { getSocket } from "../socket.js";
import { EncounterSocketEvents } from "shared/sockets/encounters/socketEvents.js";
import {
  EncounterEvent,
  EncounterJoinAck,
  EncounterOperation,
  EncounterRequest,
} from "shared/sockets/encounters/types.js";
import { EncounterError } from "shared/sockets/encounters/errors.js";
import { SocketAck } from "shared/sockets/types.js";

export type EncounterRoomRequest = {
  encounterId: number;
};

type EncounterSocketRequest<TEvent = EncounterEvent> =
  | EncounterRequest<TEvent>
  | EncounterRoomRequest;

export interface EncounterDataCallbacks<TEvent = EncounterEvent> {
  onTemplateUpdated?: (payload: { templateId: number }) => void;
  applyOperation: (operation: EncounterOperation<TEvent>) => void;
  onError?: (error: EncounterError) => void;
  onEncounterEnd?: (payload: EncounterRoomRequest) => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
}

export class EncounterSocketService<TEvent = EncounterEvent> {
  private socket: Socket;
  private callbacks: EncounterDataCallbacks<TEvent>;
  private disposed = false;
  private sawDisconnect = false;
  private readonly handleOperation: (operation: EncounterOperation<TEvent>) => void;
  private readonly handleEncounterEnd: (payload: EncounterRoomRequest) => void;
  private readonly handleError: (error: EncounterError) => void;
  private readonly handleDisconnect: () => void;
  private readonly handleConnect: () => void;
  private readonly handleTemplateUpdated: (payload: { templateId: number }) => void;
  private readonly ACK_TIMEOUT_MS = 10_000;

  constructor(callbacks: EncounterDataCallbacks<TEvent>) {
    this.callbacks = callbacks;
    this.handleTemplateUpdated = (payload) => this.callbacks.onTemplateUpdated?.(payload);
    this.socket = getSocket("/encounter");

    this.handleOperation = (operation: EncounterOperation<TEvent>) => {
      this.callbacks.applyOperation(operation);
    };
    this.handleEncounterEnd = (payload: EncounterRoomRequest) => {
      this.callbacks.onEncounterEnd?.(payload);
    };
    this.handleError = (error: EncounterError) => {
      this.callbacks.onError?.(error);
    };
    this.handleDisconnect = () => {
      this.sawDisconnect = true;
      this.callbacks.onDisconnect?.();
    };
    this.handleConnect = () => {
      if (!this.sawDisconnect) {
        return;
      }

      this.sawDisconnect = false;
      this.callbacks.onReconnect?.();
    };

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on(EncounterSocketEvents.TEMPLATE_UPDATED, this.handleTemplateUpdated);
    this.socket.on(EncounterSocketEvents.OPERATION, this.handleOperation);

    this.socket.on(EncounterSocketEvents.END, this.handleEncounterEnd);

    this.socket.on("error", this.handleError);
    this.socket.on("disconnect", this.handleDisconnect);
    this.socket.on("connect", this.handleConnect);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.socket.off(EncounterSocketEvents.TEMPLATE_UPDATED, this.handleTemplateUpdated);
    this.socket.off(EncounterSocketEvents.OPERATION, this.handleOperation);
    this.socket.off(EncounterSocketEvents.END, this.handleEncounterEnd);
    this.socket.off("error", this.handleError);
    this.socket.off("disconnect", this.handleDisconnect);
    this.socket.off("connect", this.handleConnect);
  }

  /**
   * Join the encounter's room. The acknowledgement carries the current state, so this is also
   * how a client catches up after a reconnect or a gap in the operation stream.
   */
  join<TState>(encounterId: number): Promise<EncounterJoinAck<TState>> {
    return this.sendMessage<EncounterJoinAck<TState>>(EncounterSocketEvents.JOIN, { encounterId });
  }

  async sendMessage<TAck extends { success: boolean } = SocketAck>(
    messageType: EncounterSocketEvents,
    request?: EncounterSocketRequest<TEvent>
  ): Promise<TAck | { success: false; error: string }> {
    if (this.disposed) {
      return { success: false, error: "Encounter socket service is disposed" };
    }

    return new Promise((resolve) => {
      this.socket.timeout(this.ACK_TIMEOUT_MS).emit(
        messageType,
        request,
        (error: Error | null, ack?: TAck) => {
          if (error) {
            resolve({ success: false, error: "Encounter socket acknowledgement timed out" });
            return;
          }

          resolve(ack ?? { success: false, error: "Encounter socket acknowledgement missing" });
        }
      );
    });
  }

}
