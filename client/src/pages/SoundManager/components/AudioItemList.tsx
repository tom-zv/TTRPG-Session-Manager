import React, { useState } from "react";
import "./AudioItemList.css"; // Update CSS file name

// Generic audio item type that can represent various audio objects
export type AudioItem = {
  id: number;
  title: string;
  type: 'file' | 'playlist' | 'sfx_set' | 'ambience_set' | 'pack';
  audioType?: 'music' | 'sfx' | 'ambience'; // Only for files
  itemCount?: number; // For collections (playlists, sets, packs)
  isCreateButton?: boolean; // New property for special create button
};

interface AudioItemListProps {
  items: AudioItem[];
  isLoading?: boolean;
  error?: string | null;
  view?: "grid" | "list";
  showToggle?: boolean | null;
  showActions?: boolean | null;
  title?: string;
  onSelectItem?: (itemId: number) => void;
  onItemClick?: (itemId: number) => void;
  onPlayItem?: (itemId: number) => void;
  onEditItem?: (itemId: number) => void;
  onDeleteItem?: (itemId: number) => void;
  renderSpecialItem?: (item: AudioItem) => React.ReactNode; // New prop for custom rendering
}

const AudioItemList: React.FC<AudioItemListProps> = ({
  items,
  isLoading = false,
  error = null,
  view = "list",
  showToggle = false,
  showActions = false,
  title = "Audio Items",
  onSelectItem,
  onItemClick,
  onPlayItem,
  onEditItem,
  onDeleteItem,
  renderSpecialItem
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">(view);

  if (isLoading) {
    return <div className="loading-indicator">Loading audio items...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  if (items.length === 0) {
    return <div className="empty-state">No audio items found.</div>;
  }

  // Handle item click
  const handleItemClick = (e: React.MouseEvent, itemId: number) => {
    if (onItemClick) {
      e.stopPropagation();
      onItemClick(itemId);
    }
  };

  // Handle play button click
  const handlePlayClick = (e: React.MouseEvent, itemId: number) => {
    if (onPlayItem) {
      e.stopPropagation();
      onPlayItem(itemId);
    }
  };

  // Handle edit button click
  const handleEditClick = (e: React.MouseEvent, itemId: number) => {
    if (onEditItem) {
      e.stopPropagation();
      onEditItem(itemId);
    }
  };

  // Handle delete button click
  const handleDeleteClick = (e: React.MouseEvent, itemId: number) => {
    if (onDeleteItem) {
      e.stopPropagation();
      onDeleteItem(itemId);
    }
  };

  // Get appropriate icon for item type
  const getItemIcon = (item: AudioItem) => {
    switch (item.type) {
      case 'file': return item.audioType === 'music' ? '🎵' : 
                         item.audioType === 'sfx' ? '🔊' : '🔈';
      case 'playlist': return '';
      case 'sfx_set': return '';
      case 'ambience_set': return '';
      case 'pack': return '📦';
      default: return '📄';
    }
  };

  const renderGridView = () => (
    <div className="audio-item-grid">
      {items.map((item) => (
        <div 
          key={item.id} 
          className={`audio-item-card ${item.type} ${item.isCreateButton ? 'create-collection-card' : ''}`}
          onClick={(e) => handleItemClick(e, item.id)}
        >
          {item.isCreateButton && renderSpecialItem ? (
            renderSpecialItem(item)
          ) : (
            <div className="audio-item">
              <div className="audio-item-header">
                <span className="item-icon">{getItemIcon(item)}</span>
                <h4 className="audio-item-title">{item.title}</h4>
              </div>
              <div className="audio-item-details">
                <span className="audio-item-type">{item.type.replace('_', ' ')}</span>
                {item.itemCount !== undefined && (
                  <span className="item-count">{item.itemCount} items</span>
                )}
              </div>
              <div className="audio-item-controls">
                {onPlayItem && !item.isCreateButton && (
                  <button 
                    className="play-button"
                    onClick={(e) => handlePlayClick(e, item.id)}
                    title="Play"
                  >
                    ▶️
                  </button>
                )}
                {showActions && !item.isCreateButton && (
                  <>
                    {onEditItem && (
                      <button 
                        className="edit-button"
                        onClick={(e) => handleEditClick(e, item.id)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    {onDeleteItem && (
                      <button 
                        className="delete-button"
                        onClick={(e) => handleDeleteClick(e, item.id)}
                        title="Delete"
                      >
                        X
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderListView = () => (
    <div className="audio-item-list-view">
      <table className="audio-item-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.filter(item => !item.isCreateButton).map((item) => (
            <tr
              key={item.id}
              className={`audio-item-row ${item.type}`}
              onClick={(e) => handleItemClick(e, item.id)}
            >
              <td>
                <div className="item-title-cell">
                  <span className="item-icon">{getItemIcon(item)}</span>
                  {item.title}
                </div>
              </td>
              <td>
                <span className="item-type-label">
                  {item.type.replace("_", " ")}
                  {item.itemCount !== undefined && ` (${item.itemCount})`}
                </span>
              </td>
              {showActions && (
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="item-actions">
                    {onPlayItem && (
                      <button
                        className="play-button small"
                        onClick={(e) => handlePlayClick(e, item.id)}
                        title="Play"
                      >
                        ▶️
                      </button>
                    )}
                    {onEditItem && (
                      <button
                        className="edit-button small"
                        onClick={(e) => handleEditClick(e, item.id)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                    )}
                    {onDeleteItem && (
                      <button
                        className="delete-button small"
                        onClick={(e) => handleDeleteClick(e, item.id)}
                        title="Delete"
                      >
                        X
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Display create button separately in list view */}
      {items.find(item => item.isCreateButton) && renderSpecialItem && (
        <div 
          className="create-button-list-view"
          onClick={() => onItemClick && onItemClick(-1)}
        >
          {renderSpecialItem(items.find(item => item.isCreateButton)!)}
        </div>
      )}
    </div>
  );

  return (
    <div className="audio-item-list">
      <div className="audio-item-list-header">
        {showToggle && (
          <div className="view-toggle">
            <button
              className={`view-toggle-button ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List View"
            >
              ☰
            </button>
            <button
              className={`view-toggle-button ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              ⊞
            </button>
          </div>
        )}
      </div>

      {viewMode === "grid" ? renderGridView() : renderListView()}
    </div>
  );
};

export default AudioItemList;
