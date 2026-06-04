import type { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";

export class DnD5eCombatActions {
  constructor(private emitEvent: (event: DnD5eEncounterEvent) => void) {}

  moveToGrave = (targetId: number): void => {
    this.emitEvent({ type: "moveToGrave", values: { targetId } });
  };

  restoreFromGrave = (targetId: number, hp: number): void => {
    this.emitEvent({ type: "restoreFromGrave", values: { targetId, hp } });
  };

  setDeathSaves = (targetId: number, successes: number, failures: number): void => {
    this.emitEvent({ type: "setDeathSaves", values: { targetId, successes, failures } });
  };
}
