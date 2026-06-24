
export interface CoreEntityDB {
  id: number;
  name: string;
  image_url?: string;
  created_at: string;
  /** Read-only: users assigned to this entity in core.user_entities (a JSON array, or NULL for none). */
  controller_user_ids?: unknown;
}

// Summary types for lightweight list display
export interface CoreEntitySummaryDB {
  id: number;
  name: string;
}
