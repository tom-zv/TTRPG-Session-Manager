import { QueryClient } from '@tanstack/react-query';
import { AudioCollection, AudioMacro } from '../../types/AudioItem.js';
import { collectionKeys } from '../../api/collections/useCollectionQueries.js';

export let queryClient = new QueryClient();
let initialized = false;

export function initQueryClient(client: QueryClient) {
  queryClient = client;
  initialized = true;
}

export function getCollectionFromCache(
  type: 'playlist' | 'sfx' | 'ambience' | 'macro',
  id: number
): AudioCollection | AudioMacro | undefined {
 
  const direct = queryClient.getQueryData(collectionKeys.collection(type, id));
  if (direct) return direct as AudioCollection | AudioMacro;

  // Otherwise fall back to fetching the “type” list and finding by ID
  const list = queryClient.getQueryData(collectionKeys.type(type)) as AudioCollection;
  return list?.items?.find(item => item.id === id) as AudioCollection | undefined;
}
