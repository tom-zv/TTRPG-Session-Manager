import React, { useMemo } from "react";
import { useGetCollectionById } from "../../../api/collections/useCollectionQueries.js";
import { CollectionType } from "shared/audio/types.js";
import CollectionItemsDisplay from "../../CollectionItemsDisplay/CollectionItemsDisplay.js";
import styles from "./CollectionDetail.module.css";
import { IoReturnUpBack } from "react-icons/io5";
import {
  useAudioItemControls,
  useAudioItemState,
  type AudioItemPlayState,
} from "src/pages/SoundManager/services/AudioService/AudioContext.js";

type CollectionPlayState = AudioItemPlayState;

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
  const { toggleAudioItem } = useAudioItemControls();
  const { getAudioItemPlayState } = useAudioItemState();

  // Check if description is short enough to display inline
  const useInlineDescription = useMemo(() => {
    return collection?.description && collection.description.length < 80;
  }, [collection?.description]);

  // Handle loading and error states
  if (isLoading) {
    return <div className={styles.collectionDetailView}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={styles.collectionDetailView}>
        <p className={styles.errorMessage}>Failed to load collection details.</p>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className={styles.collectionDetailView}>
        <p className={styles.errorMessage}>Collection not found.</p>
      </div>
    );
  }

  const collectionPlayState =
    collectionType === "sfx"
      ? "unsupported"
      : getAudioItemPlayState(collection);

  const isCollectionPlayable = collectionType !== "sfx";
  const isCollectionRunning =
    collectionPlayState === "playing" || collectionPlayState === "active";

  const statusLabelByState: Record<CollectionPlayState, string> = {
    unsupported: "",
    off: "off",
    active: "No files active",
    playing: "playing",
  };

  return (
    <div className={styles.collectionDetailView} data-type={collectionType}>
      <div className={styles.collectionDetailHeader}>
        <button className="back-button" onClick={onBackClick}>
          <IoReturnUpBack />
        </button>

        <div className={styles.collectionTitleGroup}>
          <div className={styles.collectionTitleBlock}>
            <h2> {collection.name} </h2>
            <div className={styles.collectionStatusRow}>
              <div
                className={styles.collectionStatus}
                data-state={collectionPlayState}
                data-type={collectionType}
                title={`Collection state: ${statusLabelByState[collectionPlayState]}`}
              >
                {statusLabelByState[collectionPlayState]}
              </div>
            </div>
          </div>
          {useInlineDescription && collection.description && (
            <p className={styles.collectionDescriptionInline}>
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

      {isCollectionPlayable && (
      <button
        className={styles.playButton}
        onClick={() => toggleAudioItem(collection)}
      >
        {isCollectionRunning ? '⏸' : '▶'}
      </button>
      )}
      {!useInlineDescription && collection.description && (
        <p className={styles.collectionDescription}>{collection.description}</p>
      )}

      <div
        className={[
          styles.collectionDetailViewContent,
          itemDisplayView === "list" ? styles.collectionDetailViewList : "",
        ].filter(Boolean).join(" ")}
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
