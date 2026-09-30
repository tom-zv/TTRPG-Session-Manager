import { 
  DnD5eEncounter, 
  DnD5eEncounterSummary, 
  DnD5eEncounterState,
  DnD5eEncounterDetails
} from "./dnd5e/encounter.js";

export const supportedSystems = ["dnd5e"] as const;

export type SystemType = (typeof supportedSystems)[number];

const SYSTEM_DISPLAY_NAMES: Record<SystemType, string> = {
  dnd5e: "D&D 5E",
};

export function isSupportedSystem(value: unknown): value is SystemType {
  return (
    typeof value === "string" &&
    supportedSystems.includes(value as SystemType)
  );
}

export function getSystemDisplayName(name: SystemType): string {
  return SYSTEM_DISPLAY_NAMES[name];
}

export function getSupportedSystems(): SystemType[] {
  return [...supportedSystems];
}

export type CoreEncounter = {
  id: number;
  system: SystemType;
  /** The campaign the encounter was created in. Fixed for the encounter's life. */
  campaignId: number;
  name: string;
  description: string;
  status: "planned" | "active" | "completed";
  location: string;
  difficulty: string;
  gmNotes?: { text: string; timestamp: string };
  createdAt: string;
  /** How many entities the encounter contains, counting every copy. Present in lists. */
  entityCount?: number;
};

/**
 * Where an encounter is in its life. Membership, HP and initiative can be changed in any phase;
 * turns only advance while running.
 * - setup: being prepared, combat has not started
 * - running: combat is in progress
 * - ended: combat is over; a reset returns it to setup
 */
export const ENCOUNTER_PHASES = ["setup", "running", "ended"] as const;
export type EncounterPhase = (typeof ENCOUNTER_PHASES)[number];

export function isEncounterPhase(value: unknown): value is EncounterPhase {
  return typeof value === "string" && ENCOUNTER_PHASES.includes(value as EncounterPhase);
}

/** The stored encounter status is derived from the phase and never set on its own. */
export const STATUS_BY_PHASE: Record<EncounterPhase, CoreEncounter["status"]> = {
  setup: "planned",
  running: "active",
  ended: "completed",
};

/**
 * Base interface for versioned encounter state
 * All stateful encounter types should extend this
 */
export interface BaseEncounterState {
  id: number;
  system: SystemType;
  version: number;
  phase: EncounterPhase;
}

// Helper types to extract encounter types based on system
export type EncounterBySystem<T extends SystemType> = T extends "dnd5e"
  ? DnD5eEncounter
  : CoreEncounter;

export type EncounterDetailsbySystem<T extends SystemType> = T extends "dnd5e"
  ? DnD5eEncounterDetails
  : CoreEncounter;

export type EncounterSummaryBySystem<T extends SystemType> = T extends "dnd5e"
  ? DnD5eEncounterSummary
  : Partial<CoreEncounter>;

export type EncounterStateBySystem<T extends SystemType> = T extends "dnd5e"
  ? DnD5eEncounterState
  : never;

// Union types for generic components that don't need system-specific type resolution
export type AnySystemEncounter = DnD5eEncounter;
export type AnySystemEncounterDetails = DnD5eEncounterDetails;
export type AnySystemEncounterSummary = DnD5eEncounterSummary;
export type AnySystemEncounterState = DnD5eEncounterState;
