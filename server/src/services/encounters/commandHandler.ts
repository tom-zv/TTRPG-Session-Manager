import { EncounterCommand } from "shared/sockets/encounters/commands.js";
import { AnySystemEncounterEvent } from "shared/sockets/encounters/types.js";

export interface ICommandHandler {
  parseCommand(cmd: EncounterCommand): void;
}

export abstract class BaseCommandHandler<TState extends { version: number }> 
  implements ICommandHandler {

  constructor(
    protected state: TState,
    protected logEvent: (event: AnySystemEncounterEvent) => void,
  ) {}

  parseCommand(cmd: EncounterCommand): void {
      const event = cmd.event as AnySystemEncounterEvent;
      event.version = this.state.version;

      this.applyEvent(event);
      this.logEvent(event);
  }

  protected abstract applyEvent(event: AnySystemEncounterEvent): void;
  protected abstract findEntity(entityId: number): unknown;
}
