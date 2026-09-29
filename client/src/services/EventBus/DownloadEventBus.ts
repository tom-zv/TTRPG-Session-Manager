import { AnyDownloadFileDTO } from "shared/DTO/audio/files.js";
import {
  DownloadEventType,
  DownloadItemErrorDTO,
  DownloadJobErrorDTO,
  DownloadMetadataDTO,
  DownloadProgressDTO,
} from "shared/DTO/downloadEvents.js";
import { SocketEvent } from "shared/sockets/types.js";
import type { Socket } from "socket.io-client";
import { AudioEventTypes, DOWNLOAD_NAMESPACE, disconnectSocket, getDownloadSocket } from "../SocketService/index.js";

const DOWNLOAD_EVENTS = [AudioEventTypes.FILE_DOWNLOAD_STATUS, AudioEventTypes.FILE_METADATA_FETCHED];

// Union type of all possible download event payloads
export type AnyDownloadPayload =
  | DownloadProgressDTO<AnyDownloadFileDTO>
  | DownloadItemErrorDTO<AnyDownloadFileDTO>
  | DownloadJobErrorDTO<AnyDownloadFileDTO>
  | DownloadMetadataDTO<AnyDownloadFileDTO>;

// Subscriber callback type
export type DownloadListener = (
  event: SocketEvent<DownloadEventType, AnyDownloadPayload>
) => void;

// Subscriber with filters
type Subscriber = {
  callback: DownloadListener;
  eventType?: DownloadEventType;
  downloadType?: "audio" | "image" | "document";
};

/** The first Sound Manager subscriber opens the socket. GM logout closes it. */
class DownloadEventBus {
  private socket: Socket | null = null;
  private subscribers: Subscriber[] = [];

  private readonly forward = (event: SocketEvent<DownloadEventType, AnyDownloadPayload>): void => {
    this.publish(event);
  };

  private ensureSocket(): void {
    if (this.socket) return;
    this.socket = getDownloadSocket();
    for (const eventType of DOWNLOAD_EVENTS) this.socket.on(eventType, this.forward);
  }

  /** Close the socket and drop every subscriber. */
  public stop(): void {
    this.subscribers = [];
    if (!this.socket) return;
    for (const eventType of DOWNLOAD_EVENTS) this.socket.off(eventType, this.forward);
    this.socket = null;
    disconnectSocket(DOWNLOAD_NAMESPACE);
  }

  /**
   * Publish an event to all relevant subscribers
   */
  public publish(
    event: SocketEvent<DownloadEventType, AnyDownloadPayload>
  ): void {
    const eventType = event.type;
    const payload = event.payload;

    this.subscribers.forEach((subscriber) => {
      // Check if subscriber wants this event type
      if (subscriber.eventType && subscriber.eventType !== eventType) {
        return;
      }

      // Check if subscriber wants this download type
      if (
        subscriber.downloadType &&
        subscriber.downloadType !== payload.downloadType
      ) {
        return;
      }

      // Event matches filters, notify subscriber
      subscriber.callback(event);
    });
  }

  /**
   * Subscribe to download events
   */
  public subscribe(
    callback: DownloadListener,
    options?: {
      eventType?: DownloadEventType;
      downloadType?: "audio" | "image" | "document";
    }
  ): () => void {
    const subscriber: Subscriber = {
      callback,
      eventType: options?.eventType,
      downloadType: options?.downloadType,
    };

    this.ensureSocket();
    this.subscribers.push(subscriber);

    // Return unsubscribe function
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== subscriber);
    };
  }
}

// Singleton instance
export const downloadEventBus = new DownloadEventBus();
