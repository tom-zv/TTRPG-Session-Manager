import React, { useEffect, useRef, useState } from "react";
import {
  useAmbienceAudio,
  useAudioItemState,
} from "../../services/AudioService/AudioContext.js";
import { useCollectionQuery } from "../../api/collections/useCollectionQueries.js";
import { AudioCollection, AudioFile } from "../CollectionItemsDisplay/types.js";
import { FaLeaf, FaCaretDown } from "react-icons/fa";

import styles from "./AmbienceCollapsedView.module.css";

export const AmbienceCollapsed: React.FC = () => {
  // TODO: allow parent to control collectionId - user expects last interacted collection to be selected
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [collectionSelectorOpen, setCollectionSelectorOpen] = useState(false);

  const AmbienceContext = useAmbienceAudio();
  const { getAudioItemPlayState } = useAudioItemState();
  const { data: collections } = useCollectionQuery("ambience", -1);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize selected collection
  useEffect(() => {
    const available = collections?.items;
    if (!collectionId) {
      if (AmbienceContext.playingCollectionId) {
        setCollectionId(AmbienceContext.playingCollectionId);
      } else if (available?.length) {
        setCollectionId(available[0].id);
      }
    }
  }, [collections, AmbienceContext.playingCollectionId, collectionId]);

  const handleCollectionSelect = (id: number) => {
    setCollectionId(id);
    setCollectionSelectorOpen(false);
  };

  const currentCollection = collections?.items?.find(
    (c) => c.id === collectionId
  ) as AudioCollection;

  const collectionPlayState = currentCollection
    ? getAudioItemPlayState(currentCollection)
    : "off";
  const isCollectionActive =
    collectionPlayState === "active" || collectionPlayState === "playing";

  const toggleFile = (file: AudioFile) => {
    if (currentCollection) {
      AmbienceContext.toggleFileActivation(currentCollection, file);
    }
  };

  if (!collectionId || !currentCollection) {
    return (
      <div className={styles.noCollectionSelected}>
        No ambience collection selected.
      </div>
    );
  }

  return (
    <div className={styles.ambienceCollapsed} ref={containerRef}>
      <div className={styles.leftPanel}>
        <div className={styles.collectionInfo}>
          {/* Selector Header */}
          {!collectionSelectorOpen && (
            <div className={styles.collectionSelector}>
              <button
                className={[styles.collectionNameContainer, (isCollectionActive || collectionSelectorOpen) ? styles.active : ""].filter(Boolean).join(" ")}
                onClick={() => setCollectionSelectorOpen(!collectionSelectorOpen)}
                onKeyDown={(e) =>
                  ["Enter", " "].includes(e.key) &&
                  setCollectionSelectorOpen(!collectionSelectorOpen)
                }
              >
                <span className={styles.collectionName}>{currentCollection.name}</span>
                <FaCaretDown className={styles.dropdownIcon} />
              </button>
            </div>
          )}

          {/* Controls */}
          {collectionSelectorOpen ? (
            <span className={styles.selectPrompt}>
              Please select an ambience collection{" "}
            </span>
          ) : (
            <div className={styles.collectionControls}>
              <button
                className="icon-button play-button"
                onClick={() =>
                  AmbienceContext.toggleCollection(currentCollection)
                }
              >
                {isCollectionActive ? "⏸" : "▶"}
              </button>

              <div className="volume-control">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={AmbienceContext.volume}
                  onChange={(e) =>
                    AmbienceContext.setMasterVolume(
                      parseFloat(e.currentTarget.value)
                    )
                  }
                  className="volume-slider"
                />
              </div>
            </div>
          )}

          <div className={styles.collectionIcon}>
            <FaLeaf />
            <span className={styles.collectionType}>Ambience</span>
          </div>
        </div>
      </div>

      <div className={styles.verticalSeparator}></div>

      {/* Right Panel: Collection Selector or Grid */}
      <div className={styles.rightPanel}>
        {collectionSelectorOpen ? (
          <div className={styles.collectionsSelectorView}>
            {(collections?.items as AudioCollection[]).map((c) => (
              <button
                key={c.id}
                type="button"
                className={[styles.selectorViewItem, c.id === collectionId ? styles.selected : ""].filter(Boolean).join(" ")}
                onClick={() => handleCollectionSelect(c.id)}
                onKeyDown={(e) =>
                  ["Enter", " "].includes(e.key) && handleCollectionSelect(c.id)
                }
              >
                {c.name}
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.fileInfo}>
            {currentCollection.items?.length ? (
              (currentCollection.items as AudioFile[]).map(
                (file: AudioFile) => (
                  <button
                    key={file.id}
                    className={[styles.fileItem, file.active ? styles.active : ""].filter(Boolean).join(" ")}
                    onClick={() => toggleFile(file)}
                    title={file.name}
                  >
                    <span>{file.name}</span>
                  </button>
                )
              )
            ) : (
              <div>No items in this collection.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
