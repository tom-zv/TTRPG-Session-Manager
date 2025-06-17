import { AudioItem } from "../../types/AudioItem.js";
export * from "../../types/AudioItem.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import { CollectionType } from "shared/audio/types.js";

// Audio Item Actions
export interface AudioItemActions {
  addItems?: (items: AudioItem[], position?: number, isMacro?: boolean) => void;
  //useEditItem?: (X: any) => void;
  removeItems?: ((items: AudioItem[]) => void);
  editItem?: (itemId: number, data: Partial<AudioItem>) => void;
  updateItemPosition?: ( 
    itemId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number, 
  ) => void;
  onItemClick?: (id: number) => void;
}

export interface CollectionItemsDisplayProps extends AudioItemActions, DragDropProps {
  // Data props
  collectionId: number;
  collectionType: CollectionType;
  // UI state props
  isSelectable?: boolean;
  view?: "grid" | "list";
  showHeaders?: boolean;
  showToggle?: boolean;
  showActions?: boolean;
  showPlayButton?: boolean;
}