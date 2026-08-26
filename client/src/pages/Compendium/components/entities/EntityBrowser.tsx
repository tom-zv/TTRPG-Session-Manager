import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { DnD5eEntityDetails, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";
import {
  useDnD5eEntity,
  useDnD5eEntitySummaries,
} from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import { MdContentCopy, MdEdit } from "react-icons/md";
import { ActionMenu } from "../ActionMenu/ActionMenu.js";
import { BrowserLayout, useBrowserDetail } from "../browser/BrowserLayout.js";
import { EntityFilters } from "./EntityFilters.js";
import { EntityList } from "./EntityList.js";
import { EntitySheet } from "./EntitySheet.js";
import {
  EntityEditor,
  type EntityEditorHandle,
  type EntitySaveProgress,
} from "./editor/EntityEditor.js";
import { createEditorBuffer, hasOpenInput, type EditorBuffer } from "./editor/EntityEditContext.js";
import { createEntityDraftState, type EntityDraftState } from "./editor/hooks/useEntityDraft.js";
import { createDefaultEntity, duplicateEntity, type EntityDraft } from "./editor/model/defaults.js";
import { InventorySection } from "./InventorySection.js";
import type { ItemMutationScope } from "../../api/query/itemCache.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import type { EntityEditLocation } from "../../hooks/useCompendiumUrl.js";
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
  /** The entity in edit mode, from the URL (?entity=<id>&edit=1, ?entity=new&from=<id>). */
  editing: EntityEditLocation | null;
  /** Open edit mode as a new history entry. */
  onEdit: (edit: EntityEditLocation) => void;
  /** Leave edit mode, selecting the saved template, keeping the selection (undefined) or clearing it (null). */
  onEditEnd: (selected?: number | null) => void;
};

/**
 * The one draft the browser keeps: it survives moving to another entity (the unsaved bar offers it
 * back) and the reader remounting. `serial` remounts the editor for each new draft.
 */
type DraftSlot = {
  serial: number;
  edit: EntityEditLocation;
  /** What the sheet renders under the draft: the template as loaded, or a homebrew shell. */
  entity: DnD5eEntityDetails;
  state: EntityDraftState;
  save: EntitySaveProgress;
  /** The editor left open when the reader unmounted, with its input; mutated by the editor. */
  buffer: EditorBuffer;
};

/**
 * A slot is kept aside when edit mode ends while it has changes, a save in flight (even of an
 * unchanged new entity, so revisiting it cannot send a second one) or input in an open editor.
 */
const worthKeeping = (slot: DraftSlot) => slot.state.dirty || slot.save.pending || hasOpenInput(slot.buffer);

const sameEdit = (left: EntityEditLocation, right: EntityEditLocation) =>
  left.target === right.target && (left.target !== "new" || left.from === right.from);

/** A sheet for a draft that has no template yet. */
const newEntityShell = (draft: EntityDraft): DnD5eEntityDetails => ({
  ...createDefaultEntity(draft.role),
  templateId: 0,
  createdAt: "",
  source: "homebrew",
  imported: false,
  locallyEdited: false,
});

const draftName = (slot: DraftSlot) => slot.state.draft.name.trim() || (slot.edit.target === "new" ? "a new entity" : slot.entity.name);

/**
 * The GM's catalog of reusable entity templates. Summaries feed the list; the selected template
 * loads in full through the Encounter Manager's template loader and shares its cache. Create, edit
 * and duplicate open an edit mode on the sheet; see `EntityEditor`.
 */
export const EntityBrowser: React.FC<EntityBrowserProps> = ({ viewer, isActive, selectedId, onSelect, editing, onEdit, onEditEnd }) => {
  const scope = useMountedViewerScope(viewer);
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: entities, isLoading, error } = useDnD5eEntitySummaries({ enabled: hasBeenActive });
  const [filters, setFilters] = useState<EntityFilterState>(EMPTY_ENTITY_FILTERS);
  const [sort, setSort] = useState<EntitySort>("name");
  const showingNew = editing?.target === "new";

  // The draft slot. It is created from the URL's edit location once its template has loaded, and
  // kept while it is worth keeping; otherwise it is dropped when edit mode ends.
  const [slot, setSlot] = useState<DraftSlot | null>(null);
  const [serial, setSerial] = useState(0);
  const known = (id: number | null) => id !== null && (entities?.some(entity => entity.templateId === id) ?? false);
  const editTarget = editing && editing.target !== "new" && known(editing.target) ? editing.target : 0;
  const duplicateFrom = showingNew && known(editing.from) ? editing.from ?? 0 : 0;
  const { data: editEntity } = useDnD5eEntity(editTarget);
  const { data: fromEntity, error: fromError } = useDnD5eEntity(duplicateFrom);
  const slotShown = slot !== null && editing !== null && sameEdit(slot.edit, editing);
  // On narrow screens the editor is always in the open reader, also after Forward to the selected
  // row's edit URL or a resize from the desktop layout. Closing the reader ends edit mode first.
  const detailState = useBrowserDetail({
    selectedId: showingNew ? `new:${editing.from ?? ""}` : selectedId,
    keepOpen: slotShown,
  });
  if (!slotShown) {
    if (slot && !worthKeeping(slot)) {
      setSlot(null);
    } else if (!slot && editing) {
      if (editing.target === "new" && (editing.from === null || fromEntity)) {
        const draft = fromEntity ? duplicateEntity(fromEntity) : createDefaultEntity();
        setSerial(serial + 1);
        setSlot({
          serial,
          edit: editing,
          entity: newEntityShell(draft),
          state: createEntityDraftState({ target: "new", entity: draft }),
          save: { pending: false, error: null },
          buffer: createEditorBuffer(),
        });
      } else if (editing.target !== "new" && editEntity) {
        setSerial(serial + 1);
        setSlot({
          serial,
          edit: editing,
          entity: editEntity,
          state: createEntityDraftState({ target: editing.target, entity: editEntity }),
          save: { pending: false, error: null },
          buffer: createEditorBuffer(),
        });
      }
    }
  }
  const slotRef = useRef(slot);
  const hasSlot = slot !== null;
  useEffect(() => {
    if (!hasSlot) return;
    // Read when the page unloads: typed input reaches the buffer without a render here.
    const warn = (event: BeforeUnloadEvent) => {
      if (slotRef.current && worthKeeping(slotRef.current)) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasSlot]);
  const editingRef = useRef(editing);
  useEffect(() => {
    slotRef.current = slot;
  }, [slot]);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  const editorRef = useRef<EntityEditorHandle>(null);
  const updateDraft = useCallback((serial: number, state: EntityDraftState) =>
    setSlot(current => current?.serial === serial ? { ...current, state } : current), []);
  const updateSave = useCallback((serial: number, save: EntitySaveProgress) =>
    setSlot(current => current?.serial === serial ? { ...current, save } : current), []);
  const finishSave = useCallback((serial: number, saved: DnD5eEntityDetails) => {
    const origin = slotRef.current;
    if (!origin || origin.serial !== serial) return;
    setSlot(current => current?.serial === serial ? null : current);
    if (editingRef.current && sameEdit(origin.edit, editingRef.current)) onEditEnd(saved.templateId);
  }, [onEditEnd]);

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

  const newEntityButton = (
    <button type="button" className={browserStyles.primaryButton} onClick={() => onEdit({ target: "new", from: null })}>
      New entity
    </button>
  );
  const endEdit = (selected?: number | null) => {
    setSlot(null);
    onEditEnd(selected);
  };

  const unsavedBar = slot && !slotShown && worthKeeping(slot) && (
    <div className={styles.unsavedBar} role="region" aria-label="Unsaved changes">
      <span>Unsaved changes to {draftName(slot)}</span>
      <button type="button" className={browserStyles.secondaryButton} onClick={() => onEdit(slot.edit)}>Resume</button>
      <button type="button" className={browserStyles.secondaryButton} onClick={() => setSlot(null)}>Discard</button>
    </div>
  );

  let detail: React.ReactNode;
  if (slotShown) {
    const target = slot.edit.target;
    const inventory = target !== "new" && slot.state.mode !== "copy" && hasInventory(slot.entity)
      && <InventorySection entityId={target} scope={scope} canEdit />;
    detail = (
      <EntityEditor
        ref={editorRef}
        key={slot.serial}
        entity={slot.entity}
        state={slot.state}
        onChange={state => updateDraft(slot.serial, state)}
        saveProgress={slot.save}
        onSaveProgress={progress => updateSave(slot.serial, progress)}
        buffer={slot.buffer}
        viewer={scope.viewer}
        onCancel={() => endEdit()}
        onSaved={saved => finishSave(slot.serial, saved)}
      >
        {inventory}
      </EntityEditor>
    );
  } else if (editing && slot) {
    // Another entity's changes are kept aside; edit mode here starts once they are resumed or discarded.
    detail = (
      <>
        <p className={browserStyles.status}>
          Save or discard the unsaved changes to {draftName(slot)} before {editing.target === "new" ? "starting another entity" : "editing this one"}.
        </p>
        {editing.target !== "new" && (
          <EntityDetail summary={selectedSummary} selectedId={selectedId} scope={scope} onEdit={onEdit} />
        )}
      </>
    );
  } else if (showingNew) {
    detail = fromError
      ? <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{fromError.message}</p>
      : editing.from !== null && entities && !known(editing.from)
        ? <p className={browserStyles.status}>That entity is not in the compendium.</p>
        : <p className={browserStyles.status}>Preparing a new entity…</p>;
  } else {
    detail = <EntityDetail summary={selectedSummary} selectedId={selectedId} scope={scope} onEdit={onEdit} />;
  }

  let content: React.ReactNode;
  if (isLoading || !hasBeenActive) {
    content = <p className={browserStyles.status}>Loading entities…</p>;
  } else if (error) {
    content = <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  } else if ((!entities || entities.length === 0) && !editing && !slot) {
    content = (
      <div className={browserStyles.status}>
        <p>No entities yet.</p>
        {newEntityButton}
      </div>
    );
  } else {
    const catalog = entities ?? [];
    content = (
      <BrowserLayout
        // Closing the narrow reader leaves edit mode; a draft with changes stays in the unsaved bar.
        detailState={{
          ...detailState,
          close: () => {
            if (slotShown && editorRef.current?.settle() === false) return;
            if (editing) onEditEnd(showingNew ? null : undefined);
            detailState.close();
          },
        }}
        toolbar={
          <EntityFilters
            filters={filters}
            onChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            options={filterOptions}
            resultCount={visibleEntities.length}
            total={catalog.length}
            actions={newEntityButton}
          />
        }
        list={
          <>
            {unsavedBar}
            {hiddenSelection && (
              <p className={styles.hiddenSelection}>
                {hiddenSelection.name} is hidden by the current filters.
                <button type="button" className={browserStyles.secondaryButton} onClick={() => setFilters(EMPTY_ENTITY_FILTERS)}>
                  Show in list
                </button>
              </p>
            )}
            {catalog.length === 0 ? (
              <p className={browserStyles.status}>No entities yet.</p>
            ) : visibleEntities.length === 0 ? (
              <p className={browserStyles.status}>No entities match.</p>
            ) : (
              <EntityList
                entities={visibleEntities}
                label="Entities"
                selectedId={selectedId}
                onSelect={(id, via) => {
                  if (slotShown && editorRef.current?.settle() === false) return;
                  onSelect(id);
                  detailState.onRowSelected(id, via);
                }}
                onActivate={detailState.open}
              />
            )}
          </>
        }
        detail={detail}
        detailLabel="Entity details"
        dialogTitle={slotShown && slot.edit.target === "new" ? "New entity" : selectedSummary?.name ?? "Entity"}
        // Only while shown: following an inventory link to an item must not leave this dialog over Items.
        hasSelection={isActive && (selectedSummary !== undefined || showingNew)}
      />
    );
  }

  return content;
};

type EntityDetailProps = {
  summary?: DnD5eEntitySummary;
  selectedId: number | null;
  scope: ItemMutationScope;
  onEdit: (edit: EntityEditLocation) => void;
};

const EntityDetail: React.FC<EntityDetailProps> = ({ summary, selectedId, scope, onEdit }) => {
  // Only a template in the index is loaded; an unknown ID shows a message instead of a failed request.
  const { data: entity, error, isLoading } = useDnD5eEntity(summary?.templateId ?? 0);

  if (selectedId === null) return <p className={browserStyles.status}>Select an entity to see its details.</p>;
  if (!summary) return <p className={browserStyles.status}>That entity is not in the compendium.</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  if (isLoading || !entity) return <p className={browserStyles.status}>Loading {summary.name}…</p>;
  const headerAction = (
    <ActionMenu
      label={`Actions for ${entity.name}`}
      items={[
        { label: "Edit", icon: <MdEdit />, onSelect: () => onEdit({ target: entity.templateId, from: null }) },
        { label: "Duplicate", icon: <MdContentCopy />, onSelect: () => onEdit({ target: "new", from: entity.templateId }) },
      ]}
    />
  );
  // Shown only while the template is eligible; stored items return when it is again.
  const inventory = hasInventory(entity) && <InventorySection entityId={entity.templateId} scope={scope} canEdit />;
  return (
    <EntitySheet entity={entity} headerAction={headerAction}>
      {inventory}
    </EntitySheet>
  );
};
