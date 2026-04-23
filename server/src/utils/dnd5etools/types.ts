import type { DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";

export interface Dnd5eToolsMonster {
  [key: string]: unknown;
  name?: string;
  source?: string;
  page?: number;
}

export interface EntityTagDB {
  tag_type: string;
  tag: string;
}

export interface Dnd5eToolsEntityImportPayload {
  entity: Omit<DnD5eEntityDB, "id" | "created_at">;
  tags: EntityTagDB[];
  source?: string;
  page?: number;
  warnings: string[];
}
