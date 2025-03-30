import React from 'react';
import { AudioItem, CollectionType } from '../types.js';
import { DragDropProps } from 'src/types/dragDropProps.js';
import { AudioItemsDisplay } from '../../AudioItemDisplay/AudioItemsDisplay.js';
import { DROP_ZONES } from 'src/components/DropTargetContext/dropZones.js';
import './CollectionsGrid.css';

interface CollectionsGridProps extends DragDropProps {
  // Data props
  collectionName: string;
  collectionType: CollectionType;
  collections: AudioItem[];
  // UI state props
  isLoading: boolean;
  error: string | null;
  // Action handlers
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onItemClick: (itemId: number) => void;
  onDeleteClick: (itemId: number | number[]) => void;
}

const CollectionsGrid: React.FC<CollectionsGridProps> = ({
  // Data props
  collectionName,
  collectionType,
  collections,
  // UI state props
  isLoading,
  error,
  // Action handlers
  onCreateCollection,
  onItemClick,
  onDeleteClick,
  // Drag drop props
  isDragSource,
  isDropTarget = false 
}) => {
  // Create a special AudioItem for the "Create New" button
  const createNewItem: AudioItem = {
    id: -1, 
    name: `Create New ${collectionName.slice(0, -1)}`,
    type: collectionType, 
    itemCount: 0,
    isCreateButton: true 
  };

  const displayItems = [...collections];
  if (onCreateCollection) {
    displayItems.push(createNewItem);
  }

  return (
    <div className="collections-grid-view">
      <AudioItemsDisplay
        items={displayItems}
        collectionType={collectionType}
        isLoading={isLoading}
        error={error}
        view="grid"
        showToggle={false}
        showActions={true}
        name={collectionName}
        onItemClick={onItemClick}
        onRemoveItems={onDeleteClick}
        renderSpecialItem={(item) => 
          item.isCreateButton && (
            <div className="create-collection-content">
              <div className="create-collection-icon">+</div>
              <span className="create-collection-text">{item.name}</span>
            </div>
          )
        }
        isDragSource={isDragSource}
        isDropTarget={isDropTarget}
        dropZoneId={DROP_ZONES.SOUND_MANAGER_PACK_DROP}
        acceptedDropTypes={[]}
      />
    </div>
  );
};

export default CollectionsGrid;