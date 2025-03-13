import { useState, useCallback } from 'react';
import { AudioItem} from '../types.js';

interface UseDragDropProps {
  selectedCollection: AudioItem | null;
  handleAddItem: (item: AudioItem) => Promise<void>;
  loadCollectionItems: (collectionId: number) => Promise<void>;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDragDrop = ({
  selectedCollection,
  handleAddItem,
  setError
}: UseDragDropProps) => {
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [dragCount, setDragCount] = useState<number>(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
    
    try {
      // Try to extract the drag data to get file count
      const items = e.dataTransfer.items;
      if (items.length > 0) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type === 'application/json') {
            setDragCount(1); // At minimum 1, exact count determined on drop
            break;
          }
        }
      }
    } catch (err) {
      console.log('Could not read drag data type', err);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    setDragCount(0);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    setDragCount(0);
    
    try {
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;
      
      const fileData = JSON.parse(data);
      
      // Handle file drops
      if (fileData.files && selectedCollection) {
        
        const filesToAdd = fileData.files;
        
        for (const file of filesToAdd) {
          await handleAddItem(file);
        }
      }
    } catch (error) {
      console.error("Error processing dropped item(s):", error);
      setError("Failed to add dropped item(s) to collection");
    }
  }, [selectedCollection, handleAddItem, setError]);

  return {
    isDraggingOver,
    dragCount,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop
  };
};