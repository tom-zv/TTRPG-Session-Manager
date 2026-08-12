import React, { createContext, useContext, useMemo } from "react";
import type {
  DnD5eEntityDetails,
  EntitySpellcasting,
  SpellEntry,
} from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  ABILITY_LABELS,
  AbilityKey,
  buildEntityInfoLines,
  buildEntitySections,
  calcMod,
  EntityCardEntry,
  EntityCardSection,
  formatCreatureSummary,
  formatHp,
  formatSignedNumber,
  formatSignedValue,
  formatSpeeds,
  formatSpellFrequencyGroup,
  formatSpellLevelLabel,
  titleCase,
} from "./DnD5eEntityCard.utils.js";
import styles from "./DnD5eEntityCard.module.css";
// Monster text keeps {@spell} and {@item} tags; they render as links with a preview.
import { RichText, type ItemTokenRenderer } from "src/pages/Compendium/components/RichText/RichText.js";
import { SpellLink, renderSpellLink } from "src/pages/Compendium/components/spells/SpellLink.js";
import { useItemLinks } from "src/pages/Compendium/components/items/ItemLink.js";

// The item links of the sections being shown, resolved once for all their text.
const ItemLinks = createContext<ItemTokenRenderer | undefined>(undefined);

type EntitySectionProps = {
  entity: DnD5eEntityDetails;
};

export const EntityHeader: React.FC<EntitySectionProps> = ({ entity }) => (
  <div className={styles.header}>
    <div className={styles.headerText}>
      <h3>{entity.name}</h3>
      <div className={styles.typeLine}>{formatCreatureSummary(entity)}</div>
    </div>
    {entity.imageUrl && (
      <img
        className={styles.tokenImage}
        src={entity.imageUrl}
        alt={`${entity.name} token`}
        loading="lazy"
      />
    )}
  </div>
);

export const StatSummary: React.FC<EntitySectionProps> = ({ entity }) => {
  const initiative = formatSignedNumber(calcMod(entity.abilityScores.dex));

  return (
    <div className={styles.statline}>
      <div className={styles.statlineRow}>
        <StatItem label="AC" value={String(entity.ac)} />
        <StatItem label="HP" value={formatHp(entity)} />
      </div>
      <div className={styles.statlineRow}>
        <StatItem label="Speed" value={formatSpeeds(entity.speeds)} />
        <StatItem label="Initiative" value={initiative} />
      </div>
      <div className={styles.statlineRow}>
        <StatItem label="CR" value={entity.cr || "—"} />
        <StatItem label="Role" value={titleCase(entity.role)} />
      </div>
    </div>
  );
};

export const AbilityGrid: React.FC<EntitySectionProps> = ({ entity }) => (
  <div className={styles.abilityGrid}>
    <div className={`${styles.gridHead} ${styles.empty}`} />
    <div className={styles.gridHead}>MOD</div>
    <div className={styles.gridHead}>SAVE</div>
    <div className={`${styles.gridHead} ${styles.empty}`} />
    <div className={styles.gridHead}>MOD</div>
    <div className={styles.gridHead}>SAVE</div>
    <div className={`${styles.gridHead} ${styles.empty}`} />
    <div className={styles.gridHead}>MOD</div>
    <div className={styles.gridHead}>SAVE</div>

    {ABILITY_KEYS.map((ability) => (
      <AbilityScore key={ability} ability={ability} entity={entity} />
    ))}
  </div>
);

export const EntityInfoBlock: React.FC<EntitySectionProps> = ({ entity }) => (
  <div className={styles.infoBlock}>
    {buildEntityInfoLines(entity).map(line => (
      <InfoLine key={line.label} label={line.label} items={line.items} />
    ))}
  </div>
);

type EntityEntrySectionsProps = EntitySectionProps & {
  /** Show only entries of these kinds, e.g. ["spellcasting"]; sections left empty are dropped. */
  kinds?: readonly EntityCardEntry["kind"][];
};

export const EntityEntrySections: React.FC<EntityEntrySectionsProps> = ({ entity, kinds }) => {
  const sections = useMemo(() => {
    const all = buildEntitySections(entity);
    if (!kinds) return all;
    return all
      .map(section => ({ ...section, entries: section.entries.filter(entry => kinds.includes(entry.kind)) }))
      .filter(section => section.entries.length > 0);
  }, [entity, kinds]);
  const renderItem = useItemLinks(sectionTexts(entity, sections));

  return (
    <ItemLinks.Provider value={renderItem}>
      {sections.map((section) => (
        <EntrySection key={section.key} section={section} entity={entity} />
      ))}
    </ItemLinks.Provider>
  );
};

// Every text the sections render through MonsterText.
const sectionTexts = (entity: DnD5eEntityDetails, sections: EntityCardSection[]): string[] => [
  ...(sections.some(section => section.key === "legendary") ? entity.legendaryHeader ?? [] : []),
  ...sections.flatMap(section => section.entries.flatMap(entry =>
    entry.kind === "spellcasting" ? entry.spellcasting.descriptions ?? [] : [entry.description])),
];

type StatItemProps = {
  label: string;
  value: string;
};

const StatItem: React.FC<StatItemProps> = ({ label, value }) => (
  <span>
    <strong>{label}</strong> {value}
  </span>
);

type AbilityScoreProps = {
  ability: AbilityKey;
  entity: DnD5eEntityDetails;
};

const AbilityScore: React.FC<AbilityScoreProps> = ({ ability, entity }) => {
  const score = entity.abilityScores[ability];
  const modifier = calcMod(score);
  const save = entity.saves?.[ability] ?? modifier;

  return (
    <>
      <div className={styles.ability}>
        <span className={styles.abbr}>{ABILITY_LABELS[ability]}</span>
        <span className={styles.score}>{score}</span>
      </div>
      <div className={styles.val}>{formatSignedNumber(modifier)}</div>
      <div className={styles.val}>{formatSignedValue(save)}</div>
    </>
  );
};

type InfoLineProps = {
  label: string;
  items: string[];
};

const InfoLine: React.FC<InfoLineProps> = ({ label, items }) => {
  if (items.length === 0) return null;

  return (
    <div className={styles.kv}>
      <span className={styles.k}>{label}: </span>
      <span className={styles.v}>{items.join(", ")}</span>
    </div>
  );
};

type EntrySectionProps = {
  entity: DnD5eEntityDetails;
  section: EntityCardSection;
};

const EntrySection: React.FC<EntrySectionProps> = ({ entity, section }) => (
  <section className={styles.entrySection}>
    <h4 className={styles.sectionTitle}>{section.title}</h4>
    <div className={styles.section}>
      {section.key === "legendary" && <LegendaryIntro entity={entity} />}
      {section.entries.map((entry) => (
        <EntryRenderer key={entry.key} entry={entry} />
      ))}
    </div>
  </section>
);

const LegendaryIntro: React.FC<EntitySectionProps> = ({ entity }) => {
  if (entity.legendaryHeader && entity.legendaryHeader.length > 0) {
    return (
      <>
        {entity.legendaryHeader.map((description, index) => (
          <p key={`${index}-${description}`} className={styles.sectionIntro}>
            <MonsterText text={description} />
          </p>
        ))}
      </>
    );
  }

  if (!entity.legendaryActionCount) return null;

  return (
    <p className={styles.sectionIntro}>
      <strong>Legendary Action Uses:</strong> {entity.legendaryActionCount}
    </p>
  );
};

type EntryRendererProps = {
  entry: EntityCardEntry;
};

const EntryRenderer: React.FC<EntryRendererProps> = ({ entry }) => {
  if (entry.kind === "spellcasting") {
    return <SpellcastingEntry spellcasting={entry.spellcasting} />;
  }

  return <TextEntry name={entry.name} description={entry.description} />;
};

type TextEntryProps = {
  name: string;
  description: string;
};

const TextEntry: React.FC<TextEntryProps> = ({ name, description }) => (
  <p className={styles.entry}>
    <strong className={styles.entryName}>{formatEntryName(name)}</strong>{" "}
    <MonsterText text={description} className={styles.entryText} />
  </p>
);

type SpellcastingEntryProps = {
  spellcasting: EntitySpellcasting;
};

const SpellcastingEntry: React.FC<SpellcastingEntryProps> = ({ spellcasting }) => {
  const meta = formatSpellcastingMeta(spellcasting);
  const descriptions = spellcasting.descriptions ?? [];
  // A hidden list is already named in the descriptions ("The mage casts Misty Step...").
  const levels = spellcasting.hideSpellList
    ? []
    : [...(spellcasting.levels ?? [])].sort((left, right) => left.level - right.level);
  const frequencyGroups = spellcasting.hideSpellList ? [] : spellcasting.frequencyGroups ?? [];

  return (
    <div className={styles.entryBlock}>
      <p className={styles.entry}>
        <strong className={styles.entryName}>{formatEntryName(spellcasting.name)}</strong>
        {descriptions.length > 0 && (
          <>
            {" "}
            <MonsterText text={descriptions[0]} className={styles.entryText} />
          </>
        )}
      </p>
      {descriptions.slice(1).map((description, index) => (
        <p key={`${index}-${description}`} className={styles.entryText}>
          <MonsterText text={description} />
        </p>
      ))}
      {meta && <p className={styles.spellcastingMeta}>{meta}</p>}
      {(levels.length > 0 || frequencyGroups.length > 0) && (
        <div className={styles.spellList}>
          {levels.map((level) => (
            <SpellListLine
              key={level.level}
              label={formatSpellLevelLabel(level)}
              spells={level.spells}
            />
          ))}
          {frequencyGroups.map((group, index) => (
            <SpellListLine
              key={`${index}-${group.frequency}-${group.count ?? ""}`}
              label={formatSpellFrequencyGroup(group)}
              spells={group.spells}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type SpellListLineProps = {
  label: string;
  spells: SpellEntry[];
};

const SpellListLine: React.FC<SpellListLineProps> = ({ label, spells }) => {
  if (spells.length === 0) return null;

  return (
    <div className={styles.spellListLine}>
      <span className={styles.spellListLabel}>{label}:</span>{" "}
      {spells.map((spell, index) => (
        <React.Fragment key={`${index}-${spell.name}`}>
          {index > 0 && ", "}
          <span className={styles.spellListSpells}>
            <SpellLink name={spell.name} source={spell.source} note={spell.note} />
          </span>
          {spell.note && <span className={styles.spellNote}> ({spell.note})</span>}
        </React.Fragment>
      ))}
    </div>
  );
};

const MonsterText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const renderItem = useContext(ItemLinks);
  return <RichText inline text={text} renderSpell={renderSpellLink} renderItem={renderItem} className={className} />;
};

const formatEntryName = (name: string): string =>
  /[.!?]$/.test(name.trim()) ? name.trim() : `${name.trim()}.`;

const formatSpellcastingMeta = (spellcasting: EntitySpellcasting): string => {
  const meta = [
    spellcasting.ability
      ? `Spellcasting Ability ${ABILITY_FULL_NAMES[spellcasting.ability as AbilityKey] ?? titleCase(spellcasting.ability)}`
      : undefined,
    spellcasting.saveDc != undefined ? `Save DC ${spellcasting.saveDc}` : undefined,
    spellcasting.spellAttackBonus != undefined
      ? `Spell Attack ${formatSignedNumber(spellcasting.spellAttackBonus)}`
      : undefined,
  ].filter(Boolean);

  return meta.join("; ");
};
