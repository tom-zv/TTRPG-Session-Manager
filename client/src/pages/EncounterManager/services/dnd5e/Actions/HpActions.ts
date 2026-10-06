import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";

/** Resolves true once the server applied the event, false when it was rejected (already reported). */
type SendEvent = (event: DnD5eEncounterEvent) => Promise<boolean>;

export class DnD5eHpActions {
  constructor(
    private sendEvent: SendEvent,
  ) {}

  private emitEvent(event: DnD5eEncounterEvent): void {
    void this.sendEvent(event);
  }

  /** Resolves whether the damage applied, for feedback that does not depend on seeing the HP. */
  damage(sourceId: number, entityId: number, amount: number): Promise<boolean> {
    return this.sendEvent({
      type: "damage",
      values: { targetId: entityId, amount, sourceId}
    });
  }

  heal(sourceId: number, entityId: number, amount: number): Promise<boolean> {
    return this.sendEvent({
      type: "heal",
      values: { targetId: entityId, amount, sourceId},
    });
  }

  setHp(entityId: number, hp: number): void {
    this.emitEvent({
      type: "setHp",
      values: { targetId: entityId, hp },
    });
  }

  setCurrentHp(entityId: number, hp: number): void {
    this.emitEvent({
      type: "setCurrentHp",
      values: { targetId: entityId, hp },
    });
  }

  setTempHp(sourceId: number, entityId: number, tempHp: number): void {
    this.emitEvent({
      type: "setTempHp",
      values: { targetId: entityId, tempHp, sourceId },
    });
  }
}