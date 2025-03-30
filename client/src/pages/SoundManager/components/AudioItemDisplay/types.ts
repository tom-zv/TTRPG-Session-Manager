import type { AudioItem, CollectionType } from "../../types/index.js";
import type { DragDropProps } from "src/types/index.js";
export * from "../../types/index.js";

export interface AudioItemActions {
  // Selection and navigation actions
  onItemClick?: (itemId: number) => void;
  onPlayItem?: (itemId: number) => void;
  onEditItem?: (itemId: number, params: any) => void;
  
  // Collection modification actions
  onAddItems?: (items: AudioItem[], position?: number) => void;
  onRemoveItems?: (itemIds: number[]) => void;
  onUpdateItemPosition?: (
    itemId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number
  ) => Promise<void>;
}

export interface AudioItemDisplayProps extends AudioItemActions, DragDropProps {
  // Data props
  items: AudioItem[];
  collectionType: CollectionType | "macro";
  name?: string;
  
  // UI state props
  isLoading?: boolean;
  isSelectable?: boolean;
  error?: string | null;
  view?: "grid" | "list";
  showHeaders?: boolean;
  showToggle?: boolean;
  showActions?: boolean | null;
  showPlayButton?: boolean;
  
  // Render customization
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}