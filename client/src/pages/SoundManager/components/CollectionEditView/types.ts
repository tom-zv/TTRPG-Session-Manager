import type { AudioItem } from "../../types/index.js";
export type { AudioItem };

export type CollectionType = 'playlist' | 'sfx_set' | 'ambience_set' | 'pack';

// Props for the CollectionEditView component
export interface CollectionEditViewProps {
  // Display name for this collection type
  collectionTitle: string;
  collectionType: CollectionType;

  // API Functions
  fetchCollections: () => Promise<AudioItem[]>;
  fetchCollectionItems?: (collectionId: number) => Promise<AudioItem[]>;
  fetchAvailableItems?: (collectionId?: number) => Promise<AudioItem[]>;

  // Action Handlers
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onUpdateCollection?: (collection: AudioItem) => Promise<boolean>;
  onDeleteCollection?: (collectionId: number) => Promise<boolean>;
  onAddItems?: (collectionId: number, itemIds: number[], position?: number) => Promise<boolean>;
  onRemoveItems?: (collectionId: number, itemIds: number | number[]) => Promise<boolean>;
  onUpdateItemPosition?: (
    collectionId: number,
    audioFileId: number,
    newPosition: number,
    // For range update
    sourceStartPosition?: number,
    sourceEndPosition?: number,
  ) => Promise<boolean>;
}