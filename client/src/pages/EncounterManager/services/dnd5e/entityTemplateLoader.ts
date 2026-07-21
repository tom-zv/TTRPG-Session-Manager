import { isCancelledError, type QueryClient } from "@tanstack/react-query";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import DnD5eEntityApi from "../../api/dnd5e/entities/dnd5eEntityApi.js";
import { ENTITY_KEYS } from "../../api/dnd5e/entities/query/keys.js";

type PendingTemplate = {
  id: number;
  signal: AbortSignal;
  resolve: (entity: DnD5eEntityDetails) => void;
  reject: (error: unknown) => void;
};

// Query owns each detail entry; requests started together share the HTTP batch.
const queues = new WeakMap<QueryClient, PendingTemplate[]>();

async function flush(entries: PendingTemplate[]): Promise<void> {
  for (let offset = 0; offset < entries.length; offset += 100) {
    const chunk = entries.slice(offset, offset + 100);
    const controller = new AbortController();
    const abortIfUnused = () => {
      if (chunk.every(entry => entry.signal.aborted)) controller.abort();
    };
    chunk.forEach(entry => entry.signal.addEventListener("abort", abortIfUnused));
    abortIfUnused();
    try {
      const entities = await DnD5eEntityApi.getEntityTemplatesByIds(chunk.map(entry => entry.id), controller.signal);
      const byId = new Map(entities.map(entity => [entity.templateId, entity]));
      for (const entry of chunk) {
        if (entry.signal.aborted) {
          entry.reject(entry.signal.reason);
          continue;
        }
        const entity = byId.get(entry.id);
        if (entity) entry.resolve(entity);
        else entry.reject(new Error(`Entity template not found for ID: ${entry.id}`));
      }
    } catch (error) {
      chunk.forEach(entry => entry.reject(error));
    } finally {
      chunk.forEach(entry => entry.signal.removeEventListener("abort", abortIfUnused));
    }
  }
}

// eslint-disable-next-line @tanstack/query/exhaustive-deps -- client scopes the scheduler, not the entity identity
export const entityTemplateQuery = (queryClient: QueryClient, id: number) => ({
  queryKey: ENTITY_KEYS.template(id),
  staleTime: Infinity,
  queryFn: ({ signal }: { signal: AbortSignal }) => new Promise<DnD5eEntityDetails>((resolve, reject) => {
    let queue = queues.get(queryClient);
    if (!queue) {
      queue = [];
      queues.set(queryClient, queue);
      const entries = queue;
      queueMicrotask(() => {
        queues.delete(queryClient);
        void flush(entries);
      });
    }
    queue.push({ id, signal, resolve, reject });
  }),
});

export async function loadEntityTemplates(queryClient: QueryClient, ids: number[], signal?: AbortSignal) {
  const entities = await Promise.all([...new Set(ids)].map(async id => {
    // A mutation or explicit refresh can supersede a read shared by several maps.
    // Rejoin the authoritative detail query rather than failing those maps.
    for (;;) {
      signal?.throwIfAborted();
      try {
        return await queryClient.fetchQuery(entityTemplateQuery(queryClient, id));
      } catch (error) {
        if (!isCancelledError(error)) throw error;
        await Promise.resolve();
      }
    }
  }));
  signal?.throwIfAborted();
  // Another template can refresh while this map waits for its slowest member.
  // Compose from current cache entries, not snapshots captured before that refresh.
  return Object.fromEntries(entities.map(entity => [entity.templateId,
    queryClient.getQueryData<DnD5eEntityDetails>(ENTITY_KEYS.template(entity.templateId)) ?? entity]));
}
