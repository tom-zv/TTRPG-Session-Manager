import React from 'react';
import { CollectionType } from '../types.js';

interface CreateCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  collectionName: string;
  collectionType: CollectionType;
  newItemName: string;
  newItemDescription: string;
  setNewItemName: (name: string) => void;
  setNewItemDescription: (desc: string) => void;
  onCreateCollection: () => void;
  isLoading: boolean;
}

const CreateCollectionDialog: React.FC<CreateCollectionDialogProps> = ({
  isOpen,
  onClose,
  collectionName,
  collectionType,
  newItemName,
  newItemDescription,
  setNewItemName,
  setNewItemDescription,
  onCreateCollection,
  isLoading
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Create New {collectionName.slice(0, -1)}</h2>
          <button 
            className="close-button"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="newItemName">Name:</label>
            <input
              id="newItemName"
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={`Enter ${collectionType} name`}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="newItemDescription">Description:</label>
            <textarea
              id="newItemDescription"
              value={newItemDescription}
              onChange={(e) => setNewItemDescription(e.target.value)}
              placeholder="Enter description (optional)"
              rows={3}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="create-button"
            onClick={onCreateCollection}
            disabled={!newItemName || isLoading}
          >
            Create
          </button>
          <button
            className="cancel-button"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCollectionDialog;