// ----------------------
// PACK API IMPLEMENTATION
// ----------------------

import { CollectionType } from "shared/audio/types.js";
import { AudioCollection } from "../../types/AudioItem.js";

export interface PackApi {
  getAllPacks: () => Promise<AudioCollection[]>;
  createPack: (name: string, description?: string) => Promise<number>;
  deletePack: (id: number) => Promise<boolean>;
  addCollectionToPack: (
    packId: number,
    collectionId: number
  ) => Promise<boolean>;
  getPackCollections: (packId: number) => Promise<AudioCollection[]>;
}

export const packApi: PackApi = {
  getAllPacks: async (): Promise<AudioCollection[]> => {
    try {
      const response = await fetch(`/api/audio/collections/pack`);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const packs: {
        pack_id: number;
        name: string;
        description?: string;
      }[] = await response.json();

      return packs.map((p) => ({
        id: p.pack_id,
        name: p.name,
        description: p.description || undefined,
        type: "pack",
        itemCount: 0,
        position: 0,
        items: [],
      }));
    } catch (error) {
      console.error("Error fetching packs:", error);
      throw error;
    }
  },

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
      const result: { pack_id: number } = await response.json();
      return result.pack_id;
    } catch (error) {
      console.error(`Error creating pack:`, error);
      throw error;
    }
  },

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
    collectionId: number
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `/api/audio/collections/pack/${packId}/collections`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId }),
        }
      );
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
      const response = await fetch(
        `/api/audio/collections/pack/${packId}/collections`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      const collections: {
        collection_id: number;
        name: string;
        description?: string;
        type: string;
        itemCount?: number;
      }[] = await response.json();

      return collections.map((c) => ({
        id: c.collection_id,
        name: c.name,
        description: c.description || undefined,
        type: c.type as CollectionType,
        itemCount: c.itemCount ?? 0,
        position: 0,
        items: [],
      }));
    } catch (error) {
      console.error(`Error fetching collections for pack ${packId}:`, error);
      throw error;
    }
  },
};