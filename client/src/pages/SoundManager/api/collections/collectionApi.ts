import { AudioItem } from "../../types/AudioItem.js";

export type CollectionType = 'playlist' | 'sfx' | 'ambience' | 'pack';

// Factory function to create a collection API for a specific type
export function createCollectionApi(collectionType: CollectionType) {
  // Base URL for the collection type
  const API_URL = `/api/audio/collections/${collectionType}`;
  
  // Create the API object first so we can reference its methods
  const api = {} as any;
  
  // Get all collections of the specified type
  api.getAllCollections = async (): Promise<AudioItem[]> => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const collections: AudioItem[] = await response.json();
      
      return collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description || undefined,
        type: collectionType,
        itemCount: collection.itemCount || 0,
      }));
    } catch (error) {
      console.error(`Error fetching ${collectionType} collections:`, error);
      throw error;
    }
  };

  // Get a collection by ID, optionally with its files
  api.getCollectionById = async (id: number, includeFiles: boolean = true): Promise<AudioItem> => {
    try {
      const response = await fetch(`${API_URL}/${id}?includeFiles=${includeFiles}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return await response.json();

    } catch (error) {
      console.error(`Error fetching ${collectionType} collection with ID ${id}:`, error);
      throw error;
    }
  };

  // Create a new collection
  api.createCollection = async (name: string, description?: string): Promise<number> => {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      const result = await response.json();
      return result.collection_id || result.playlist_id;
    } catch (error) {
      console.error(`Error creating ${collectionType}:`, error);
      throw error;
    }
  };

  // Update an existing collection
  api.updateCollection = async (id: number, name: string, description?: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error updating ${collectionType} ${id}:`, error);
      throw error;
    }
  };

  // Delete a collection
  api.deleteCollection = async (id: number): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error deleting ${collectionType} ${id}:`, error);
      throw error;
    }
  };

  // Add a file to a collection
  api.addFileToCollection = async (
    collectionId: number,
    audioFileId: number,
    position?: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioFileId,
          position: position !== undefined ? position : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(
        `Error adding file ${audioFileId} to ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  // Add files to a collection (batch operation)
  api.addFilesToCollection = async (
    collectionId: number,
    audioFileIds: number[],
    startPosition?: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioFileIds,
          startPosition: startPosition !== undefined ? startPosition : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error adding files to ${collectionType} ${collectionId}:`, error);
      throw error;
    }
  };

  // Update position of a file in a collection
  api.updateFilePosition = async (
    collectionId: number,
    audioFileId: number,
    targetPosition: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${API_URL}/${collectionId}/files/${audioFileId}/position`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPosition }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(
        `Error updating position for file ${audioFileId} in ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  // Move a range of files to a new position in the collection
  api.updateFileRangePosition = async (
    collectionId: number,
    sourceStartPosition: number,
    sourceEndPosition: number,
    targetPosition: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files/positions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceStartPosition,
          sourceEndPosition,
          targetPosition,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error moving files in ${collectionType} ${collectionId}:`, error);
      throw error;
    }
  };

  // Get files in a collection
  api.getCollectionFiles = async (collectionId: number): Promise<AudioItem[]> => {
    try {
      console.log(`Fetching files for ${collectionType} ${collectionId}...`);

      const collection = await api.getCollectionById(collectionId, true);

      if (!collection.items) {
        return [];
      }

      console.log(collection);

      // Convert to AudioItem format for AudioItemList component
      return collection.items.map((item: AudioItem) => ({
        id: item.id,
        name: item.name,
        type: "file",
        duration: item.duration,
        position: item.position,
      }));
    } catch (error) {
      console.error(`Error fetching files for ${collectionType} ${collectionId}:`, error);
      throw error;
    }
  };

  // Unified function to add items to a collection (handles both single and multiple items)
  api.addToCollection = async (
    collectionId: number,
    items: number[],
    position?: number
  ): Promise<boolean> => {
    if (items.length === 0) return true;
    
    if (items.length === 1) {
      return await api.addFileToCollection(collectionId, items[0], position);
    } else {
      return await api.addFilesToCollection(collectionId, items, position);
    }
  };

  // Remove files from a collection - batch call for multiple files
  api.removeFilesFromCollection = async (
    collectionId: number,
    audioFileIds: number | number[]
  ): Promise<boolean> => {
    if (!Array.isArray(audioFileIds)) {
      audioFileIds = [audioFileIds]; // Convert to array for consistency
    }
    for (const audioFileId of audioFileIds) {
      try {
        const response = await fetch(
          `${API_URL}/${collectionId}/files/${audioFileId}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      } catch (error) {
        console.error(
          `Error removing file ${audioFileId} from ${collectionType} ${collectionId}:`,
          error
        );
        throw error;
      }
    }
    return true;
  };

  // Unified function to update positions (handles both single and range updates)
  api.updatePosition = async (
    collectionId: number,
    audioFileId: number,
    targetPosition: number,
    sourceStartPosition?: number,
    sourceEndPosition?: number
  ): Promise<boolean> => {
    // Determine if this is a range update or single file update
    if (sourceStartPosition !== undefined && sourceEndPosition !== undefined) {
      return await api.updateFileRangePosition(
        collectionId,
        sourceStartPosition,
        sourceEndPosition,
        targetPosition
      );
    } else {
      return await api.updateFilePosition(collectionId, audioFileId, targetPosition);
    }
  };

  return api;
}

export const packApi = {
  // Get all packs with their collections
  getAllPacks: async (): Promise<AudioItem[]> => {
    try {
      const response = await fetch(`/api/audio/collections/pack`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const packs = await response.json();
      
      return packs.map((pack: any) => ({
        id: pack.pack_id,
        name: pack.name,
        description: pack.description || undefined,
        type: 'pack',
      }));
    } catch (error) {
      console.error('Error fetching packs:', error);
      throw error;
    }
  },
  
  // Create a new pack
  createPack: async (name: string, description?: string): Promise<number> => {
    try {
      const response = await fetch(`/api/audio/collections/pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
  
      const result = await response.json();
      return result.pack_id;
    } catch (error) {
      console.error(`Error creating pack:`, error);
      throw error;
    }
  },
  
  // Delete a pack
  deletePack: async (id: number): Promise<boolean> => {
    try {
      const response = await fetch(`/api/audio/collections/pack/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(`Error deleting pack ${id}:`, error);
      throw error;
    }
  },

  addCollectionToPack: async (
    packId: number,
    collectionId: number,
  ): Promise<boolean> => {
    try {
      
      console.log(`Adding collection ${collectionId} to pack ${packId}...`);

      const response = await fetch(`/api/audio/collections/pack/${packId}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error(
        `Error adding collection ${collectionId} to pack ${packId}:`,
        error
      );
      throw error;
    }
  },

  getPackCollections: async (packId: number): Promise<AudioItem[]> => {
    try {
      const response = await fetch(`/api/audio/collections/pack/${packId}/collections`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const collections = await response.json();
      
      return collections.map((collection: any) => ({
        id: collection.collection_id,
        name: collection.name,
        description: collection.description || undefined,
        type: collection.type,
      }));
    } catch (error) {
      console.error(`Error fetching collections for pack ${packId}:`, error);
      throw error;
    }
  }
};

// Create pre-configured APIs for each collection type
export const playlistApi = createCollectionApi('playlist');
export const sfxApi = createCollectionApi('sfx');
export const ambienceApi = createCollectionApi('ambience');
