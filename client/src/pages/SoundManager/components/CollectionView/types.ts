import type { AudioCollection, AudioItem } from "../../types/index.js";
import type { DragDropProps } from "src/types/index.js";
export * from "../../types/index.js";

export type CollectionType = 'playlist' | 'sfx' | 'ambience' | 'pack' | 'macro';

// Props for the CollectionView component
export interface CollectionViewProps extends DragDropProps {
  // Display metadata
  collectionType: CollectionType;
  collectionName?: string;

  // Data fetching
  fetchCollections?: () => Promise<AudioCollection[]>;
  fetchCollectionItems?: (collectionId: number) => Promise<AudioItem[]>;
  fetchAvailableItems?: (collectionId?: number) => Promise<AudioItem[]>;

  // Collection operations
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onUpdateCollection?: (collection: AudioCollection) => Promise<boolean>;
  onDeleteCollection?: (collectionId: number) => Promise<boolean>;

  // Item operations
  onAddItems?: (collectionId: number, itemIds: number[], position?: number) => Promise<boolean>;
  onEditItem?: (collectionId: number, itemId: number, params: any) => Promise<boolean>;
  onRemoveItems?: (collectionId: number, itemIds: number[]) => Promise<boolean>;
  onUpdateItemPosition?: (
    collectionId: number,
    itemId: number, // Changed from audioFileId for consistency
    targetPosition: number, // Changed from newPosition for consistency
    sourceStartPosition?: number,
    sourceEndPosition?: number,
  ) => Promise<boolean>;

  // UI state
  itemDisplayView?: 'list' | 'grid';
  isEditing?: boolean;
  dropZoneId?: string | null; // Add dropZoneId
  acceptedDropTypes?: string[]; // Add acceptedDropTypes
}

