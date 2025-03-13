

import type { AudioItem } from "../../types/index.js";
export type { AudioItem };

export interface AudioItemActions {
  onItemClick?: (itemId: number) => void;
  onPlayItem?: (itemId: number) => void;
  onEditItem?: (itemId: number) => void;
  onRemoveItem?: (itemId: number) => void;
}

export interface AudioItemDisplayProps extends AudioItemActions {
  items: AudioItem[];
  isLoading?: boolean;
  error?: string | null;
  view?: "grid" | "list";
  showToggle?: boolean | null;
  showActions?: boolean | null;
  title?: string;
  onSelectItem?: (itemId: number) => void;
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}