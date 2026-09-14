import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FiMoreHorizontal } from "react-icons/fi";
import type { Spell, SpellSummary } from "shared/domain/dnd5e/spell.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { useDeleteSpell, useSpell, useSpellCasters, useSpellIndex } from "../../api/query/useSpellQueries.js";
import type { EditLocation } from "../../hooks/useCompendiumUrl.js";
import { useSpellResolver } from "../../hooks/useSpellResolver.js";
import { BrowserLayout, useBrowserDetail } from "../browser/BrowserLayout.js";
import type { SpellTokenRenderer } from "../RichText/RichText.js";
import { UnsavedBar, isWorthKeeping, useUnloadWarning } from "../sheetEditor/DraftSlot.js";
import { createEditorBuffer, type EditorBuffer } from "../sheetEditor/SheetEditContext.js";
import { SpellCard } from "./SpellCard.js";
import { SpellFilters } from "./SpellFilters.js";
import { SpellList } from "./SpellList.js";
import {
  SpellEditor,
  createSpellDraftState,
  newSpellShell,
  type SpellDraftState,
  type SpellEditorHandle,
  type SpellSaveProgress,
} from "./editor/SpellEditor.js";
import { blankSpellDraft, spellToDraft } from "./editor/model/spellDraft.js";
import {
  EMPTY_SPELL_FILTERS,
  collectSpellFilterOptions,
  filterSpells,
  sortSpells,
  type SpellFilterState,
  type SpellSort,
} from "./spellFilters.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./SpellBrowser.module.css";

type SpellBrowserProps = {
  /** The page and tab stay mounted while hidden; load the index the first time this is shown. */
  isActive: boolean;
  /** The Compendium owns the selection and its URL (?spell=<id>). */
  selectedId: number | null;
  /** Select a spell, or clear the selection with null. */
  onSelect: (id: number | null) => void;
  /** The spell in edit mode, from the URL (?spell=<id>&edit=1, ?spell=new&from=<id>); GMs only. */
  editing: EditLocation | null;
  /** Open edit mode as a new history entry. */
  onEdit: (edit: EditLocation) => void;
  /** Leave edit mode, selecting the saved spell, keeping the selection (undefined) or clearing it (null). */
  onEditEnd: (selected?: number | null) => void;
};

/**
 * The one draft the browser keeps: it survives moving to another spell (the unsaved bar offers it
 * back), the reader remounting and the tab being hidden. `serial` remounts the editor per draft.
 */
type SpellDraftSlot = {
  serial: number;
  edit: EditLocation;
  /** The account that started it; another sign-in drops it. */
  owner: string;
  /** The stored spell under the draft, or a homebrew shell (id 0) for a new one. */
  record: Spell;
  state: SpellDraftState;
  save: SpellSaveProgress;
  buffer: EditorBuffer;
};

const sameEdit = (left: EditLocation, right: EditLocation) =>
  left.target === right.target && (left.target !== "new" || left.from === right.from);

const slotName = (slot: SpellDraftSlot) => slot.state.draft.name.trim() || (slot.edit.target === "new" ? "a new spell" : slot.record.name);

export const SpellBrowser: React.FC<SpellBrowserProps> = ({ isActive, selectedId, onSelect, editing: requested, onEdit, onEditEnd }) => {
  // Load the index the first time the page is shown, then keep it.
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: spells, isLoading, error } = useSpellIndex({ enabled: hasBeenActive });
  const { currentUser } = useAuth();
  const isGm = Boolean(currentUser?.isGm);
  const viewer = useMemo<ItemViewer | undefined>(
    () => (currentUser ? { userId: currentUser.id, isGm: currentUser.isGm } : undefined),
    [currentUser],
  );
  const owner = viewer ? `${viewer.userId}:${viewer.isGm}` : "";
  const [filters, setFilters] = useState<SpellFilterState>(EMPTY_SPELL_FILTERS);
  const [sort, setSort] = useState<SpellSort>("name");

  // Only a GM edits; a player's edit URL reads as the spell itself.
  const editing = isGm ? requested : null;
  const showingNew = editing?.target === "new";
  // The draft slot, created from the URL's edit location once its spell has loaded (the sheet never
  // edits a skeleton), and kept while it is worth keeping; otherwise dropped when edit mode ends.
  const [slot, setSlot] = useState<SpellDraftSlot | null>(null);
  const [serial, setSerial] = useState(0);
  const { data: editSpell } = useSpell(editing && editing.target !== "new" ? editing.target : null);
  const { data: fromSpell, error: fromError } = useSpell(showingNew ? editing.from : null);
  const slotShown = slot !== null && slot.owner === owner && editing !== null && sameEdit(slot.edit, editing);
  if (slot && slot.owner !== owner) {
    // A draft belongs to the account that started it.
    setSlot(null);
  } else if (!slotShown) {
    if (slot && !isWorthKeeping(slot)) {
      setSlot(null);
    } else if (!slot && editing) {
      const record = editing.target === "new" ? (editing.from === null || fromSpell ? newSpellShell() : null) : editSpell ?? null;
      if (record) {
        setSerial(serial + 1);
        setSlot({
          serial,
          edit: editing,
          owner,
          record,
          state: createSpellDraftState(editing.target === "new"
            ? (fromSpell ? spellToDraft(fromSpell, { duplicate: true }) : blankSpellDraft())
            : spellToDraft(record)),
          save: { pending: false, error: null },
          buffer: createEditorBuffer(),
        });
      }
    }
  }
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const slotRef = useRef(slot);
  useEffect(() => {
    slotRef.current = slot;
  }, [slot]);
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);
  useUnloadWarning(slot !== null, () => slotRef.current !== null && isWorthKeeping(slotRef.current));
  const updateDraft = useCallback((serial: number, state: SpellDraftState) =>
    setSlot(current => current?.serial === serial ? { ...current, state } : current), []);
  const updateSave = useCallback((serial: number, save: SpellSaveProgress) =>
    setSlot(current => current?.serial === serial ? { ...current, save } : current), []);
  const finishSave = useCallback((serial: number, saved: Spell) => {
    const origin = slotRef.current;
    // A save that lands after the draft is gone (unmounted, or another account signed in) changes nothing here.
    if (!mounted.current || !origin || origin.serial !== serial) return;
    setSlot(current => current?.serial === serial ? null : current);
    // After a create the URL names the new spell, in place of ?spell=new.
    if (editingRef.current && sameEdit(origin.edit, editingRef.current)) onEditEnd(saved.id);
  }, [onEditEnd]);

  const shownSlot = slotShown ? slot : null;
  const keptSlot = slot && !slotShown && slot.owner === owner && isWorthKeeping(slot) ? slot : null;
  // On narrow screens the editor is always in the open reader; closing the reader ends edit mode.
  const detailState = useBrowserDetail({
    selectedId: showingNew ? `new:${editing.from ?? ""}` : selectedId,
    keepOpen: shownSlot !== null,
  });
  const editorRef = useRef<SpellEditorHandle>(null);

  const deferredFilters = useDeferredValue(filters);
  const visibleSpells = useMemo(
    () => sortSpells(filterSpells(spells ?? [], deferredFilters), sort),
    [spells, deferredFilters, sort]
  );
  const filterOptions = useMemo(() => collectSpellFilterOptions(spells ?? []), [spells]);
  const selectedSummary = spells?.find(spell => spell.id === selectedId);

  const newSpellButton = isGm && (
    <button type="button" className={browserStyles.primaryButton} onClick={() => onEdit({ target: "new", from: null })}>
      New spell
    </button>
  );

  if (isLoading || !hasBeenActive) return <p className={browserStyles.status}>Loading spells…</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  const emptyCatalog = !spells || spells.length === 0;
  if (emptyCatalog && !editing && !keptSlot) {
    return (
      <div className={browserStyles.status}>
        <p>No spells have been imported yet.</p>
        <p className={browserStyles.hint}>
          Import them on the server with <code>npm run import:5etools:spells</code>.
        </p>
        {newSpellButton}
      </div>
    );
  }

  let detail: React.ReactNode;
  if (shownSlot) {
    detail = (
      <SpellEditor
        ref={editorRef}
        key={shownSlot.serial}
        record={shownSlot.record}
        state={shownSlot.state}
        onChange={state => updateDraft(shownSlot.serial, state)}
        saveProgress={shownSlot.save}
        onSaveProgress={progress => updateSave(shownSlot.serial, progress)}
        buffer={shownSlot.buffer}
        viewer={viewer}
        onCancel={() => {
          setSlot(null);
          onEditEnd();
        }}
        onSaved={saved => finishSave(shownSlot.serial, saved)}
      />
    );
  } else if (editing && keptSlot) {
    // Another spell's changes are kept aside; edit mode here starts once they are resumed or discarded.
    detail = (
      <>
        <p className={browserStyles.status}>
          Save or discard the unsaved changes to {slotName(keptSlot)} before {showingNew ? "starting another spell" : "editing this one"}.
        </p>
        {!showingNew && <SpellDetail summary={selectedSummary} selectedId={selectedId} onSelect={onSelect} />}
      </>
    );
  } else if (showingNew) {
    detail = fromError
      ? <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{fromError.message}</p>
      : <p className={browserStyles.status}>Preparing a new spell…</p>;
  } else {
    detail = (
      <SpellDetail
        summary={selectedSummary}
        selectedId={selectedId}
        onSelect={onSelect}
        actions={isGm ? {
          onEdit: spell => onEdit({ target: spell.id, from: null }),
          onDuplicate: spell => onEdit({ target: "new", from: spell.id }),
          onDeleted: () => {
            detailState.close();
            onSelect(null);
          },
        } : undefined}
      />
    );
  }

  return (
    <BrowserLayout
      // Closing the narrow reader leaves edit mode; a draft with changes stays in the unsaved bar.
      detailState={{
        ...detailState,
        close: () => {
          if (shownSlot && editorRef.current?.settle() === false) return;
          if (editing) onEditEnd(showingNew ? null : undefined);
          detailState.close();
        },
      }}
      toolbar={emptyCatalog ? undefined : (
        <SpellFilters
          filters={filters}
          onChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          options={filterOptions}
          resultCount={visibleSpells.length}
          total={spells.length}
          actions={newSpellButton}
        />
      )}
      list={
        <>
          {keptSlot && (
            <UnsavedBar name={slotName(keptSlot)} onResume={() => onEdit(keptSlot.edit)} onDiscard={() => setSlot(null)} />
          )}
          {emptyCatalog ? (
            <p className={browserStyles.status}>No spells have been imported yet.</p>
          ) : visibleSpells.length === 0 ? (
            <p className={browserStyles.status}>No spells match.</p>
          ) : (
            <SpellList
              spells={visibleSpells}
              selectedId={selectedId}
              onSelect={(id, via) => {
                if (shownSlot && editorRef.current?.settle() === false) return;
                onSelect(id);
                detailState.onRowSelected(id, via);
              }}
              onActivate={detailState.open}
            />
          )}
        </>
      }
      detail={detail}
      detailLabel="Spell details"
      dialogTitle={shownSlot && showingNew ? "New spell" : selectedSummary?.name ?? "Spell"}
      hasSelection={selectedSummary !== undefined || showingNew}
    />
  );
};

type SpellDetailActions = {
  onEdit: (spell: Spell) => void;
  onDuplicate: (spell: Spell) => void;
  onDeleted: () => void;
};

type SpellDetailProps = {
  summary?: SpellSummary;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** GM only: edit, duplicate and delete. */
  actions?: SpellDetailActions;
};

const SpellDetail: React.FC<SpellDetailProps> = ({ summary, selectedId, onSelect, actions }) => {
  const { data: spell, error } = useSpell(summary ? summary.id : null);
  const { resolve } = useSpellResolver();

  // Spells named in the text select that spell in the browser.
  const renderSpell: SpellTokenRenderer = (token, key) => {
    const target = resolve(token);
    const label = token.display ?? token.name;
    if (!target) return <React.Fragment key={key}>{label}</React.Fragment>;
    return (
      <button key={key} type="button" className={styles.spellLink} onClick={() => onSelect(target.id)}>
        {label}
      </button>
    );
  };

  if (selectedId === null) return <p className={browserStyles.status}>Select a spell to read it.</p>;
  if (!summary) return <p className={browserStyles.status}>That spell is not in the compendium.</p>;

  return (
    <SpellCard
      summary={summary}
      spell={spell}
      error={error?.message}
      renderSpell={renderSpell}
      headingId={`spell-heading-${summary.id}`}
      headerAction={actions && spell ? <SpellOptionsMenu key={spell.id} spell={spell} actions={actions} /> : undefined}
      footer={actions ? <SpellCasters spellId={summary.id} /> : undefined}
    />
  );
};

// Edit, duplicate and delete are occasional GM tasks, so they sit behind a small "⋯" button.
const SpellOptionsMenu: React.FC<{ spell: Spell; actions: SpellDetailActions }> = ({ spell, actions }) => {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const deleteSpell = useDeleteSpell();
  const { data: casters } = useSpellCasters(spell.id, { enabled: confirming });
  const wrapperRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setConfirming(false);
    if (returnFocus) toggleRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (open) wrapperRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [open, confirming]);

  const casterCount = casters?.length ?? 0;

  return (
    <div ref={wrapperRef} className={styles.optionsMenu}>
      <button
        ref={toggleRef}
        type="button"
        className={styles.optionsToggle}
        aria-label={`Options for ${spell.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <FiMoreHorizontal aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.optionsPanel}>
          {confirming ? (
            <div className={styles.confirm} role="group" aria-label={`Delete ${spell.name}?`}>
              <p>
                Delete {spell.name}?
                {casterCount > 0 &&
                  ` ${casterCount} creature${casterCount === 1 ? "" : "s"} name it; their spell lists will show it as plain text.`}
              </p>
              {deleteSpell.error && <p className={browserStyles.statusError}>{deleteSpell.error.message}</p>}
              <div className={browserStyles.actionRow}>
                <button ref={cancelRef} type="button" className={browserStyles.secondaryButton} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={browserStyles.dangerButton}
                  disabled={deleteSpell.isPending}
                  // mutateAsync, not mutate's onSuccess: removing the spell from the index unmounts this
                  // component, and TanStack skips per-call callbacks of an unmounted observer.
                  onClick={() => {
                    deleteSpell.mutateAsync(spell.id).then(actions.onDeleted, () => {
                      // The error renders above from deleteSpell.error.
                    });
                  }}
                >
                  {deleteSpell.isPending ? "Deleting…" : "Delete spell"}
                </button>
              </div>
            </div>
          ) : (
            <ul role="menu" aria-label={`Options for ${spell.name}`} className={styles.optionsList}>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { close(false); actions.onEdit(spell); }}>
                  Edit
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" onClick={() => { close(false); actions.onDuplicate(spell); }}>
                  Duplicate as homebrew
                </button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" className={styles.dangerItem} onClick={() => setConfirming(true)}>
                  Delete…
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const SpellCasters: React.FC<{ spellId: number }> = ({ spellId }) => {
  const { data: casters, isLoading, error } = useSpellCasters(spellId);

  return (
    <section className={styles.casters} aria-label="Cast by">
      <h4>Cast by</h4>
      {isLoading ? (
        <p className={browserStyles.hint}>Loading…</p>
      ) : error ? (
        <p className={browserStyles.statusError}>{error.message}</p>
      ) : !casters || casters.length === 0 ? (
        <p className={browserStyles.hint}>No creature lists this spell.</p>
      ) : (
        <p>{casters.map(caster => caster.name).join(", ")}</p>
      )}
    </section>
  );
};
