import React, { useMemo } from "react";
import type {
  DnD5eEntityDetails,
  EntitySpellcasting,
} from "shared/domain/encounters/dnd5e/entity.js";
import {
  ABILITY_FULL_NAMES,
  ABILITY_KEYS,
  ABILITY_LABELS,
  AbilityKey,
  buildEntitySections,
  calcMod,
  EntityCardEntry,
  EntityCardSection,
  formatConditionImmunity,
  formatCreatureSummary,
  formatDamageModifier,
  formatHp,
  formatRecordEntries,
  formatSignedNumber,
  formatSignedValue,
  formatSpeeds,
  formatSpellFrequency,
  formatSpellLevel,
  sortSpellFrequencyEntries,
  titleCase,
} from "./DnD5eEntityCard.utils.js";
import styles from "./DnD5eEntityCard.module.css";

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
        <StatItem label="CR" value={entity.cr ?? "—"} />
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

export const EntityInfoBlock: React.FC<EntitySectionProps> = ({ entity }) => {
  const senses = [
    ...(entity.senses ?? []),
    ...(entity.passivePerception ? [`passive Perception ${entity.passivePerception}`] : []),
  ];

  return (
    <div className={styles.infoBlock}>
      <InfoLine label="Saving Throws" items={formatRecordEntries(entity.saves)} />
      <InfoLine label="Skills" items={formatRecordEntries(entity.skills)} />
      <InfoLine
        label="Vulnerabilities"
        items={entity.vulnerabilities?.map(formatDamageModifier) ?? []}
      />
      <InfoLine
        label="Resistances"
        items={entity.resistances?.map(formatDamageModifier) ?? []}
      />
      <InfoLine
        label="Immunities"
        items={entity.immunities?.map(formatDamageModifier) ?? []}
      />
      <InfoLine
        label="Condition Immunities"
        items={entity.conditionImmunities?.map(formatConditionImmunity) ?? []}
      />
      <InfoLine label="Senses" items={senses} />
      <InfoLine label="Languages" items={entity.languages ?? []} />
    </div>
  );
};

export const EntityEntrySections: React.FC<EntitySectionProps> = ({ entity }) => {
  const sections = useMemo(() => buildEntitySections(entity), [entity]);

  return (
    <>
      {sections.map((section) => (
        <EntrySection key={section.key} section={section} entity={entity} />
      ))}
    </>
  );
};

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
  <>
    <div className={styles.sectionTitle}>{section.title}</div>
    <div className={styles.section}>
      {section.key === "legendary" && <LegendaryIntro entity={entity} />}
      {section.entries.map((entry) => (
        <EntryRenderer key={entry.key} entry={entry} />
      ))}
    </div>
  </>
);

const LegendaryIntro: React.FC<EntitySectionProps> = ({ entity }) => {
  if (entity.legendaryHeader && entity.legendaryHeader.length > 0) {
    return (
      <>
        {entity.legendaryHeader.map((description, index) => (
          <p key={`${index}-${description}`} className={styles.sectionIntro}>
            {description}
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
    <span className={styles.entryText}>{description}</span>
  </p>
);

type SpellcastingEntryProps = {
  spellcasting: EntitySpellcasting;
};

const SpellcastingEntry: React.FC<SpellcastingEntryProps> = ({ spellcasting }) => {
  const meta = formatSpellcastingMeta(spellcasting);
  const descriptions = spellcasting.descriptions ?? [];
  const levels = [...(spellcasting.levels ?? [])].sort((left, right) => left.level - right.level);
  const frequencySpells = spellcasting.freqSpells
    ? Object.entries(spellcasting.freqSpells).sort(sortSpellFrequencyEntries)
    : [];

  return (
    <div className={styles.entryBlock}>
      <p className={styles.entry}>
        <strong className={styles.entryName}>{formatEntryName(spellcasting.name)}</strong>
        {descriptions.length > 0 && (
          <>
            {" "}
            <span className={styles.entryText}>{descriptions[0]}</span>
          </>
        )}
      </p>
      {descriptions.slice(1).map((description, index) => (
        <p key={`${index}-${description}`} className={styles.entryText}>
          {description}
        </p>
      ))}
      {meta && <p className={styles.spellcastingMeta}>{meta}</p>}
      {(levels.length > 0 || frequencySpells.length > 0) && (
        <div className={styles.spellList}>
          {levels.map((level) => (
            <SpellListLine
              key={level.level}
              label={`${formatSpellLevel(level.level)}${formatSpellSlots(level.slots)}`}
              spells={level.spells ?? []}
            />
          ))}
          {frequencySpells.map(([frequency, spells]) => (
            <SpellListLine
              key={frequency}
              label={formatSpellFrequency(frequency)}
              spells={spells}
            />
          ))}
        </div>
      )}
    </div>
  );
};

type SpellListLineProps = {
  label: string;
  spells: string[];
};

const SpellListLine: React.FC<SpellListLineProps> = ({ label, spells }) => {
  if (spells.length === 0) return null;

  return (
    <div className={styles.spellListLine}>
      <span className={styles.spellListLabel}>{label}:</span>{" "}
      <span className={styles.spellListSpells}>{spells.join(", ")}</span>
    </div>
  );
};

const formatEntryName = (name: string): string =>
  /[.!?]$/.test(name.trim()) ? name.trim() : `${name.trim()}.`;

const formatSpellSlots = (slots: number | undefined): string => {
  if (slots === undefined) return "";
  return ` (${slots} slot${slots === 1 ? "" : "s"})`;
};

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
