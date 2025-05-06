import React, { useState } from 'react';
import { collectionNameFromType } from '../hooks/useCollections.js';
import { CollectionType } from '../types.js';
import './CreateCollectionDialog.css';

interface CreateCollectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  collectionType: CollectionType;
  createCollection: (name: string, description?: string) => void;
}

const CreateCollectionDialog: React.FC<CreateCollectionDialogProps> = ({
  isOpen,
  onClose,
  collectionType,
  createCollection,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');

  if (!isOpen) return null;

  const collectionName = collectionNameFromType(collectionType);
  
  const handleCreateCollection = async () => {
    if (!newItemName) return;
    
    try {
      await createCollection(newItemName, newItemDescription || undefined);
      setNewItemName('');
      setNewItemDescription('');
      onClose();
    } catch (error) {
      console.error("Error creating collection:", error);
    }
  };
  
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
            onClick={handleCreateCollection}
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