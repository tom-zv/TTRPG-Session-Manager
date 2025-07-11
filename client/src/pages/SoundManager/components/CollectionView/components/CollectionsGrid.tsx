import React from 'react';
import { CollectionType } from "shared/audio/types.js";
import { DragDropProps } from 'src/types/dragDropProps.js';
import { CollectionItemsDisplay } from '../../CollectionItemsDisplay/CollectionItemsDisplay.js';

interface CollectionsGridProps extends DragDropProps {
  // Data props
  collectionType: CollectionType;
  // Action handlers
  onItemClick: (itemId: number) => void;
  // Drag drop props
  dropZoneId?: string | null; 
  acceptedDropTypes?: string[]; 
}

const CollectionsGrid: React.FC<CollectionsGridProps> = ({
  // Data props
  collectionType,
  // Action handlers
  onItemClick,
  // Drag drop props
  isDragSource,
  isDropTarget = false,
}) => {
 
  return (
    <div className="collections-grid-view">
      <CollectionItemsDisplay
        collectionId={-1}
        collectionType={collectionType}
        view="grid"
        showToggle={false}
        showActions={true}
        onItemClick={onItemClick}
        isDragSource={isDragSource}
        isDropTarget={isDropTarget}
      />
    </div>
  );
};

export default CollectionsGrid;