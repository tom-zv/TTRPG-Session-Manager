import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";

type EmitEvent = (event: DnD5eEncounterEvent) => void;

export class DnD5eHpActions {
  constructor(
    private emitEvent: EmitEvent,
  ) {}

  damage(sourceId: number, entityId: number, amount: number): void {
    this.emitEvent({
      type: "damage",
      values: { targetId: entityId, amount, sourceId}
    });
  }

  heal(sourceId:number, entityId: number, amount: number): void {
    this.emitEvent({
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