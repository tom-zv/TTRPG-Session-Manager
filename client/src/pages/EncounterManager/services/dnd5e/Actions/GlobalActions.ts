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

  addEntity = (templateId: number, name: string, hp: number): void => {
    this.emitEvent({
      type: "addEntity",
      values: { templateId, name, hp },
    });
  };

  removeEntity = (instanceId: number): void => {
    this.emitEvent({
      type: "removeEntity",
      values: { instanceId },
    });
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
