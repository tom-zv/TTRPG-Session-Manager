import { AudioItem } from "../../types/AudioItem.js";
export * from "../../types/AudioItem.js";
import { DragDropProps } from "src/types/dragDropProps.js";
import { CollectionType } from "../CollectionView/types.js";

// Audio Item Actions
export interface AudioItemActions {
  useAddItems?: (items: AudioItem[], position?: number, isMacro?: boolean) => void;
  //useEditItem?: (X: any) => void;
  useRemoveItems?: ((items: AudioItem[]) => void);
  useEditItem?: (itemId: number, data: Partial<AudioItem>) => void;
  useUpdateItemPosition?: ( 
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
  // Customization
  renderSpecialItem?: (item: AudioItem) => React.ReactNode;
}