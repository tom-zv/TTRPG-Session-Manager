import type { QueryClient, QueryFilters } from "@tanstack/react-query";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";
import { ENTITY_KEYS } from "../../api/dnd5e/entities/query/keys.js";
import { ENCOUNTER_KEYS } from "../../api/dnd5e/encounters/query/keys.js";
import { loadEntityTemplates } from "./entityTemplateLoader.js";

type TemplateMap = Record<number, DnD5eEntityDetails>;
const templateQueries = [...ENCOUNTER_KEYS.all, "entityTemplates"];

export const entityToSummary = (entity: DnD5eEntityDetails): DnD5eEntitySummary => ({
  templateId: entity.templateId, name: entity.name, role: entity.role,
  hp: entity.hp, cr: entity.cr, inParty: entity.settings?.party?.member ?? false,
});

function updateSummaries(queryClient: QueryClient, templates: DnD5eEntityDetails[]): void {
  const summaries = new Map(templates.map(template => [template.templateId, entityToSummary(template)]));
  void queryClient.cancelQueries({ queryKey: ENTITY_KEYS.summaries() });
  queryClient.setQueryData<DnD5eEntitySummary[]>(ENTITY_KEYS.summaries(), current => current &&
    [...current.filter(item => !summaries.has(item.templateId)), ...summaries.values()]
      .sort((a, b) => a.name.localeCompare(b.name)));
  if (!queryClient.getQueryData(ENTITY_KEYS.summaries())) {
    void queryClient.invalidateQueries({ queryKey: ENTITY_KEYS.summaries() });
  }
}

function cachedTemplate(queryClient: QueryClient, id: number): DnD5eEntityDetails | undefined {
  return queryClient.getQueryData<DnD5eEntityDetails>(ENTITY_KEYS.template(id)) ??
    queryClient.getQueriesData<TemplateMap>({ queryKey: templateQueries })
      .map(([, templates]) => templates?.[id]).find(template => template !== undefined);
}

export function updateEntitySettingsCache(queryClient: QueryClient, templateId: number, settings: EntitySettings): void {
  const existing = cachedTemplate(queryClient, templateId);
  if (existing) updateTemplateCache(queryClient, { ...existing, settings });
  else void queryClient.invalidateQueries({ queryKey: ENTITY_KEYS.summaries() });
}

export function updateEntityControllersCache(queryClient: QueryClient, templateId: number, controllerUserIds: number[]): void {
  const existing = cachedTemplate(queryClient, templateId);
  if (existing) updateTemplateCache(queryClient, { ...existing, controllerUserIds });
}

export function updateTemplateCache(queryClient: QueryClient, template: DnD5eEntityDetails): void {
  // Cancellation takes effect synchronously, before any response can publish older data.
  void queryClient.cancelQueries({ queryKey: ENTITY_KEYS.template(template.templateId) });
  const maps: QueryFilters = {
    queryKey: templateQueries,
    predicate: query => Array.isArray(query.queryKey[4]) && query.queryKey[4].includes(template.templateId),
  };
  void queryClient.cancelQueries(maps);
  queryClient.setQueryData(ENTITY_KEYS.template(template.templateId), template);
  updateSummaries(queryClient, [template]);
  queryClient.setQueriesData<TemplateMap>(maps, current =>
    current?.[template.templateId] ? { ...current, [template.templateId]: template } : current);
  // Restart canceled maps too, including maps whose first load has not completed.
  void queryClient.invalidateQueries(maps);
}

export function removeTemplateCache(queryClient: QueryClient, id: number): void {
  void queryClient.cancelQueries({ queryKey: ENTITY_KEYS.summaries() });
  queryClient.removeQueries({ queryKey: ENTITY_KEYS.template(id) });
  queryClient.setQueryData<DnD5eEntitySummary[]>(ENTITY_KEYS.summaries(), current =>
    current?.filter(item => item.templateId !== id));
  if (!queryClient.getQueryData(ENTITY_KEYS.summaries())) {
    void queryClient.invalidateQueries({ queryKey: ENTITY_KEYS.summaries() });
  }
}

// Serialize explicit refreshes so a notification during a join refresh is never lost.
const refreshes = new WeakMap<QueryClient, Promise<void>>();
export function refreshDnD5eEncounterTemplates(
  queryClient: QueryClient,
  encounterState: DnD5eEncounterState,
  templateId?: number
): Promise<void> {
  const refresh = (refreshes.get(queryClient) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const ids = templateId !== undefined ? [templateId]
      : [...new Set(encounterState.entityStates.map(entity => entity.templateId))];
    if (!ids.length) return;
    for (const id of ids) {
      void queryClient.cancelQueries({ queryKey: ENTITY_KEYS.template(id) });
      void queryClient.invalidateQueries({ queryKey: ENTITY_KEYS.template(id), refetchType: "none" });
    }
    const templates = await loadEntityTemplates(queryClient, ids);
    updateSummaries(queryClient, Object.values(templates));
    // The join publishes its state only after this completes. Do not patch/cancel maps here.
    await queryClient.invalidateQueries({ queryKey: templateQueries });
  });
  refreshes.set(queryClient, refresh);
  return refresh;
}
