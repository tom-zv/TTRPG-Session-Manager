/**
 * Who may act on what, and what each person is shown.
 *
 * Acting rules are shared so the server enforces exactly what the client offers (`mayAdjustHp`,
 * `mayRunEntity`, `maySetHpValues`); the server applies them when it executes a command. Display rules
 * are applied by the client only: every client receives the full encounter state, and these
 * functions decide what to draw. They are a table convenience, not a secrecy boundary.
 */
import type { EncounterSettings } from "./settings.js";

/** The person looking at or acting on an encounter. */
export type EncounterViewer = {
  userId: number | undefined;
  isGm: boolean;
};

/** A GM controls everything; a player controls the entities assigned to them. */
export function controlsEntity(viewer: EncounterViewer, entity: { controllerUserIds?: number[] }): boolean {
  if (viewer.isGm) return true;
  return viewer.userId !== undefined && (entity.controllerUserIds ?? []).includes(viewer.userId);
}

/** A hidden entity is drawn for the GM only. */
export function isVisibleTo(viewer: EncounterViewer, entity: { hidden: boolean }): boolean {
  return viewer.isGm || !entity.hidden;
}

/**
 * The table policy for players (S4). A GM may do anything; a player only acts on the current
 * encounter while its combat runs (the server checks "current"; `running` here is the phase), and
 * only on entities in play: neither hidden nor in the grave. A buried entity is out of the fight
 * for players until the GM restores it.
 * - With at least one entity in play that they control, a player may damage or heal any entity in
 *   play. A player with none only watches.
 * - Initiative: their own entities in play.
 * - Current HP, temporary HP and death saves: their own entities in play whose HP they see exactly
 *   (every PC). An NPC whose HP is concealed (`visibility.monsterHp` status or hidden) takes values
 *   from the GM only; its player may still damage or heal it by an amount.
 * - Maximum HP, turns and everything else stay with the GM. A player's current HP never exceeds
 *   the maximum (`dnd5eEventAuth.ts`), since raising current HP above it would raise the maximum.
 */
export type ActingContext<TEntity extends PolicyEntity> = {
  isGm: boolean;
  running: boolean;
  /** Whether the viewer controls this entity. */
  controls: (entity: TEntity) => boolean;
  /** How much of this entity's HP the viewer is shown (`hpDisplayFor`). */
  hpDisplay: (entity: TEntity) => HpDisplay;
};

type PolicyEntity = { hidden: boolean; inGrave: boolean };

/** In the fight for players: drawn for them and not buried. */
export function isInPlay(entity: PolicyEntity): boolean {
  return !entity.hidden && !entity.inGrave;
}

/** Whether a player has a combatant of their own in play, which lets them deal damage and heal. */
export function hasControlledCombatant<TEntity extends PolicyEntity>(
  context: ActingContext<TEntity>,
  entities: readonly TEntity[],
): boolean {
  return entities.some((entity) => isInPlay(entity) && context.controls(entity));
}

/** `damage` and `heal`. */
export function mayAdjustHp<TEntity extends PolicyEntity>(
  context: ActingContext<TEntity>,
  entities: readonly TEntity[],
  target: TEntity,
): boolean {
  if (context.isGm) return true;
  return context.running && isInPlay(target) && hasControlledCombatant(context, entities);
}

/** `setInitiative`. */
export function mayRunEntity<TEntity extends PolicyEntity>(context: ActingContext<TEntity>, target: TEntity): boolean {
  if (context.isGm) return true;
  return context.running && isInPlay(target) && context.controls(target);
}

/** `setCurrentHp`, `setTempHp` and `setDeathSaves`: running the entity, with its HP shown exactly. */
export function maySetHpValues<TEntity extends PolicyEntity>(context: ActingContext<TEntity>, target: TEntity): boolean {
  if (context.isGm) return true;
  return mayRunEntity(context, target) && context.hpDisplay(target) === "exact";
}

/** How much of an entity's HP a viewer is shown. */
export type HpDisplay = "exact" | "status" | "hidden";

/**
 * Exact for the GM and for every player character. For NPCs and creatures the encounter's
 * `visibility.monsterHp` setting decides, also for a player who controls one.
 */
export function hpDisplayFor(
  viewer: EncounterViewer,
  entity: { role: string },
  settings: EncounterSettings
): HpDisplay {
  if (viewer.isGm || entity.role === "pc") return "exact";
  return settings.visibility.monsterHp;
}

/** The rough state shown in place of numbers. Bloodied means at or below half of maximum HP. */
export type HpStatus = "healthy" | "bloodied" | "down";

export const HP_STATUS_LABEL: Record<HpStatus, string> = {
  healthy: "Healthy",
  bloodied: "Bloodied",
  down: "Down",
};

export function getHpStatus(entity: { currentHp: number; maxHp: number }): HpStatus {
  if (entity.currentHp <= 0) return "down";
  return entity.currentHp * 2 <= entity.maxHp ? "bloodied" : "healthy";
}
