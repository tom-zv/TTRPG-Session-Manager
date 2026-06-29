import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import type { EncounterSettingsPatch } from "shared/domain/encounters/dnd5e/settings.js";

type EmitEvent = (event: DnD5eEncounterEvent) => void;

export class DnD5eGlobalActions {
  updateEncounterSettings = (patch: EncounterSettingsPatch): void => {
    this.emitEvent({ type: "updateEncounterSettings", values: { patch } });
  };
  constructor(
    private emitEvent: EmitEvent,
  ) {}

  /** `hidden` adds the entity without showing it to players, for example waiting reinforcements. */
  addEntity = (templateId: number, name: string, hp: number, hidden = false): void => {
    this.emitEvent({
      type: "addEntity",
      values: { templateId, name, hp, ...(hidden ? { hidden: true } : {}) },
    });
  };

  removeEntity = (instanceId: number): void => {
    this.emitEvent({
      type: "removeEntity",
      values: { instanceId },
    });
  };

  startCombat = (): void => {
    this.emitEvent({ type: "startCombat", values: {} });
  };

  endCombat = (): void => {
    this.emitEvent({ type: "endCombat", values: {} });
  };

  nextTurn = (): void => {
    this.emitEvent({
      type: "nextTurn",
      values: {},
    });
  };

  resetEncounter = (): void => {
    this.emitEvent({
      type: "resetEncounter",
      values: {},
    });
  };

}
