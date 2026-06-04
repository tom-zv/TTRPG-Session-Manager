import { encounterEvent } from "shared/sockets/encounters/types.js";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { UserDB } from "src/api/users/types.js";

export interface IRequestHandler {
  parseRequest(request: EncounterRequest, user: UserDB): Promise<encounterEvent[]>;
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

  async parseRequest(request: EncounterRequest, user: UserDB): Promise<encounterEvent[]> {
      const validatedEvents = request.requestedEvents.map((event) => this.validateEvent(event));

      this.eventAuthorizer.authorizeEvents(validatedEvents, user);
      await this.prepareEvents(validatedEvents);

      const appliedEvents: encounterEvent[] = [];

      for (const event of validatedEvents) {
        appliedEvents.push(...structuredClone(this.applyValidatedEvent(event)));
      }

      return appliedEvents;
  }

  protected async prepareEvents(_events: encounterEvent[]): Promise<void> {}

  protected applyValidatedEvent(event: encounterEvent): encounterEvent[] {
    this.applyEvent(event);
    return [event];
  }

  protected abstract validateEvent(event: encounterEvent): encounterEvent;
  protected abstract applyEvent(event: encounterEvent): void;
  protected abstract findEntity(entityId: number): unknown;
}
