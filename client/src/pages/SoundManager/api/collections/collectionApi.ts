import {
  AudioFile,
  AudioCollection,
  AudioMacro,
  AudioItem,
} from "../../types/AudioItem.js";
import { CollectionType } from "shared/audio/types.js";


import {
  transformDtoToAudioMacro,
  transformDtoToAudioCollection,
  MacroApiResponse,
  CollectionApiResponse
} from "./transformers.js";

// ----------------------
// COLLECTION API FACTORY
// ----------------------

export interface UpdateFileParams {
  active?: boolean;
  volume?: number;
  delay?: number;
}

export interface CollectionApi {
  getAllCollections: (
    includeFiles?: boolean
  ) => Promise<AudioCollection[] | AudioMacro[]>;
  
  getCollectionById: (
    id: number,
    includeFiles?: boolean
  ) => Promise<AudioCollection | AudioMacro>;
  createCollection: (name: string, description?: string) => Promise<number>;

  updateCollection: (
    id: number,
    name?: string,
    description?: string,
    imagePath?: string,
    volume?: number,
    active?: boolean
  ) => Promise<boolean>;

  deleteCollection: (id: number) => Promise<boolean>;

  getCollectionFiles: (collectionId: number) => Promise<AudioFile[]>;

  addFileToCollection: (
    collectionId: number,
    fileId: number,
    position?: number
  ) => Promise<boolean>;

  addFilesToCollection: (
    collectionId: number,
    fileIds: number[],
    startPosition?: number
  ) => Promise<boolean>;

  addToCollection: (
    collectionId: number,
    items: AudioItem[],
    position?: number
  ) => Promise<boolean>;

  updateFile: (
    collectionId: number,
    fileId: number,
    params: UpdateFileParams
  ) => Promise<boolean>;

  removeMacroFromCollection?: (
    collectionId: number,
    macroId: number
  ) => Promise<boolean>;

  removeFilesFromCollection: (
    collectionId: number,
    audioFiles: AudioItem[]
  ) => Promise<boolean>;

  updateFilePosition: (
    collectionId: number,
    fileId: number,
    targetPosition: number
  ) => Promise<boolean>;

  updateFileRangePosition: (
    collectionId: number,
    sourceStartPosition: number,
    sourceEndPosition: number,
    targetPosition: number
  ) => Promise<boolean>;

}

export function createCollectionApi(
  collectionType: CollectionType
): CollectionApi {
  let API_URL = `/api/audio/collections/${collectionType}`;
  if (collectionType === "macro") {
    API_URL = `/api/audio/macro`;
  }

  const api = {} as CollectionApi;

  // ----------------------
  // getAllCollections
  // ----------------------
  api.getAllCollections = async (): Promise<
    AudioCollection[] | AudioMacro[]
  > => {
    try {
      const url = `${API_URL}?includeFiles=true`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const items: (CollectionApiResponse | MacroApiResponse)[] =
        await response.json();

      if (collectionType === "macro") {
        return (items as MacroApiResponse[]).map(transformDtoToAudioMacro);
      } else {
        return (items as CollectionApiResponse[]).map((dto) =>
          transformDtoToAudioCollection(dto, collectionType)
        );
      }
    } catch (error) {
      console.error(`Error fetching ${collectionType} collections:`, error);
      throw error;
    }
  };

  // ----------------------
  // getCollectionById
  // ----------------------
  api.getCollectionById = async (
    id: number,
    includeFiles: boolean = true
  ): Promise<AudioCollection | AudioMacro> => {
    try {
      const response = await fetch(
        `${API_URL}/${id}?includeFiles=${includeFiles}`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const data: CollectionApiResponse | MacroApiResponse =
        await response.json();

      if (collectionType === "macro") {
        return transformDtoToAudioMacro(data as MacroApiResponse);
      } else {
        return transformDtoToAudioCollection(
          data as CollectionApiResponse,
          collectionType
        );
      }
    } catch (error) {
      console.error(
        `Error fetching ${collectionType} collection with ID ${id}:`,
        error
      );
      throw error;
    }
  };

  // ----------------------
  // createCollection
  // ----------------------
  api.createCollection = async (
    name: string,
    description?: string
  ): Promise<number> => {
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
      return result.id;
    } catch (error) {
      console.error(`Error creating ${collectionType}:`, error);
      throw error;
    }
  };

  // ----------------------
  // updateCollection
  // ----------------------
  api.updateCollection = async (
    id: number,
    name?: string,
    description?: string,
    imagePath?: string,
    volume?: number,
  ): Promise<boolean> => {
    try {
      const body: {
        name?: string;
        description?: string;
        imagePath?: string;
        volume?: number;
      } = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (imagePath !== undefined) body.imagePath = imagePath;
      if (volume !== undefined) body.volume = volume;
    
      if (Object.keys(body).length === 0) {
        throw new Error("No update parameters provided");
      }

      const response = await fetch(`${API_URL}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  // ----------------------
  // deleteCollection
  // ----------------------
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

  // ----------------------
  // getCollectionFiles
  // ----------------------
  api.getCollectionFiles = async (
    collectionId: number
  ): Promise<AudioFile[]> => {
    try {
      const collection = await api.getCollectionById(collectionId, true);
      const fileItems = (collection.items ?? []).filter(
        (item): item is AudioFile => item.type === "file"
      );
      return fileItems;
    } catch (error) {
      console.error(
        `Error fetching files for ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  // ----------------------
  // addFileToCollection
  // ----------------------
  api.addFileToCollection = async (
    collectionId: number,
    fileId: number,
    position?: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          position: position !== undefined ? position : null,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error(
        `Error adding file ${fileId} to ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  // ----------------------
  // addFilesToCollection
  // ----------------------
  api.addFilesToCollection = async (
    collectionId: number,
    fileIds: number[],
    startPosition?: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/${collectionId}/files/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: fileIds,
          startPosition: startPosition !== undefined ? startPosition : null,
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error(
        `Error adding files to ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  // ----------------------
  // addToCollection (macro + file)
  // ----------------------
  api.addToCollection = async (
    collectionId: number,
    items: AudioItem[],
    position?: number
  ): Promise<boolean> => {
    if (items.length === 0) return true;
    
    // Separate macros vs. files
    const macroItems = items.filter((item) => item.type === "macro");
    const fileItems = items.filter((item) => item.type !== "macro");

    // Process macros first
    if (macroItems.length > 0) {
      if (collectionType !== "sfx") {
        console.warn("Macros can only be added to SFX collections");
      } else {
        if (macroItems.length === 1) {
          const response = await fetch(
            `/api/audio/collections/sfx/${collectionId}/macros`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                macroId: macroItems[0].id,
                position,
              }),
            }
          );
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
        } else {
          const response = await fetch(
            `/api/audio/collections/sfx/${collectionId}/macros/batch`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                macroIds: macroItems.map((item) => item.id),
                startPosition: position,
              }),
            }
          );
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
        }
      }
    }

    // Process file items next
    if (fileItems.length > 0) {
      if (fileItems.length === 1) {
        return await api.addFileToCollection(
          collectionId,
          fileItems[0].id,
          position
        );
      } else {
        return await api.addFilesToCollection(
          collectionId,
          fileItems.map((item) => item.id),
          position
        );
      }
    }

    return true;
  };

  // ----------------------
  // updateFile (edit file properties)
  // ----------------------
  api.updateFile = async (
    collectionId: number,
    fileId: number,
    params: UpdateFileParams
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${API_URL}/${collectionId}/files/${fileId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error(`Error editing ${collectionType} ${collectionId}:`, error);
      throw error;
    }
  };

  // ----------------------
  // removeMacroFromCollection (only for SFX)
  // ----------------------
  if (collectionType === "sfx") {
    api.removeMacroFromCollection = async (
      collectionId: number,
      macroId: number
    ): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/audio/collections/sfx/${collectionId}/macros/${macroId}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return true;
      } catch (error) {
        console.error(
          `Error removing macro ${macroId} from SFX collection ${collectionId}:`,
          error
        );
        throw error;
      }
    };
  }

  // ----------------------
  // removeFilesFromCollection
  // ----------------------
  api.removeFilesFromCollection = async (
    collectionId: number,
    audioFiles: AudioItem[]
  ): Promise<boolean> => {
    for (const file of audioFiles) {
      try {
        if (
          file.type === "macro" &&
          collectionType === "sfx" &&
          api.removeMacroFromCollection
        ) {
          await api.removeMacroFromCollection(collectionId, file.id);
        } else {
          const response = await fetch(
            `${API_URL}/${collectionId}/files/${file.id}`,
            {
              method: "DELETE",
            }
          );
          if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
          }
        }
      } catch (error) {
        console.error(
          `Error removing item ${file.id} from ${collectionType} ${collectionId}:`,
          error
        );
        throw error;
      }
    }
    return true;
  };

  // ----------------------
  // updateFilePosition
  // ----------------------
  api.updateFilePosition = async (
    collectionId: number,
    fileId: number,
    targetPosition: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${API_URL}/${collectionId}/files/${fileId}/position`,
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
        `Error updating position for file ${fileId} in ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  // ----------------------
  // updateFileRangePosition
  // ----------------------
  api.updateFileRangePosition = async (
    collectionId: number,
    sourceStartPosition: number,
    sourceEndPosition: number,
    targetPosition: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${API_URL}/${collectionId}/files/positions`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceStartPosition,
            sourceEndPosition,
            targetPosition,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return true;
    } catch (error) {
      console.error(
        `Error moving files in ${collectionType} ${collectionId}:`,
        error
      );
      throw error;
    }
  };

  return api as CollectionApi;
}

// Pre‐configured APIs for convenience:
export const playlistApi = createCollectionApi("playlist");
export const sfxApi = createCollectionApi("sfx");
export const ambienceApi = createCollectionApi("ambience");
export const macroApi = createCollectionApi("macro");
