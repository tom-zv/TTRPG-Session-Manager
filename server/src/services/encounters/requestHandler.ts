import { encounterEvent } from "shared/sockets/encounters/types.js";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";
import { UserDB } from "src/api/users/types.js";

export interface IRequestHandler {
  parseRequest(request: EncounterRequest, user: UserDB): encounterEvent[];
}

export interface IEventAuthorizer {
  authorizeEvents(events: encounterEvent[], user: UserDB): void;
}

export abstract class BaseRequestHandler<TState extends { version: number }> 
  implements IRequestHandler {

  constructor(
    protected state: TState,
    protected eventAuthorizer: IEventAuthorizer,
  ) {}

  parseRequest(request: EncounterRequest, user: UserDB): encounterEvent[] {
      const validatedEvents = request.requestedEvents.map((event) => this.validateEvent(event));

      this.eventAuthorizer.authorizeEvents(validatedEvents, user);

      const appliedEvents: encounterEvent[] = [];

      for (const event of validatedEvents) {
        this.applyEvent(event);
        appliedEvents.push(structuredClone(event));
      }

      return appliedEvents;
  }

  protected abstract validateEvent(event: encounterEvent): encounterEvent;
  protected abstract applyEvent(event: encounterEvent): void;
  protected abstract findEntity(entityId: number): unknown;
}
