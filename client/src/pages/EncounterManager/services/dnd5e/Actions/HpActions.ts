import { DnD5eLocalStateManager } from "../DnD5eLocalStateManager.js";

export class DnD5eHpActions {
  constructor(
    private stateManager: DnD5eLocalStateManager,
    private encounterId: number
  ) {}

  damage(sourceId: number, entityId: number, amount: number): void {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "damage",
      values: { targetId: entityId, amount, sourceId}
    });
  }

  heal(sourceId:number, entityId: number, amount: number): void {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "heal",
      values: { targetId: entityId, amount, sourceId},
    });
  }

  setHp(entityId: number, hp: number): void {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "setHp",
      values: { targetId: entityId, hp },
    });
  }

  setCurrentHp(entityId: number, hp: number): void {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "setCurrentHp",
      values: { targetId: entityId, hp },
    });
  }

  setTempHp(sourceId: number, entityId: number, tempHp: number): void {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "setTempHp",
      values: { targetId: entityId, tempHp, sourceId },
    });
  }
}