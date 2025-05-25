import {
  AnyDownloadFileDTO,
  DownloadEventType,
  DownloadItemErrorDTO,
  DownloadJobErrorDTO,
  DownloadMetadataDTO,
  DownloadProgressDTO,
} from "shared/DTO/files.js";
import { SocketEvent } from "shared/sockets/types.js";
import { AudioEventTypes, getDownloadSocket } from "../SocketService/index.js";

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

class DownloadEventBus {
  private socket = getDownloadSocket();
  private subscribers: Subscriber[] = [];

  constructor() {
    this.registerSocketEvents([
      AudioEventTypes.FILE_DOWNLOAD_STATUS,
      AudioEventTypes.FILE_METADATA_FETCHED,
    ]);
  }

  private registerSocketEvents(eventTypes: string[]): void {
    eventTypes.forEach((eventType) => {
      this.socket.on(
        eventType,
        (event: SocketEvent<DownloadEventType, AnyDownloadPayload>) => {
          this.publish(event);
        }
      );
    });
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

    this.subscribers.push(subscriber);

    // Return unsubscribe function
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== subscriber);
    };
  }
}

// Singleton instance
export const downloadEventBus = new DownloadEventBus();
