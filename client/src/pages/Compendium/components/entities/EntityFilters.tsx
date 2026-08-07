import React from "react";
import {
  EMPTY_ENTITY_FILTERS,
  ENTITY_SORTS,
  ENTITY_VIEWS,
  hasActiveEntityFilters,
  type EntityFilterOptions,
  type EntityFilterState,
  type EntitySort,
} from "./entityFilters.js";
import { BrowserToolbar } from "../browser/BrowserToolbar.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Entities.module.css";

type EntityFiltersProps = {
  filters: EntityFilterState;
  onChange: (filters: EntityFilterState) => void;
  sort: EntitySort;
  onSortChange: (sort: EntitySort) => void;
  options: EntityFilterOptions;
  resultCount: number;
  total: number;
  /** Extra controls at the end of the result bar. */
  actions?: React.ReactNode;
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const EntityFilters: React.FC<EntityFiltersProps> = ({
  filters,
  onChange,
  sort,
  onSortChange,
  options,
  resultCount,
  total,
  actions,
}) => {
  const update = (patch: Partial<EntityFilterState>) => onChange({ ...filters, ...patch });
  const isSortValue = (value: string): value is EntitySort => ENTITY_SORTS.some(option => option.value === value);

  const activeCount = [
    filters.view !== EMPTY_ENTITY_FILTERS.view,
    filters.creatureType !== "",
    filters.size !== "",
    filters.crMin !== "" || filters.crMax !== "",
  ].filter(Boolean).length;

  return (
    <BrowserToolbar
      label="Filter entities"
      search={{
        value: filters.search,
        onChange: search => update({ search }),
        placeholder: "Search entities",
        label: "Search entities by name",
      }}
      sort={
        <select
          className={browserStyles.select}
          aria-label="Sort entities"
          value={sort}
          onChange={event => {
            if (isSortValue(event.target.value)) onSortChange(event.target.value);
          }}
        >
          {ENTITY_SORTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      }
      activeCount={activeCount}
      resultLabel={resultCount === total ? `${total} entities` : `${resultCount} of ${total} entities`}
      onClear={hasActiveEntityFilters(filters) ? () => onChange(EMPTY_ENTITY_FILTERS) : undefined}
      actions={actions}
    >
      <div className={browserStyles.chips} role="group" aria-label="Entity views">
        {ENTITY_VIEWS.map(view => {
          const active = filters.view === view.value;
          return (
            <button
              key={view.value}
              type="button"
              className={`${browserStyles.chip} ${active ? browserStyles.chipActive : ""}`}
              aria-pressed={active}
              onClick={() => update({ view: view.value })}
            >
              {view.label}
            </button>
          );
        })}
      </div>

      <div className={browserStyles.filterRow}>
        <select
          className={browserStyles.select}
          aria-label="Creature type"
          value={filters.creatureType}
          onChange={event => update({ creatureType: event.target.value })}
        >
          <option value="">Any type</option>
          {options.creatureTypes.map(type => <option key={type} value={type}>{capitalize(type)}</option>)}
        </select>
        <select
          className={browserStyles.select}
          aria-label="Size"
          value={filters.size}
          onChange={event => update({ size: options.sizes.find(size => size === event.target.value) ?? "" })}
        >
          <option value="">Any size</option>
          {options.sizes.map(size => <option key={size} value={size}>{capitalize(size)}</option>)}
        </select>
        <span className={styles.crRange}>
          <select
            className={browserStyles.select}
            aria-label="Minimum CR"
            value={filters.crMin}
            onChange={event => update({ crMin: event.target.value })}
          >
            <option value="">Min CR</option>
            {options.crs.map(cr => <option key={cr} value={cr}>CR {cr}</option>)}
          </select>
          to
          <select
            className={browserStyles.select}
            aria-label="Maximum CR"
            value={filters.crMax}
            onChange={event => update({ crMax: event.target.value })}
          >
            <option value="">Max CR</option>
            {options.crs.map(cr => <option key={cr} value={cr}>CR {cr}</option>)}
          </select>
        </span>
      </div>
    </BrowserToolbar>
  );
};
