import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { FiMoreHorizontal } from "react-icons/fi";
import type { Spell, SpellSummary } from "shared/domain/dnd5e/spell.js";
import Dialog from "src/components/Dialog/Dialog.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { useDeleteSpell, useSpell, useSpellCasters, useSpellIndex } from "../../api/query/useSpellQueries.js";
import { useSpellResolver } from "../../hooks/useSpellResolver.js";
import { BrowserLayout, useBrowserDetail } from "../browser/BrowserLayout.js";
import type { SpellTokenRenderer } from "../RichText/RichText.js";
import { SpellCard } from "./SpellCard.js";
import { SpellFilters } from "./SpellFilters.js";
import { SpellList } from "./SpellList.js";
import { SpellForm, type SpellFormMode } from "./SpellForm/SpellForm.js";
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
};

export const SpellBrowser: React.FC<SpellBrowserProps> = ({ isActive, selectedId, onSelect }) => {
  // Load the index the first time the page is shown, then keep it.
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: spells, isLoading, error } = useSpellIndex({ enabled: hasBeenActive });
  const { currentUser } = useAuth();
  const isGm = Boolean(currentUser?.isGm);
  const [formMode, setFormMode] = useState<SpellFormMode | null>(null);
  const [filters, setFilters] = useState<SpellFilterState>(EMPTY_SPELL_FILTERS);
  const [sort, setSort] = useState<SpellSort>("name");
  const detailState = useBrowserDetail();

  const deferredFilters = useDeferredValue(filters);
  const visibleSpells = useMemo(
    () => sortSpells(filterSpells(spells ?? [], deferredFilters), sort),
    [spells, deferredFilters, sort]
  );
  const filterOptions = useMemo(() => collectSpellFilterOptions(spells ?? []), [spells]);
  const selectedSummary = spells?.find(spell => spell.id === selectedId);

  const newSpellButton = isGm && (
    <button type="button" className={browserStyles.primaryButton} onClick={() => setFormMode({ kind: "create" })}>
      New spell
    </button>
  );

  const formDialog = (
    <Dialog
      isOpen={formMode !== null}
      onClose={() => setFormMode(null)}
      title={
        formMode?.kind === "edit" ? `Edit ${formMode.spell.name}`
          : formMode?.kind === "duplicate" ? `Duplicate ${formMode.spell.name}`
            : "New spell"
      }
      className="entity-form-dialog"
    >
      {formMode && (
        <SpellForm
          // Remount for each spell so the draft starts from it.
          key={formMode.kind === "create" ? "create" : `${formMode.kind}-${formMode.spell.id}`}
          mode={formMode}
          onCancel={() => setFormMode(null)}
          onSaved={saved => {
            setFormMode(null);
            onSelect(saved.id);
          }}
        />
      )}
    </Dialog>
  );

  const gmActions: SpellDetailActions | undefined = isGm
    ? {
        onEdit: spell => setFormMode({ kind: "edit", spell }),
        onDuplicate: spell => setFormMode({ kind: "duplicate", spell }),
        onDeleted: () => {
          detailState.close();
          onSelect(null);
        },
      }
    : undefined;

  if (isLoading || !hasBeenActive) return <p className={browserStyles.status}>Loading spells…</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  if (!spells || spells.length === 0) {
    return (
      <div className={browserStyles.status}>
        <p>No spells have been imported yet.</p>
        <p className={browserStyles.hint}>
          Import them on the server with <code>npm run import:5etools:spells</code>.
        </p>
        {newSpellButton}
        {formDialog}
      </div>
    );
  }

  return (
    <>
      <BrowserLayout
        detailState={detailState}
        toolbar={
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
        }
        list={
          visibleSpells.length === 0 ? (
            <p className={browserStyles.status}>No spells match.</p>
          ) : (
            <SpellList
              spells={visibleSpells}
              selectedId={selectedId}
              onSelect={(id, via) => {
                onSelect(id);
                detailState.onRowSelected(id, via);
              }}
              onActivate={detailState.open}
            />
          )
        }
        detail={<SpellDetail summary={selectedSummary} selectedId={selectedId} onSelect={onSelect} actions={gmActions} />}
        detailLabel="Spell details"
        dialogTitle={selectedSummary?.name ?? "Spell"}
        hasSelection={selectedSummary !== undefined}
      />
      {formDialog}
    </>
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
