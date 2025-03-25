import type { AudioItem } from "../../types/index.js";
import type { DragDropProps } from "src/types/index.js";
export type { AudioItem };

export type CollectionType = 'playlist' | 'sfx' | 'ambience' | 'pack';

// Props for the CollectionEditView component
export interface CollectionEditViewProps extends DragDropProps {
  // Display metadata
  collectionName: string;
  collectionType: CollectionType;

  // Data fetching
  fetchCollections: () => Promise<AudioItem[]>;
  fetchCollectionItems?: (collectionId: number) => Promise<AudioItem[]>;
  fetchAvailableItems?: (collectionId?: number) => Promise<AudioItem[]>;

  // Collection operations
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onUpdateCollection?: (collection: AudioItem) => Promise<boolean>;
  onDeleteCollection?: (collectionId: number) => Promise<boolean>;

  // Item operations
  onAddItems?: (collectionId: number, itemIds: number[], position?: number) => Promise<boolean>;
  onRemoveItems?: (collectionId: number, itemIds: number[]) => Promise<boolean>;
  onUpdateItemPosition?: (
    collectionId: number,
    itemId: number, // Changed from audioFileId for consistency
    targetPosition: number, // Changed from newPosition for consistency
    sourceStartPosition?: number,
    sourceEndPosition?: number,
  ) => Promise<boolean>;
}

