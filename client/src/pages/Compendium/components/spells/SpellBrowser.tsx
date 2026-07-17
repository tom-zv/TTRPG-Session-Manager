import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { SpellSummary } from "shared/domain/dnd5e/spell.js";
import Dialog from "src/components/Dialog/Dialog.js";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import { useSpell, useSpellCasters, useSpellIndex } from "../../api/query/useSpellQueries.js";
import { useSpellResolver } from "../../hooks/useSpellResolver.js";
import type { SpellTokenRenderer } from "../RichText/RichText.js";
import { SpellCard } from "./SpellCard.js";
import { SpellFilters } from "./SpellFilters.js";
import { SpellList } from "./SpellList.js";
import {
  EMPTY_SPELL_FILTERS,
  collectSpellFilterOptions,
  filterSpells,
  sortSpells,
  type SpellFilterState,
  type SpellSort,
} from "./spellFilters.js";
import styles from "./SpellBrowser.module.css";

type SpellBrowserProps = {
  /** The page stays mounted while hidden; load and read the URL only while it is shown. */
  isActive: boolean;
};

const SPELL_PARAM = "spell";

export const SpellBrowser: React.FC<SpellBrowserProps> = ({ isActive }) => {
  // Load the index the first time the page is shown, then keep it.
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: spells, isLoading, error } = useSpellIndex({ enabled: hasBeenActive });
  const { selectedId, select } = useSelectedSpellParam(isActive);
  const [filters, setFilters] = useState<SpellFilterState>(EMPTY_SPELL_FILTERS);
  const [sort, setSort] = useState<SpellSort>("name");
  const [dialogOpen, setDialogOpen] = useState(false);
  const isNarrow = useMediaQuery("(max-width: 800px)");
  const detailRef = useRef<HTMLDivElement>(null);

  const deferredFilters = useDeferredValue(filters);
  const visibleSpells = useMemo(
    () => sortSpells(filterSpells(spells ?? [], deferredFilters), sort),
    [spells, deferredFilters, sort]
  );
  const filterOptions = useMemo(() => collectSpellFilterOptions(spells ?? []), [spells]);
  const selectedSummary = spells?.find(spell => spell.id === selectedId);

  const openDetail = () => {
    if (isNarrow) setDialogOpen(true);
    else detailRef.current?.focus();
  };

  if (isLoading || !hasBeenActive) return <p className={styles.status}>Loading spells…</p>;
  if (error) return <p className={`${styles.status} ${styles.statusError}`} role="alert">{error.message}</p>;
  if (!spells || spells.length === 0) {
    return (
      <div className={styles.status}>
        <p>No spells have been imported yet.</p>
        <p className={styles.hint}>
          Import them on the server with <code>npm run import:dnd5etools:spells -- --file &lt;spells-xphb.json&gt;</code>.
        </p>
      </div>
    );
  }

  const list = (
    <div className={styles.listPane}>
      {visibleSpells.length === 0 ? (
        <p className={styles.status}>No spells match.</p>
      ) : (
        <SpellList
          spells={visibleSpells}
          selectedId={selectedId}
          onSelect={(id, via) => {
            select(id);
            if (isNarrow && via === "pointer") setDialogOpen(true);
          }}
          onActivate={openDetail}
        />
      )}
    </div>
  );

  const detail = <SpellDetail summary={selectedSummary} selectedId={selectedId} onSelect={select} />;

  return (
    <div className={styles.browser}>
      <SpellFilters
        filters={filters}
        onChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        options={filterOptions}
        resultCount={visibleSpells.length}
        total={spells.length}
      />

      {isNarrow ? (
        <>
          {list}
          <Dialog
            isOpen={dialogOpen && selectedSummary !== undefined}
            onClose={() => setDialogOpen(false)}
            title={selectedSummary?.name ?? "Spell"}
          >
            {detail}
          </Dialog>
        </>
      ) : (
        <Group orientation="horizontal" className={styles.panels}>
          <Panel defaultSize="40%" minSize="25%" className={styles.panel}>
            {list}
          </Panel>
          <Separator className={styles.resizeHandle} />
          <Panel defaultSize="60%" minSize="30%" className={styles.panel}>
            <div ref={detailRef} className={styles.detailPane} tabIndex={-1} aria-label="Spell details">
              {detail}
            </div>
          </Panel>
        </Group>
      )}
    </div>
  );
};

// Selection lives in ?spell=<id>, so a reload or a shared link opens the spell.
// The last selection is kept while another page is shown and written back on return.
function useSelectedSpellParam(isActive: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramValue = Number(searchParams.get(SPELL_PARAM));
  const paramId = Number.isInteger(paramValue) && paramValue > 0 ? paramValue : null;
  const [lastId, setLastId] = useState<number | null>(paramId);

  if (isActive && paramId !== null && paramId !== lastId) setLastId(paramId);

  useEffect(() => {
    if (!isActive || paramId !== null || lastId === null) return;
    setSearchParams(params => {
      params.set(SPELL_PARAM, String(lastId));
      return params;
    }, { replace: true });
  }, [isActive, paramId, lastId, setSearchParams]);

  const select = (id: number) => {
    setLastId(id);
    setSearchParams(params => {
      params.set(SPELL_PARAM, String(id));
      return params;
    }, { replace: true });
  };

  return { selectedId: isActive ? paramId ?? lastId : lastId, select };
}

type SpellDetailProps = {
  summary?: SpellSummary;
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const SpellDetail: React.FC<SpellDetailProps> = ({ summary, selectedId, onSelect }) => {
  const { currentUser } = useAuth();
  const isGm = Boolean(currentUser?.isGm);
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

  if (selectedId === null) return <p className={styles.status}>Select a spell to read it.</p>;
  if (!summary) return <p className={styles.status}>That spell is not in the compendium.</p>;

  return (
    <SpellCard
      summary={summary}
      spell={spell}
      error={error?.message}
      renderSpell={renderSpell}
      headingId={`spell-heading-${summary.id}`}
      footer={isGm ? <SpellCasters spellId={summary.id} /> : undefined}
    />
  );
};

const SpellCasters: React.FC<{ spellId: number }> = ({ spellId }) => {
  const { data: casters, isLoading, error } = useSpellCasters(spellId);

  return (
    <section className={styles.casters} aria-label="Cast by">
      <h4>Cast by</h4>
      {isLoading ? (
        <p className={styles.hint}>Loading…</p>
      ) : error ? (
        <p className={styles.statusError}>{error.message}</p>
      ) : !casters || casters.length === 0 ? (
        <p className={styles.hint}>No creature lists this spell.</p>
      ) : (
        <p>{casters.map(caster => caster.name).join(", ")}</p>
      )}
    </section>
  );
};
