import React from 'react';
import { AudioItem, CollectionType } from '../types.js';
import { AudioItemDisplay } from '../../AudioItemDisplay/AudioItemDisplay.js';

interface CollectionsGridProps {
  collectionTitle: string;
  collectionType: CollectionType;
  collections: AudioItem[];
  isLoading: boolean;
  error: string | null;
  onCreateCollection?: (name: string, description?: string) => Promise<number>;
  onItemClick: (itemId: number) => void;
  onDeleteClick: (itemId: number) => void;
}

const CollectionsGrid: React.FC<CollectionsGridProps> = ({
  collectionTitle,
  collectionType,
  collections,
  isLoading,
  error,
  onCreateCollection,
  onItemClick,
  onDeleteClick
}) => {
  // Create a special AudioItem for the "Create New" button
  const createNewItem = {
    id: -1, // Use a special ID that won't conflict with real items
    title: `Create New ${collectionTitle.slice(0, -1)}`,
    type: collectionType, 
    itemCount: 0,
    isCreateButton: true // Custom property to identify this special item
  };

  // Add the create button to the list if we have the function to create collections
  const displayItems = [...collections];
  if (onCreateCollection) {
    displayItems.push(createNewItem);
  }

  return (
    <div className="collections-grid-view">
      {/* <div className="collections-header">
        <h2>{collectionTitle}</h2>
      </div> */}
      
      <AudioItemDisplay
        items={displayItems}
        isLoading={isLoading}
        error={error}
        view="grid"
        showToggle={false}
        showActions={true}
        title={collectionTitle}
        onItemClick={onItemClick}
        onRemoveItem={(itemId) => {
          if (itemId !== -1) { // Don't allow deleting our create button
            onDeleteClick(itemId);
          }
        }}
        renderSpecialItem={(item) => 
          item.isCreateButton && (
            <div className="create-collection-content">
              <div className="create-collection-icon">+</div>
              <span className="create-collection-text">{item.title}</span>
            </div>
          )
        }
      />
    </div>
  );
};

export default CollectionsGrid;