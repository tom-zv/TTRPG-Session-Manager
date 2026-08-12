import React, { useDeferredValue, useMemo, useState } from "react";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import Dialog from "src/components/Dialog/Dialog.js";
import {
  useDnD5eEntity,
  useDnD5eEntitySummaries,
} from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import { CreateEntityForm } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityForm/CreateEntityForm.js";
import { EditEntityForm } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityForm/EditEntityForm.js";
import { MdEdit } from "react-icons/md";
import { ActionMenu } from "../ActionMenu/ActionMenu.js";
import { BrowserLayout, useBrowserDetail } from "../browser/BrowserLayout.js";
import { EntityFilters } from "./EntityFilters.js";
import { EntityList } from "./EntityList.js";
import { EntitySheet } from "./EntitySheet.js";
import { InventorySection } from "./InventorySection.js";
import type { ItemMutationScope } from "../../api/query/itemCache.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { useMountedViewerScope } from "../../hooks/useMountedViewerScope.js";
import { hasInventory } from "shared/domain/encounters/dnd5e/inventory.js";
import {
  EMPTY_ENTITY_FILTERS,
  collectEntityFilterOptions,
  filterEntities,
  sortEntities,
  type EntityFilterState,
  type EntitySort,
} from "./entityFilters.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Entities.module.css";

type EntityBrowserProps = {
  /** The signed-in GM; viewer-scoped caches such as inventories are keyed by them. */
  viewer: ItemViewer;
  /** The page and tab stay mounted while hidden; load the index the first time this is shown. */
  isActive: boolean;
  /** The Compendium owns the selection and its URL (?entity=<id>). */
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

type EntityFormMode = { kind: "create" } | { kind: "edit"; entity: DnD5eEntityDetails };

/**
 * The GM's catalog of reusable entity templates. Summaries feed the list; the selected template
 * loads in full through the Encounter Manager's template loader and shares its cache. Create and
 * edit reuse the Encounter Manager's entity forms and mutations.
 */
export const EntityBrowser: React.FC<EntityBrowserProps> = ({ viewer, isActive, selectedId, onSelect }) => {
  const scope = useMountedViewerScope(viewer);
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: entities, isLoading, error } = useDnD5eEntitySummaries({ enabled: hasBeenActive });
  const [filters, setFilters] = useState<EntityFilterState>(EMPTY_ENTITY_FILTERS);
  const [sort, setSort] = useState<EntitySort>("name");
  // The edit form keeps the template it opened with, so a refresh of the cache never resets the draft.
  const [formMode, setFormMode] = useState<EntityFormMode | null>(null);
  const detailState = useBrowserDetail({ selectedId });

  const deferredFilters = useDeferredValue(filters);
  const visibleEntities = useMemo(
    () => sortEntities(filterEntities(entities ?? [], deferredFilters), sort),
    [entities, deferredFilters, sort]
  );
  const filterOptions = useMemo(() => collectEntityFilterOptions(entities ?? []), [entities]);
  const selectedSummary = entities?.find(entity => entity.templateId === selectedId);
  // A selection the filters hide (after a save, or from a link) stays open beside the list.
  const hiddenSelection = selectedSummary && !visibleEntities.some(entity => entity.templateId === selectedSummary.templateId)
    ? selectedSummary
    : undefined;

  const closeForm = () => setFormMode(null);
  const newEntityButton = (
    <button type="button" className={browserStyles.primaryButton} onClick={() => setFormMode({ kind: "create" })}>
      New entity
    </button>
  );

  // Rendered in the same place whatever the catalog shows, so the first save from an empty catalog
  // does not remount the open form while it is still submitting.
  const formDialog = (
    <Dialog
      isOpen={formMode !== null}
      onClose={closeForm}
      title={formMode?.kind === "edit" ? `Edit ${formMode.entity.name}` : "New entity"}
      className="entity-form-dialog"
    >
      {formMode?.kind === "create" && (
        <CreateEntityForm key="create" onCancel={closeForm} onCreated={saved => onSelect(saved.templateId)} />
      )}
      {formMode?.kind === "edit" && (
        <EditEntityForm
          key={`edit-${formMode.entity.templateId}`}
          entity={formMode.entity}
          onCancel={closeForm}
          onSaved={saved => onSelect(saved.templateId)}
        />
      )}
    </Dialog>
  );

  let content: React.ReactNode;
  if (isLoading || !hasBeenActive) {
    content = <p className={browserStyles.status}>Loading entities…</p>;
  } else if (error) {
    content = <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  } else if (!entities || entities.length === 0) {
    content = (
      <div className={browserStyles.status}>
        <p>No entities yet.</p>
        {newEntityButton}
      </div>
    );
  } else {
    content = (
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
            actions={newEntityButton}
          />
        }
        list={
          <>
            {hiddenSelection && (
              <p className={styles.hiddenSelection}>
                {hiddenSelection.name} is hidden by the current filters.
                <button type="button" className={browserStyles.secondaryButton} onClick={() => setFilters(EMPTY_ENTITY_FILTERS)}>
                  Show in list
                </button>
              </p>
            )}
            {visibleEntities.length === 0 ? (
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
            )}
          </>
        }
        detail={
          <EntityDetail
            summary={selectedSummary}
            selectedId={selectedId}
            scope={scope}
            onEdit={entity => setFormMode({ kind: "edit", entity })}
          />
        }
        detailLabel="Entity details"
        dialogTitle={selectedSummary?.name ?? "Entity"}
        // Only while shown: following an inventory link to an item must not leave this dialog over Items.
        hasSelection={isActive && selectedSummary !== undefined}
      />
    );
  }

  return (
    <>
      {content}
      {formDialog}
    </>
  );
};

type EntityDetailProps = {
  summary?: DnD5eEntitySummary;
  selectedId: number | null;
  scope: ItemMutationScope;
  onEdit: (entity: DnD5eEntityDetails) => void;
};

const EntityDetail: React.FC<EntityDetailProps> = ({ summary, selectedId, scope, onEdit }) => {
  // Only a template in the index is loaded; an unknown ID shows a message instead of a failed request.
  const { data: entity, error, isLoading } = useDnD5eEntity(summary?.templateId ?? 0);

  if (selectedId === null) return <p className={browserStyles.status}>Select an entity to see its details.</p>;
  if (!summary) return <p className={browserStyles.status}>That entity is not in the compendium.</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  if (isLoading || !entity) return <p className={browserStyles.status}>Loading {summary.name}…</p>;
  return (
    <EntitySheet
      entity={entity}
      headerAction={
        <ActionMenu
          label={`Actions for ${entity.name}`}
          items={[{ label: "Edit", icon: <MdEdit />, onSelect: () => onEdit(entity) }]}
        />
      }
    >
      {/* Shown only while the template is eligible; stored items return when it is again. */}
      {hasInventory(entity) && <InventorySection entityId={entity.templateId} scope={scope} canEdit />}
    </EntitySheet>
  );
};
