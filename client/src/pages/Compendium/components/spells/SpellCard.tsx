import React from "react";
import {
  formatSpellComponents,
  formatSpellLevelSchool,
  HOMEBREW_SPELL_SOURCE,
  type Spell,
  type SpellSummary,
} from "shared/domain/dnd5e/spell.js";
import { RichText, type SpellTokenRenderer } from "../RichText/RichText.js";
import { useItemLinks } from "../items/ItemLink.js";
import { capitalize } from "./spellFilters.js";
import styles from "./SpellCard.module.css";

type SpellCardProps = {
  /** Always available from the index, so the header renders at once. */
  summary: SpellSummary;
  /** Full text; a skeleton shows until it arrives. */
  spell?: Spell;
  error?: string;
  variant?: "full" | "compact";
  renderSpell?: SpellTokenRenderer;
  /** Extra content below the card, such as the GM's "Cast by" list. */
  footer?: React.ReactNode;
  /** Small control in the header's corner, e.g. the GM's options menu. */
  headerAction?: React.ReactNode;
  headingId?: string;
};

export const SpellCard: React.FC<SpellCardProps> = ({
  summary,
  spell,
  error,
  variant = "full",
  renderSpell,
  footer,
  headerAction,
  headingId,
}) => {
  const compact = variant === "compact";
  const HeadingTag = compact ? "h3" : "h2";
  // A compact card is a preview: its item mentions stay plain text, so previews never nest.
  const renderItem = useItemLinks([spell?.description, spell?.higherLevels], { enabled: !compact });

  return (
    <article className={`${styles.spellCard} ${compact ? styles.compact : ""}`} aria-labelledby={headingId}>
      <header className={styles.header}>
        {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
        <HeadingTag id={headingId} className={styles.name}>{summary.name}</HeadingTag>
        <p className={styles.subtitle}>
          {formatSpellLevelSchool(summary.level, summary.school)}
          {summary.ritual && " (ritual)"}
        </p>
        {!compact && (
          <p className={styles.source}>
            {summary.source}
            {spell?.page !== undefined && `, page ${spell.page}`}
            {/* Spells made in the app are always "edited"; flag only imported spells that were changed. */}
            {spell?.locallyEdited && summary.source !== HOMEBREW_SPELL_SOURCE && " · edited"}
          </p>
        )}
      </header>

      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : !spell ? (
        <div className={styles.skeleton} aria-busy="true" aria-label="Loading spell">
          <span /><span /><span />
        </div>
      ) : (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>Casting Time</dt>
              <dd>
                {spell.castingTime}
                {spell.castingTrigger && <span className={styles.muted}>, {spell.castingTrigger}</span>}
              </dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>{spell.range}</dd>
            </div>
            <div>
              <dt>Components</dt>
              <dd>{formatSpellComponents(spell.components, spell.material)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{spell.duration}</dd>
            </div>
          </dl>

          <RichText text={spell.description} renderSpell={renderSpell} renderItem={renderItem} className={styles.description} />

          {spell.higherLevels && (
            <section className={styles.higherLevels}>
              <h4>{spell.level === 0 ? "Cantrip Upgrade" : "Using a Higher-Level Spell Slot"}</h4>
              <RichText text={spell.higherLevels} renderSpell={renderSpell} renderItem={renderItem} />
            </section>
          )}

          {!compact && summary.classes.length > 0 && (
            <ul className={styles.chips} aria-label="Classes">
              {summary.classes.map(className => <li key={className}>{className}</li>)}
            </ul>
          )}

          {!compact && (spell.damageTypes.length > 0 || spell.saves.length > 0 || spell.conditions.length > 0) && (
            <p className={styles.tags}>
              {[
                ...spell.damageTypes.map(type => `${capitalize(type)} damage`),
                ...spell.saves.map(save => `${capitalize(save)} save`),
                ...spell.conditions.map(capitalize),
              ].join(" · ")}
            </p>
          )}
        </>
      )}

      {footer}
    </article>
  );
};
