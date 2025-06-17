import React, { useState } from 'react';
import { collectionNameFromType } from '../hooks/useCollections.js';
import { CollectionType } from "shared/audio/types.js";
import Dialog from 'src/components/Dialog/Dialog.js';

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
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Create New ${collectionName.slice(0, -1)}`}
      className="collection-dialog"
    >
      <div className="form-group">
        <label htmlFor="newItemName">Name:</label>
        <input
          id="newItemName"
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder={`Enter ${collectionType} name`}
          required
          className="form-control"
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
          className="form-control"
        />
      </div>
      <div className="dialog-footer">
        <button
          className="btn btn-primary"
          onClick={handleCreateCollection}
        >
          Create
        </button>
        <button
          className="btn btn-muted"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
};

export default CreateCollectionDialog;