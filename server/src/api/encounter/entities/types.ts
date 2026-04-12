
export interface CoreEntityDB {
  id: number;
  name: string;
  image_url?: string;
  created_at: string;
}

// Summary types for lightweight list display
export interface CoreEntitySummaryDB {
  id: number;
  name: string;
}
