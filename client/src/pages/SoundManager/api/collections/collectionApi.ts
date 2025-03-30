import { AudioFile, AudioCollection, AudioMacro } from "../../types/AudioItem.js";

export type CollectionType = 'playlist' | 'sfx' | 'ambience' | 'pack' | 'macro';

// Factory function to create a collection API for a specific type
export function createCollectionApi(collectionType: CollectionType) {
  // Base URL for the collection type
  let API_URL = `/api/audio/collections/${collectionType}`;
  if (collectionType === 'macro') {
    API_URL = `/api/audio/macro`;
  }
  
  // Create the API object first so we can reference its methods
  const api = {} as any;
  
  // Get all collections of the specified type
  api.getAllCollections = async (): Promise<AudioCollection[] | AudioMacro[]> => {
    try {
      const response = await fetch(API_URL);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const items = await response.json();
      
      if (collectionType === 'macro') {
        // Handle macro-specific mapping
        return items.map((item: any) => ({
          id: item.id,
          type: "macro", // Set explicit type for AudioMacro
          name: item.name,
          description: item.description || undefined,
          itemCount: item.itemCount || 0,
          position: item.position || 0,
          duration: item.duration || 0, // Macro-specific property
        }));
      } else {
        // Standard collection mapping
        return items.map((collection: any) => ({
          id: collection.id,
          type: collectionType,
          name: collection.name,
          description: collection.description || undefined,
          itemCount: collection.itemCount || 0,
          position: collection.position || 0,
        }));
      }
    } catch (error) {
      console.error(`Error fetching ${collectionType} collections:`, error);
      throw error;
    }
  };

  // Get a collection by ID, optionally with its files
  api.getCollectionById = async (id: number, includeFiles: boolean = true): Promise<AudioCollection | AudioMacro> => {
    try {
      const response = await fetch(`${API_URL}/${id}?includeFiles=${includeFiles}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      
      if (collectionType === 'macro') {
        // Add macro-specific type annotation
        return {
          ...data,
          type: "macro"
        } as AudioMacro;
      }
      
      return data;
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

  /* Collection file endpoints
  *******************************/

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

  // Unified function to add items to a collection (handles both single and multiple items)
  api.addToCollection = async (
    collectionId: number,
    items: number[],
    position?: number
  ): Promise<boolean> => {
    if (items.length === 0) return true;
    
    if (collectionType === 'sfx') {
      // For macros, call the macro-specific endpoints
      if (items.length === 1) {
        // Add single macro to collection
        console.log(`Adding macro ${items[0]} to collection ${collectionId}...`);
        const response = await fetch(`/api/audio/collections/sfx/${collectionId}/macros`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            macroId: items[0],
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return true;
      } else {
        // Add multiple macros to collection
        const response = await fetch(`/api/audio/collections/sfx/${collectionId}/macros/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            macroIds: items,
            startPosition: position
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        return true;
      }
    }

    if (items.length === 1) {
      return await api.addFileToCollection(collectionId, items[0], position);
    } else {
      return await api.addFilesToCollection(collectionId, items, position);
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
  api.getCollectionFiles = async (collectionId: number): Promise<AudioFile[]> => {
    try {
      const collection = await api.getCollectionById(collectionId, true);

      if (!collection.items) {
        return [];
      }
      
      // Convert to AudioItem format for AudioItemList component
      return collection.items.map((item: AudioFile) => ({
        id: item.id,
        name: item.name,
        position: item.position,
        type: item.type,
        fileType: item.fileType,
        duration: item.duration,
        volume: item.volume,
        delay: item.delay,
        fileUrl: item.fileUrl,
        filePath: item.filePath,
        folderId: item.folderId,
        addedAt: item.addedAt,
        active: item.active,
      }));
    } catch (error) {
      console.error(`Error fetching files for ${collectionType} ${collectionId}:`, error);
      throw error;
    }
  };

  api.editItem = async ( // Edit item properties
    collectionId: number,
    fileId: number,
    params: any
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error(`Error editing ${collectionType} ${collectionId}:`, error);
      throw error;
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

  api.updateItem = async ( // Update item properties
    collectionId: number,
    fileId: number,
    params: any
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files/${fileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error(`Error updating ${collectionType} ${collectionId}:`, error);
      throw error;
    }
  };
  return api;
}

export const packApi = {
  // Get all collections of all types
  getAllCollections: async (): Promise<AudioCollection[]> => {
    try {
      const response = await fetch(`/api/audio/collections`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const collections = await response.json();
      return collections.map((collection: any) => ({
        id: collection.collection_id,
        name: collection.name,
        description: collection.description || undefined,
        type: collection.type,
        itemCount: collection.itemCount || 0,
      }));
    } catch (error) {
      console.error('Error fetching collections:', error);
      throw error;
    }
  },

  // Get all packs with their collections
  getAllPacks: async (): Promise<AudioCollection[]> => {
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

  getPackCollections: async (packId: number): Promise<AudioCollection[]> => {
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
export const macroApi = createCollectionApi('macro');