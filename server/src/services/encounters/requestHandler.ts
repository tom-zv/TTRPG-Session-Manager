import { encounterEvent } from "shared/sockets/encounters/types.js";
import { EncounterRequest } from "shared/sockets/encounters/requests.js";
import { AppliedEventRecord } from "shared/sockets/encounters/types.js";

export interface IRequestHandler {
  parseRequest(request: EncounterRequest): AppliedEventRecord[];
}

export abstract class BaseRequestHandler<TState extends { version: number }> 
  implements IRequestHandler {

  constructor(
    protected state: TState,
  ) {}

  parseRequest(request: EncounterRequest): AppliedEventRecord[] {
      if (request.kind !== "apply") {
        return [];
      }

      const appliedEvents: AppliedEventRecord[] = [];

      // validate, apply, and generate inverse events for each requested event
      for (const event of request.requestedEvents) {
        const authoritativeEvent = this.validateEvent(event);
        this.applyEvent(authoritativeEvent);
        // todo: generate inverse events for undo functionality
        appliedEvents.push({
          event: structuredClone(authoritativeEvent),
          inverseEvents: [],
        });
      }

      return appliedEvents;
  }

  protected abstract validateEvent(event: encounterEvent): encounterEvent;
  protected abstract applyEvent(event: encounterEvent): void;
  protected abstract findEntity(entityId: number): unknown;
}
