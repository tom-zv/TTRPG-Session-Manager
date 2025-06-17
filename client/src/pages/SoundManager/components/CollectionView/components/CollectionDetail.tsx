import React, { useMemo } from "react";
import { useGetCollectionById } from "../../../api/collections/useCollectionQueries.js";
import { CollectionType } from "shared/audio/types.js";
import CollectionItemsDisplay from "../../CollectionItemsDisplay/CollectionItemsDisplay.js";
import "./CollectionDetail.css";

interface CollectionDetailProps {
  // Data props
  collectionType: CollectionType;
  collectionId: number;
  // UI state props
  itemDisplayView: "list" | "grid";
  // Action handlers
  onBackClick: () => void;
  // Drag and drop props
  isDragSource?: boolean;
  isDropTarget?: boolean;
  dropZoneId?: string | null;
  acceptedDropTypes?: string[]; 
}

const CollectionDetail: React.FC<CollectionDetailProps> = ({
  collectionType,
  collectionId,
  itemDisplayView,
  onBackClick,
  isDragSource = false,
  isDropTarget = false,
  dropZoneId, 
  acceptedDropTypes, 
}) => {
  // Fetch the collection data using React Query
  const { data: collection, isLoading, error } = useGetCollectionById(
    collectionType,
    collectionId
  );

  // Check if description is short enough to display inline
  const useInlineDescription = useMemo(() => {
    return collection?.description && collection.description.length < 80;
  }, [collection?.description]);

  // Handle loading and error states
  if (isLoading) {
    return <div className="collection-detail-view">Loading...</div>;
  }

  if (error) {
    return (
      <div className="collection-detail-view">
        <p className="error-message">Failed to load collection details.</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="collection-detail-view">
        <p className="error-message">Collection not found.</p>
      </div>
    );
  }

  return (
    <div className="collection-detail-view">
      <div className="collection-detail-header">
        <button className="back-button" onClick={onBackClick}>
          ←
        </button>

        <div className="collection-title-group">
          <h2>{collection.name}</h2>
          {useInlineDescription && collection.description && (
            <p className="collection-description-inline">
              {collection.description}
            </p>
          )}
        </div>

        {/* <div className="collection-edit">
          <button className=>
            <FaCog />
          </button>
        </div> */}
      </div>

      {!useInlineDescription && collection.description && (
        <p className="collection-description">{collection.description}</p>
      )}

      <div
        className={`collection-detail-view-content ${
          itemDisplayView === "grid"
            ? "collection-detail-view-grid"
            : "collection-detail-view-list"
        }`}
      >
        <CollectionItemsDisplay
          collectionType={collectionType}
          collectionId={collectionId}
          view={itemDisplayView}
          showToggle={false}
          showActions={true}
          showPlayButton={true}
          isDragSource={isDragSource}
          isDropTarget={isDropTarget}
          dropZoneId={dropZoneId} 
          acceptedDropTypes={acceptedDropTypes} 
        />
      </div>
    </div>
  );
};

export default CollectionDetail;
