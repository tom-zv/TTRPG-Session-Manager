import React, { useId, useMemo, useState } from "react";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { EntityEntrySections } from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCardSections.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_LABELS,
  buildEntityInfoLines,
  buildEntitySections,
  calcMod,
  formatCreatureSummary,
  formatHp,
  formatSignedNumber,
  formatSignedValue,
  formatSpeeds,
  type AbilityKey,
  type EntityCardEntry,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import { isFeaturedNpc } from "shared/domain/encounters/dnd5e/settings.js";
import { SpellLookupStatus } from "../spells/SpellLookupStatus.js";
import styles from "./Entities.module.css";

const ROLE_LABELS: Record<DnD5eEntityDetails["role"], string> = { pc: "Player character", npc: "NPC", creature: "Creature" };
const SPELLCASTING_ONLY: readonly EntityCardEntry["kind"][] = ["spellcasting"];
const WITHOUT_SPELLCASTING: readonly EntityCardEntry["kind"][] = ["trait", "action"];

/**
 * A template's sheet in the Compendium: a reading layout rather than the encounter stat-block card.
 * Vitals fit on one line under the name; ability tables and info lines share one band across the
 * pane; traits and actions get the rest of the height, in as many columns as the pane allows.
 *
 * A PC's sheet leads with what a player looks up (party, HP, AC, abilities, skills, spells); their
 * traits and actions open on request.
 */
export const EntitySheet: React.FC<{
  entity: DnD5eEntityDetails;
  /** Controls in the header's corner, e.g. the GM's Edit button. */
  headerAction?: React.ReactNode;
}> = ({ entity, headerAction }) => {
  const headingId = useId();
  const isPc = entity.role === "pc";
  // Rendered only while open: the closed block would otherwise repeat its headings and spell links.
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const infoLines = buildEntityInfoLines(entity);
  const sections = useMemo(() => buildEntitySections(entity), [entity]);
  const hasSpellcasting = (entity.spellcasting?.length ?? 0) > 0;
  const hasFeatures = sections.some(section => section.entries.some(entry => entry.kind !== "spellcasting"));

  const stats = [
    { label: "AC", value: String(entity.ac) },
    { label: isPc ? "Template HP" : "HP", value: formatHp(entity) },
    { label: "Speed", value: formatSpeeds(entity.speeds) },
    { label: "Initiative", value: formatSignedNumber(calcMod(entity.abilityScores.dex)) },
    isPc
      ? { label: "Party", value: entity.settings?.party?.member ? "Party member" : "Not in the party" }
      : { label: "CR", value: entity.cr || "—" },
  ];

  return (
    <article className={styles.sheet} aria-labelledby={headingId}>
      <header className={styles.sheetHeader}>
        <div className={styles.sheetTitle}>
          <h2 id={headingId}>{entity.name}</h2>
          <p className={styles.sheetSubtitle}>
            {formatCreatureSummary(entity)}
            <span className={styles.sheetRole}> · {isFeaturedNpc(entity) ? "Featured NPC" : ROLE_LABELS[entity.role]}</span>
          </p>
          <dl className={styles.vitals}>
            {stats.map(stat => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        {entity.imageUrl && (
          <img className={styles.sheetToken} src={entity.imageUrl} alt={`${entity.name} token`} loading="lazy" />
        )}
        {headerAction && <div className={styles.sheetActions}>{headerAction}</div>}
      </header>

      {/* Abilities beside the info lines when the pane is wide, so the text sections start high. */}
      <div className={styles.sheetSummary}>
        <div className={styles.abilityTables}>
          <AbilityTable entity={entity} caption="Physical abilities" abilities={PHYSICAL} tone="physical" />
          <AbilityTable entity={entity} caption="Mental abilities" abilities={MENTAL} tone="mental" />
        </div>
        {infoLines.length > 0 && (
          <dl className={styles.sheetInfo}>
            {infoLines.map(line => (
              <div key={line.label}>
                <dt>{line.label}</dt>
                <dd>{line.items.join(", ")}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {hasSpellcasting && <SpellLookupStatus />}
      {(isPc ? hasSpellcasting : sections.length > 0) && (
        <div className={styles.sheetBody}>
          <EntityEntrySections entity={entity} kinds={isPc ? SPELLCASTING_ONLY : undefined} />
        </div>
      )}

      {isPc && hasFeatures && (
        <details className={styles.sheetMore} onToggle={event => setFeaturesOpen(event.currentTarget.open)}>
          <summary>Traits and actions</summary>
          {featuresOpen && (
            <div className={styles.sheetBody}>
              <EntityEntrySections entity={entity} kinds={WITHOUT_SPELLCASTING} />
            </div>
          )}
        </details>
      )}
    </article>
  );
};

const PHYSICAL: readonly AbilityKey[] = ["str", "dex", "con"];
const MENTAL: readonly AbilityKey[] = ["int", "wis", "cha"];

type AbilityTableProps = {
  entity: DnD5eEntityDetails;
  caption: string;
  abilities: readonly AbilityKey[];
  tone: "physical" | "mental";
};

// The 2024 stat block's ability table: each row is the ability and its score, then the modifier
// and saving throw side by side.
const AbilityTable: React.FC<AbilityTableProps> = ({ entity, caption, abilities, tone }) => (
  <table className={`${styles.abilityTable} ${tone === "physical" ? styles.physical : styles.mental}`}>
    <caption className={styles.visuallyHidden}>{caption}</caption>
    <thead>
      <tr>
        <th scope="col"><span className={styles.visuallyHidden}>Ability</span></th>
        <th scope="col"><span className={styles.visuallyHidden}>Score</span></th>
        <th scope="col">Mod</th>
        <th scope="col">Save</th>
      </tr>
    </thead>
    <tbody>
      {abilities.map(ability => {
        const score = entity.abilityScores[ability];
        const modifier = calcMod(score);
        return (
          <tr key={ability}>
            <th scope="row">
              <abbr title={ABILITY_FULL_NAMES[ability]}>{ABILITY_LABELS[ability]}</abbr>
            </th>
            <td className={styles.abilityScore}>{score}</td>
            <td className={styles.abilityValue}>{formatSignedNumber(modifier)}</td>
            <td className={styles.abilityValue}>{formatSignedValue(entity.saves?.[ability] ?? modifier)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>
);
