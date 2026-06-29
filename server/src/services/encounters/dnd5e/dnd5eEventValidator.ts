import { DnD5eEncounterEvent } from "shared/domain/encounters/dnd5e/events/types.js";
import { validateEncounterSettingsPatch } from "shared/domain/encounters/dnd5e/settings.js";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value: unknown): value is number => finite(value) && value >= 0;
const id = (value: unknown): value is number => nonNegative(value) && Number.isInteger(value);
const counter = (value: unknown): value is number => id(value) && value <= 3;

export function isDnD5eEvent(event: unknown): event is DnD5eEncounterEvent {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;
  if (!e.values || typeof e.values !== "object" || Array.isArray(e.values)) return false;
  const values = e.values as Record<string, unknown>;
  switch (e.type) {
    case "addEntity":
      return id(values.templateId) && typeof values.name === "string" && values.name.trim().length > 0 &&
        nonNegative(values.hp) && values.hp > 0 && (values.hidden === undefined || typeof values.hidden === "boolean");
    case "setHidden": return id(values.targetId) && typeof values.hidden === "boolean";
    case "removeEntity": return id(values.instanceId);
    case "startCombat":
    case "endCombat":
    case "nextTurn":
    case "resetEncounter": return true;
    case "moveToGrave": return id(values.targetId);
    case "restoreFromGrave": return id(values.targetId) && nonNegative(values.hp);
    case "setDeathSaves": return id(values.targetId) && counter(values.successes) && counter(values.failures);
    case "updateEncounterSettings":
      try { validateEncounterSettingsPatch(values.patch); return true; }
      catch { return false; }
    case "damage":
    case "heal": return id(values.targetId) && id(values.sourceId) && nonNegative(values.amount);
    case "setHp":
    case "setCurrentHp": return id(values.targetId) && nonNegative(values.hp);
    case "setTempHp": return id(values.targetId) && id(values.sourceId) && nonNegative(values.tempHp);
    case "setInitiative": return id(values.targetId) && finite(values.initiative);
    default: return false;
  }
}

export function validateDnD5eEvent(event: DnD5eEncounterEvent): DnD5eEncounterEvent {
  if (!isDnD5eEvent(event)) throw new Error("Invalid DnD5e event: unsupported fields or values");
  return event;
}
