import { encounterEvent } from "shared/sockets/encounters/types.js";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";

export interface IRequestHandler {
  parseRequest(request: EncounterRequest): encounterEvent[];
}

export abstract class BaseRequestHandler<TState extends { version: number }> 
  implements IRequestHandler {

  constructor(
    protected state: TState,
  ) {}

  parseRequest(request: EncounterRequest): encounterEvent[] {
      const appliedEvents: encounterEvent[] = [];

      for (const event of request.requestedEvents) {
        const authoritativeEvent = this.validateEvent(event);
        this.applyEvent(authoritativeEvent);
        appliedEvents.push(structuredClone(authoritativeEvent));
      }

      return appliedEvents;
  }

  protected abstract validateEvent(event: encounterEvent): encounterEvent;
  protected abstract applyEvent(event: encounterEvent): void;
  protected abstract findEntity(entityId: number): unknown;
}
