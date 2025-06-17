import React, { useEffect, useRef, useState } from "react";
import { Audio } from "../../services/AudioService/AudioContext.js";
import { useCollectionQuery } from "../../api/collections/useCollectionQueries.js";
import { AudioCollection, AudioFile } from "../CollectionItemsDisplay/types.js";
import { FaLeaf, FaCaretDown } from "react-icons/fa";

import "./AmbienceCollapsedView.css";

export const AmbienceCollapsed: React.FC = () => {
  // TODO: allow parent to control collectionId - user expects last interacted collection to be selected
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [collectionSelectorOpen, setCollectionSelectorOpen] = useState(false);

  const AmbienceContext = Audio.useAmbience();
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

  const isCollectionActive =
    AmbienceContext.playingCollectionId === currentCollection?.id;

  const toggleFile = (file: AudioFile) => {
    if (currentCollection) {
      AmbienceContext.toggleFileActivation(currentCollection, file);
    }
  };

  if (!collectionId || !currentCollection) {
    return (
      <div className="no-collection-selected">
        No ambience collection selected.
      </div>
    );
  }

  return (
    <div className="ambience-collapsed" ref={containerRef}>
      <div className="left-panel">
        <div className="collection-info">
          {/* Selector Header */}
          {!collectionSelectorOpen && (
            <div className="collection-selector">
              <button
                className={`collection-name-container ${
                  isCollectionActive || collectionSelectorOpen ? "active" : ""
                }`}
                onClick={() => setCollectionSelectorOpen(!collectionSelectorOpen)}
                onKeyDown={(e) =>
                  ["Enter", " "].includes(e.key) &&
                  setCollectionSelectorOpen(!collectionSelectorOpen)
                }
              >
                <span className="collection-name">{currentCollection.name}</span>

                <FaCaretDown className="dropdown-icon" />
              </button>
            </div>
          )}

          {/* Controls */}
          {collectionSelectorOpen ? (
            <span className="select-prompt">
              Please select an ambience collection{" "}
            </span>
          ) : (
            <div className="collection-controls">
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

          <div className="collection-icon">
            <FaLeaf />
            <span className="collection-type">Ambience</span>
          </div>
        </div>
      </div>

      <div className="layout-vertical-separator"></div>

      {/* Right Panel: Collection Selector or Grid */}
      <div className="right-panel">
        {collectionSelectorOpen ? (
          <div className="collections-selector-view">
            {(collections?.items as AudioCollection[]).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`selector-view-item ${
                  c.id === collectionId ? "selected" : ""
                }`}
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
          <div className="file-info">
            {currentCollection.items?.length ? (
              (currentCollection.items as AudioFile[]).map(
                (file: AudioFile) => (
                  <button
                    key={file.id}
                    className={`file-item ${file.active ? "active" : ""}`}
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
