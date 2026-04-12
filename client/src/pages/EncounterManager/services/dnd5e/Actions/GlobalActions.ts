import { DnD5eLocalStateManager } from "../DnD5eLocalStateManager.js";

export class DnD5eGlobalActions {
  constructor(
    private stateManager: DnD5eLocalStateManager,
    private encounterId: number
  ) {}

  addEntity = (templateId: number, name: string, hp: number): void => {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "addEntity",
      values: { templateId, name, hp },
    });
  };

  removeEntity = (instanceId: number): void => {
    this.stateManager.applyLocalEvent(this.encounterId, {
      type: "removeEntity",
      values: { instanceId },
    });
  };

}
