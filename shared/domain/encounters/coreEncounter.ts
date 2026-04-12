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
  name: string;
  description: string;
  status: "planned" | "active" | "completed";
  location: string;
  difficulty: string;
  gmNotes?: { text: string; timestamp: string };
  createdAt: string;
};

/**
 * Base interface for versioned encounter state
 * All stateful encounter types should extend this
 */
export interface BaseEncounterState {
  id: number;
  system: SystemType;
  version: number;
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
