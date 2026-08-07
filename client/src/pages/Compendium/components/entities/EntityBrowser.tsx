import React, { useDeferredValue, useMemo, useState } from "react";
import type { DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import {
  useDnD5eEntity,
  useDnD5eEntitySummaries,
} from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import { BrowserLayout, useBrowserDetail } from "../browser/BrowserLayout.js";
import { EntityFilters } from "./EntityFilters.js";
import { EntityList } from "./EntityList.js";
import { EntitySheet } from "./EntitySheet.js";
import {
  EMPTY_ENTITY_FILTERS,
  collectEntityFilterOptions,
  filterEntities,
  sortEntities,
  type EntityFilterState,
  type EntitySort,
} from "./entityFilters.js";
import browserStyles from "../browser/Browser.module.css";

type EntityBrowserProps = {
  /** The page and tab stay mounted while hidden; load the index the first time this is shown. */
  isActive: boolean;
  /** The Compendium owns the selection and its URL (?entity=<id>). */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

/**
 * The GM's catalog of reusable entity templates. Summaries feed the list; the selected template
 * loads in full through the Encounter Manager's template loader and shares its cache.
 */
export const EntityBrowser: React.FC<EntityBrowserProps> = ({ isActive, selectedId, onSelect }) => {
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: entities, isLoading, error } = useDnD5eEntitySummaries({ enabled: hasBeenActive });
  const [filters, setFilters] = useState<EntityFilterState>(EMPTY_ENTITY_FILTERS);
  const [sort, setSort] = useState<EntitySort>("name");
  const detailState = useBrowserDetail({ selectedId });

  const deferredFilters = useDeferredValue(filters);
  const visibleEntities = useMemo(
    () => sortEntities(filterEntities(entities ?? [], deferredFilters), sort),
    [entities, deferredFilters, sort]
  );
  const filterOptions = useMemo(() => collectEntityFilterOptions(entities ?? []), [entities]);
  const selectedSummary = entities?.find(entity => entity.templateId === selectedId);

  if (isLoading || !hasBeenActive) return <p className={browserStyles.status}>Loading entities…</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  if (!entities || entities.length === 0) {
    return <p className={browserStyles.status}>No entities yet. Create them in the Encounter Manager.</p>;
  }

  return (
    <BrowserLayout
      detailState={detailState}
      toolbar={
        <EntityFilters
          filters={filters}
          onChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          options={filterOptions}
          resultCount={visibleEntities.length}
          total={entities.length}
        />
      }
      list={
        visibleEntities.length === 0 ? (
          <p className={browserStyles.status}>No entities match.</p>
        ) : (
          <EntityList
            entities={visibleEntities}
            label="Entities"
            selectedId={selectedId}
            onSelect={(id, via) => {
              onSelect(id);
              detailState.onRowSelected(id, via);
            }}
            onActivate={detailState.open}
          />
        )
      }
      detail={<EntityDetail summary={selectedSummary} selectedId={selectedId} />}
      detailLabel="Entity details"
      dialogTitle={selectedSummary?.name ?? "Entity"}
      hasSelection={selectedSummary !== undefined}
    />
  );
};

const EntityDetail: React.FC<{ summary?: DnD5eEntitySummary; selectedId: number | null }> = ({ summary, selectedId }) => {
  // Only a template in the index is loaded; an unknown ID shows a message instead of a failed request.
  const { data: entity, error, isLoading } = useDnD5eEntity(summary?.templateId ?? 0);

  if (selectedId === null) return <p className={browserStyles.status}>Select an entity to see its details.</p>;
  if (!summary) return <p className={browserStyles.status}>That entity is not in the compendium.</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  if (isLoading || !entity) return <p className={browserStyles.status}>Loading {summary.name}…</p>;
  return <EntitySheet entity={entity} />;
};
