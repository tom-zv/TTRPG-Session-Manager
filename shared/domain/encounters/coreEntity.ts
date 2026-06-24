import { SystemType } from "./coreEncounter.js";
import type { 
  DnD5eEntityDetails, 
  DnD5eEntitySummary, 
  DnD5eEntityState,
  DnD5eEntity 
} from "./dnd5e/entity.js";

export interface CoreEntity {
  templateId: number; // ID of the base entity template/details
  name: string;
  imageUrl?: string;
  createdAt: string;
  /** Users who may run this entity in an encounter, besides the GM. Set through its own endpoint. */
  controllerUserIds?: number[];
}

// Union types for all entity types
export type AnySystemEntityDetails = DnD5eEntityDetails;
export type AnySystemEntitySummary = DnD5eEntitySummary;
export type AnySystemEntityState = DnD5eEntityState;
export type AnySystemEntity = DnD5eEntity;

// Helper types to extract entity types based on system
export type EntityDetailsBySystem<T extends SystemType> = T extends 'dnd5e' ? DnD5eEntityDetails : CoreEntity;
export type EntitySummaryBySystem<T extends SystemType> = T extends 'dnd5e' ? DnD5eEntitySummary : CoreEntity;
export type EntityStateBySystem<T extends SystemType> = T extends 'dnd5e' ? DnD5eEntityState : never;
export type EntityBySystem<T extends SystemType> = T extends 'dnd5e' ? DnD5eEntity : CoreEntity;