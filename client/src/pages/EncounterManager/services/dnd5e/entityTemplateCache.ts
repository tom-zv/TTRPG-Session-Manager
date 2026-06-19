import type { QueryClient } from "@tanstack/react-query";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import type { DnD5eEncounterState } from "shared/domain/encounters/dnd5e/encounter.js";
import type { EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";
import { ENTITY_KEYS } from "../../api/dnd5e/entities/query/keys.js";
import { ENCOUNTER_KEYS } from "../../api/dnd5e/encounters/query/keys.js";
import DnD5eEntityApi from "../../api/dnd5e/entities/dnd5eEntityApi.js";

type TemplateMap = Record<number, DnD5eEntityDetails>;
const templateQueries = [...ENCOUNTER_KEYS.all, "entityTemplates"];

export function updateEntitySettingsCache(queryClient: QueryClient, templateId: number, settings: EntitySettings): void {
  const existing = queryClient.getQueryData<DnD5eEntityDetails>(ENTITY_KEYS.template(templateId));
  if (existing) updateTemplateCache(queryClient, { ...existing, settings });
}

function updateTemplateCache(queryClient: QueryClient, template: DnD5eEntityDetails): void {
  queryClient.setQueryData(ENTITY_KEYS.template(template.templateId), template);
  queryClient.setQueriesData<TemplateMap>({ queryKey: templateQueries }, (current) =>
    current?.[template.templateId] ? { ...current, [template.templateId]: template } : current);
}

/**
 * Fetch the latest version of an encounter's entity templates (or of one of them) and rebuild the
 * per-encounter template maps from it.
 *
 * Templates are written to their own cache entries first and the encounter maps are then
 * invalidated, so a map that is being fetched at the same moment is rebuilt as well instead of
 * being left without data.
 */
export async function refreshDnD5eEncounterTemplates(
  queryClient: QueryClient,
  encounterState: DnD5eEncounterState,
  templateId?: number
): Promise<void> {
  const ids = templateId !== undefined
    ? [templateId]
    : [...new Set(encounterState.entityStates.map((entity) => entity.templateId))];
  if (!ids.length) return;
  const templates = await DnD5eEntityApi.getEntityTemplatesByIds(ids);
  templates.forEach((template) => queryClient.setQueryData(ENTITY_KEYS.template(template.templateId), template));
  await queryClient.invalidateQueries({ queryKey: templateQueries });
}
