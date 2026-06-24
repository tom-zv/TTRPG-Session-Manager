import { encounterEvent } from "shared/sockets/encounters/types.js";
import { EncounterRequest } from "shared/sockets/encounters/types.js";
import { UserDB } from "src/api/users/types.js";

export interface IRequestHandler {
  parseRequest(request: EncounterRequest, user: UserDB): Promise<encounterEvent[]>;
}

export abstract class BaseRequestHandler<TState extends { version: number }> 
  implements IRequestHandler {

  constructor(
    protected state: TState,
  ) {}

  async parseRequest(request: EncounterRequest, user: UserDB): Promise<encounterEvent[]> {
      const validatedEvents = request.requestedEvents.map((event) => this.validateEvent(event));

      // Authorization may depend on data loaded for the events (who controls an entity).
      await this.prepareEvents(validatedEvents, user);
      this.authorizeEvents(validatedEvents, user);

      const appliedEvents: encounterEvent[] = [];

      for (const event of validatedEvents) {
        appliedEvents.push(...structuredClone(this.applyValidatedEvent(event)));
      }

      return appliedEvents;
  }

  protected async prepareEvents(_events: encounterEvent[], _user: UserDB): Promise<void> {}

  protected applyValidatedEvent(event: encounterEvent): encounterEvent[] {
    this.applyEvent(event);
    return [event];
  }

  protected abstract validateEvent(event: encounterEvent): encounterEvent;
  /** Throws `EncounterAuthorizationError` when the user may not perform one of the events. */
  protected abstract authorizeEvents(events: encounterEvent[], user: UserDB): void;
  protected abstract applyEvent(event: encounterEvent): void;
  protected abstract findEntity(entityId: number): unknown;
}
