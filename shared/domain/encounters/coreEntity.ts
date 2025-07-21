import type { DnD5eEntity } from "./dnd5e/entity.js";

export interface CoreEntity {
  id: number;
  name: string;
  imageUrl?: string;
  createdAt: string;
}

// Union type for all entity types
export type Entity = 
  | (CoreEntity & { system: 'core' })
  | (DnD5eEntity & { system: 'dnd5e' });