import React from "react";
import { SPELL_SCHOOLS, type SpellSchool } from "shared/domain/dnd5e/spell.js";
import {
  CASTING_FILTER_OPTIONS,
  EMPTY_SPELL_FILTERS,
  SPELL_LEVELS,
  capitalize,
  hasActiveSpellFilters,
  type CastingFilter,
  type SpellFilterState,
  type SpellSort,
} from "./spellFilters.js";
import styles from "./SpellBrowser.module.css";

type SpellFiltersProps = {
  filters: SpellFilterState;
  onChange: (filters: SpellFilterState) => void;
  sort: SpellSort;
  onSortChange: (sort: SpellSort) => void;
  options: { classes: string[]; damageTypes: string[]; saves: string[] };
  resultCount: number;
  total: number;
};

export const SpellFilters: React.FC<SpellFiltersProps> = ({
  filters,
  onChange,
  sort,
  onSortChange,
  options,
  resultCount,
  total,
}) => {
  const update = (patch: Partial<SpellFilterState>) => onChange({ ...filters, ...patch });
  const toggleLevel = (level: number) =>
    update({
      levels: filters.levels.includes(level)
        ? filters.levels.filter(existing => existing !== level)
        : [...filters.levels, level],
    });

  return (
    <div className={styles.filters} role="search" aria-label="Filter spells">
      <div className={styles.filterRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search spells"
          aria-label="Search spells by name"
          value={filters.search}
          onChange={event => update({ search: event.target.value })}
        />
        <select
          className={styles.select}
          aria-label="Sort spells"
          value={sort}
          onChange={event => onSortChange(event.target.value as SpellSort)}
        >
          <option value="name">Sort by name</option>
          <option value="level">Sort by level</option>
        </select>
      </div>

      <div className={styles.levelChips} role="group" aria-label="Spell levels">
        {SPELL_LEVELS.map(level => {
          const active = filters.levels.includes(level);
          return (
            <button
              key={level}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              aria-pressed={active}
              onClick={() => toggleLevel(level)}
              title={level === 0 ? "Cantrips" : `Level ${level}`}
            >
              {level === 0 ? "Cantrip" : level}
            </button>
          );
        })}
      </div>

      <div className={styles.filterRow}>
        <select
          className={styles.select}
          aria-label="School"
          value={filters.school}
          onChange={event => update({ school: event.target.value as SpellSchool | "" })}
        >
          <option value="">Any school</option>
          {SPELL_SCHOOLS.map(school => <option key={school} value={school}>{capitalize(school)}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label="Class"
          value={filters.className}
          onChange={event => update({ className: event.target.value })}
        >
          <option value="">Any class</option>
          {options.classes.map(className => <option key={className} value={className}>{className}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label="Casting time"
          value={filters.casting}
          onChange={event => update({ casting: event.target.value as CastingFilter })}
        >
          {CASTING_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label="Damage type"
          value={filters.damageType}
          onChange={event => update({ damageType: event.target.value })}
        >
          <option value="">Any damage</option>
          {options.damageTypes.map(type => <option key={type} value={type}>{capitalize(type)}</option>)}
        </select>
        <select
          className={styles.select}
          aria-label="Saving throw"
          value={filters.save}
          onChange={event => update({ save: event.target.value })}
        >
          <option value="">Any save</option>
          {options.saves.map(save => <option key={save} value={save}>{capitalize(save)}</option>)}
        </select>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={filters.concentration}
            onChange={event => update({ concentration: event.target.checked })}
          />
          Concentration
        </label>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={filters.ritual}
            onChange={event => update({ ritual: event.target.checked })}
          />
          Ritual
        </label>
      </div>

      <div className={styles.resultBar}>
        <span aria-live="polite">
          {resultCount === total ? `${total} spells` : `${resultCount} of ${total} spells`}
        </span>
        {hasActiveSpellFilters(filters) && (
          <button type="button" className={styles.linkButton} onClick={() => onChange(EMPTY_SPELL_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
};
