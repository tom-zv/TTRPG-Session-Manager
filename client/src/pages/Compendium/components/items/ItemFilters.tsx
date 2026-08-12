import React from "react";
import { ITEM_LIST_LIMITS, type ItemCategory, type ItemFacets, type ItemKind, type ItemOrigin, type ItemRarity } from "shared/domain/dnd5e/item.js";
import { BrowserToolbar } from "../browser/BrowserToolbar.js";
import { KIND_LABELS, capitalize } from "./itemFormat.js";
import styles from "../browser/Browser.module.css";

export type ItemFilterState = {
  search: string;
  kind: ItemKind | "";
  category: ItemCategory | "";
  rarity: ItemRarity | "";
  source: string;
  origin: ItemOrigin | "";
  attunement: boolean;
  /** Also list generated specifics while browsing; a search lists them anyway. */
  specifics: boolean;
};

export const EMPTY_ITEM_FILTERS: ItemFilterState = {
  search: "",
  kind: "",
  category: "",
  rarity: "",
  source: "",
  origin: "",
  attunement: false,
  specifics: false,
};

type ItemFiltersProps = {
  filters: ItemFilterState;
  onChange: (filters: ItemFilterState) => void;
  /** The server's choices for this viewer and search; a chosen value stays listed. */
  facets?: ItemFacets;
  searchRef: React.Ref<HTMLInputElement>;
  resultLabel: string;
  actions?: React.ReactNode;
};

const ORIGIN_LABELS: Record<ItemOrigin, string> = { imported: "Imported", homebrew: "Homebrew" };

const withCurrent = <Value extends string>(values: readonly Value[] | undefined, current: Value | "") =>
  current && !(values ?? []).includes(current) ? [...(values ?? []), current] : [...(values ?? [])];

export const ItemFilters: React.FC<ItemFiltersProps> = ({ filters, onChange, facets, searchRef, resultLabel, actions }) => {
  const update = (patch: Partial<ItemFilterState>) => onChange({ ...filters, ...patch });
  const activeCount = [
    filters.kind, filters.category, filters.rarity, filters.source, filters.origin, filters.attunement, filters.specifics,
  ].filter(Boolean).length;
  const hasFilters = activeCount > 0 || filters.search !== "";

  return (
    <BrowserToolbar
      label="Filter items"
      search={{
        value: filters.search,
        onChange: search => update({ search: search.slice(0, ITEM_LIST_LIMITS.query) }),
        maxLength: ITEM_LIST_LIMITS.query,
        placeholder: "Search items",
        label: "Search items by name",
      }}
      searchInputRef={searchRef}
      activeCount={activeCount}
      resultLabel={resultLabel}
      onClear={hasFilters ? () => onChange(EMPTY_ITEM_FILTERS) : undefined}
      actions={actions}
    >
      <div className={styles.filterRow}>
        <select className={styles.select} aria-label="Kind" value={filters.kind} onChange={event => update({ kind: event.target.value as ItemKind | "" })}>
          <option value="">Any kind</option>
          {withCurrent(facets?.kinds, filters.kind).map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label="Category"
          value={filters.category}
          onChange={event => update({ category: event.target.value as ItemCategory | "" })}
        >
          <option value="">Any category</option>
          {withCurrent(facets?.categories, filters.category).map(category => (
            <option key={category} value={category}>{capitalize(category)}</option>
          ))}
        </select>
        <select
          className={styles.select}
          aria-label="Rarity"
          value={filters.rarity}
          onChange={event => update({ rarity: event.target.value as ItemRarity | "" })}
        >
          <option value="">Any rarity</option>
          {withCurrent(facets?.rarities, filters.rarity).map(rarity => <option key={rarity} value={rarity}>{capitalize(rarity)}</option>)}
        </select>
        <select className={styles.select} aria-label="Source" value={filters.source} onChange={event => update({ source: event.target.value })}>
          <option value="">Any source</option>
          {withCurrent(facets?.sources, filters.source).map(source => <option key={source} value={source}>{source}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label="Origin"
          value={filters.origin}
          onChange={event => update({ origin: event.target.value as ItemOrigin | "" })}
        >
          <option value="">Imported and homebrew</option>
          {withCurrent(facets?.origins, filters.origin).map(origin => <option key={origin} value={origin}>{ORIGIN_LABELS[origin]}</option>)}
        </select>
        <label className={styles.toggle}>
          <input type="checkbox" checked={filters.attunement} onChange={event => update({ attunement: event.target.checked })} />
          Requires attunement
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={filters.specifics} onChange={event => update({ specifics: event.target.checked })} />
          Show specific variants
        </label>
      </div>
    </BrowserToolbar>
  );
};
