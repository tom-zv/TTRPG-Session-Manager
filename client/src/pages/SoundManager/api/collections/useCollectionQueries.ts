import { useQuery } from "@tanstack/react-query";
import {
  playlistApi,
  sfxApi,
  ambienceApi,
  macroApi,
  CollectionApi,
} from "./collectionApi.js";
import { CollectionType } from "shared/audio/types.js";
import { AudioCollection } from "../../types/AudioItem.js";

/* useCollectionQueries.ts
 * hook utilising React Query to handle fetching, caching, syncing and updating Audio data from the server DB.
 ****************************************************************************************************************/

// Add a new type for parent collection information
export type ParentCollectionInfo = {
  type: CollectionType;
  id: number;
};

export const getApiForType = (type: CollectionType): CollectionApi => {
  switch (type) {
    case "playlist":
      return playlistApi;
    case "sfx":
      return sfxApi;
    case "ambience":
      return ambienceApi;
    case "macro":
      return macroApi;
    default:
      throw new Error(`Unsupported collection type: ${type}`);
  }
};

/* Query keys, organized in a hierarchical structure,
 *
 *     all                 specific type               specific collection    
 * ['collections'] --> ['collections', 'type'] --> ['collections', 'type', 'id'] 
 */
export const collectionKeys = {
  all: ["collections"] as const,
  type: (type: CollectionType) => [...collectionKeys.all, type] as const,
  collection: (type: CollectionType, id: number) =>
    [...collectionKeys.type(type), id] as const,
};

// Fetch all collections of a specific type
export const useGetCollectionsOfType = (type: CollectionType, options = {}) => {
  const api = getApiForType(type);

  return useQuery({
    queryKey: collectionKeys.type(type),
    queryFn: async () => {
      const collections = await api.getAllCollections();
      // Transform the array of collections into a virtual collection object
      return {
        id: -1,
        type: type,
        name: `All ${type}s`,
        items: collections,
      } as AudioCollection;
    },
    ...options,
  });
};

// Fetch all items in a specific collection
export const useGetCollectionById = (
  type: CollectionType,
  id: number,
  options = {}
) => {
  const api = getApiForType(type);

  return useQuery({
    queryKey: collectionKeys.collection(type, id),
    queryFn: () => api.getCollectionById(id, true),
    enabled: id > 0,
    ...options,
  });
};


export function useCollectionQuery(
  type: CollectionType,
  id: number,
  options = {}
) {
  const allQuery = useGetCollectionsOfType(type, options);
  const singleQuery = useGetCollectionById(type, id, options);
  
  return id === -1 ? allQuery : singleQuery;
}