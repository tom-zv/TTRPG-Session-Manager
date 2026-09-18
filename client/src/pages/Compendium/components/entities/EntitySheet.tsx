import React, { useId, useMemo, useRef, useState } from "react";
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
  type EntityInfoLine,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";
import { isFeaturedNpc } from "shared/domain/encounters/dnd5e/settings.js";
import { SpellLookupStatus } from "../spells/SpellLookupStatus.js";
import { EditableEntrySections } from "./editor/EditableEntrySections.js";
import { EditTarget } from "../sheetEditor/EditTarget.js";
import { useEntityEdit, useLiveRegion } from "./editor/EntityEditContext.js";
import { SettingsStrip } from "./editor/SettingsStrip.js";
import { markerHost } from "../sheetEditor/live/LiveField.js";
import {
  LiveAbilityScore,
  LiveAc,
  LiveCr,
  LiveDefense,
  LiveHp,
  LiveLanguages,
  LiveName,
  LiveRole,
  LiveSaveCell,
  LiveSavesLine,
  LiveSenses,
  LiveSkills,
  LiveSpeeds,
  LiveSubtitle,
} from "./editor/LiveSheetFields.js";
import { DefenseEditor } from "./editor/editors/DefenseEditor.js";
import { HpEditor } from "./editor/editors/HpEditor.js";
import {
  AbilityScoreEditor,
  AcEditor,
  CrEditor,
  NameEditor,
} from "./editor/editors/InlineEditors.js";
import { ProficiencyEditor } from "./editor/editors/ProficiencyEditor.js";
import { SpeedsEditor } from "./editor/editors/SpeedsEditor.js";
import { SubtitleEditor } from "./editor/editors/SubtitleEditor.js";
import { TagListEditor } from "./editor/editors/TagListEditor.js";
import { TokenEditor } from "./editor/editors/TokenEditor.js";
import { getProficiencyBonusForCr } from "./editor/model/calculations.js";
import { SourceBadge } from "./SourceBadge.js";
import { useSheetColumns } from "./sheetColumns.js";
import styles from "./Entities.module.css";

const ROLE_LABELS: Record<DnD5eEntityDetails["role"], string> = { pc: "Player character", npc: "NPC", creature: "Creature" };
const SPELLCASTING_ONLY: readonly EntityCardEntry["kind"][] = ["spellcasting"];
const WITHOUT_SPELLCASTING: readonly EntityCardEntry["kind"][] = ["trait", "action"];

/** The stat block's label/value lines in sheet order, each with its editor and its live fields. */
const INFO_EDITORS: ReadonlyArray<{ label: string; id: string; editor: React.ReactNode; live: React.ReactNode }> = [
  { label: "Saving Throws", id: "saves", editor: <ProficiencyEditor field="saves" />, live: <LiveSavesLine /> },
  { label: "Skills", id: "skills", editor: <ProficiencyEditor field="skills" />, live: <LiveSkills /> },
  { label: "Vulnerabilities", id: "vulnerabilities", editor: <DefenseEditor field="vulnerabilities" />, live: <LiveDefense field="vulnerabilities" /> },
  { label: "Resistances", id: "resistances", editor: <DefenseEditor field="resistances" />, live: <LiveDefense field="resistances" /> },
  { label: "Immunities", id: "immunities", editor: <DefenseEditor field="immunities" />, live: <LiveDefense field="immunities" /> },
  { label: "Condition Immunities", id: "conditionImmunities", editor: <DefenseEditor field="conditionImmunities" />, live: <LiveDefense field="conditionImmunities" /> },
  { label: "Senses", id: "senses", editor: <TagListEditor field="senses" />, live: <LiveSenses /> },
  { label: "Languages", id: "languages", editor: <TagListEditor field="languages" />, live: <LiveLanguages /> },
];

/**
 * A template's sheet in the Compendium: a reading layout rather than the encounter stat-block card.
 * Vitals fit on one line under the name; ability tables and info lines share one band across the
 * pane; traits and actions get the rest of the height, in as many columns as the pane allows.
 *
 * A PC's sheet leads with what a player looks up (HP, AC, abilities, skills, spells), with a Party
 * badge by the role when they are in the party; their traits and actions open on request.
 *
 * Inside an `EntityEditor` the same sheet is the edit surface. In the `live` presentation (a mouse
 * on a wide pane) its values are live fields; in `targets` (touch or narrow) each is an
 * `EditTarget` that opens its editor. Both draw the field specs in `editor/model/fields.ts`.
 */
export const EntitySheet: React.FC<{
  entity: DnD5eEntityDetails;
  /** Controls in the header's corner, e.g. the GM's actions menu. */
  headerAction?: React.ReactNode;
  renderEditHeading?: (title: React.ReactNode) => React.ReactNode;
  saveDestination?: React.ReactNode;
  /** Sections after the stat block that load on their own, e.g. the inventory. */
  children?: React.ReactNode;
}> = ({ entity, headerAction, renderEditHeading, saveDestination, children }) => {
  const headingId = useId();
  const edit = useEntityEdit();
  const editing = edit !== null;
  // Each region follows the presentation, except where input typed in the other one is still open.
  const liveAt = useLiveRegion();
  const isPc = entity.role === "pc";
  // Rendered only while open: the closed block would otherwise repeat its headings and spell links.
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const infoLines = buildEntityInfoLines(entity);
  const sections = useMemo(() => buildEntitySections(entity), [entity]);
  const hasSpellcasting = (entity.spellcasting?.length ?? 0) > 0;
  const hasFeatures = sections.some(section => section.entries.some(entry => entry.kind !== "spellcasting"));
  // Editing shows every section, folded or not, so a PC's traits and actions are within reach.
  const showAllSections = editing || !isPc;

  // Each stat's region is the target that edits it (see `useLiveRegion`).
  const stats = [
    { label: "AC", region: "ac", value: String(entity.ac) },
    { label: isPc ? "Template HP" : "HP", region: "hp", value: formatHp(entity) },
    { label: "Speed", region: "speeds", value: formatSpeeds(entity.speeds) },
    { label: "Initiative", region: "initiative", value: formatSignedNumber(calcMod(entity.abilityScores.dex)) },
    ...(isPc ? [] : [{ label: "CR", region: "cr", value: entity.cr || "—" }]),
  ];
  const inParty = isPc && entity.settings?.party?.member === true;
  const summary = formatCreatureSummary(entity);

  const renderStat = (stat: (typeof stats)[number]): React.ReactNode => {
    const live = liveAt(stat.region);
    switch (stat.region) {
      case "ac":
        return live ? <LiveAc /> : <EditTarget id="ac" kind="inline" label={`Armor Class, ${stat.value}`} editor={<AcEditor />}>{stat.value}</EditTarget>;
      case "hp":
        return live ? <LiveHp /> : (
          <>
            <EditTarget id="hp" label={`${stat.label}, ${stat.value}`} editor={<HpEditor />}>{stat.value}</EditTarget>
            {!entity.hpFormula && <EditTarget id="hpFormula" opens="hp" label="HP formula" placeholder />}
          </>
        );
      case "speeds":
        return live ? <LiveSpeeds /> : <EditTarget id="speeds" label={`Speed, ${stat.value}`} editor={<SpeedsEditor />}>{stat.value}</EditTarget>;
      case "initiative":
        return editing ? <span title="From the Dex modifier">{stat.value}</span> : stat.value;
      default:
        return (
          <>
            {live ? <LiveCr /> : <EditTarget id="cr" kind="inline" label={`Challenge Rating, ${stat.value}`} editor={<CrEditor />}>{stat.value}</EditTarget>}
            {editing && <span title="Proficiency bonus from CR"> PB {formatSignedNumber(getProficiencyBonusForCr(entity.cr))}</span>}
          </>
        );
    }
  };

  const title = (
    <h2 id={headingId}>
      {liveAt("name") ? <LiveName /> : <EditTarget id="name" kind="inline" label={`Name, ${entity.name}`} editor={<NameEditor />}>{entity.name}</EditTarget>}
    </h2>
  );

  return (
    <article className={styles.sheet} aria-labelledby={headingId}>
      {renderEditHeading?.(title)}
      <header className={styles.sheetHeader}>
        <div className={styles.sheetTitle}>
          {!renderEditHeading && title}
          <Subtitle editing={editing}>
            {liveAt("subtitle") ? <LiveSubtitle /> : <EditTarget id="subtitle" label={`Type, ${summary}`} editor={<SubtitleEditor />}>{summary}</EditTarget>}
            <span className={styles.sheetRole}> · {liveAt("subtitle") ? <LiveRole /> : isFeaturedNpc(entity) ? "Featured NPC" : ROLE_LABELS[entity.role]}</span>
            <SourceBadge entity={entity} />
            {inParty && <span className={styles.partyBadge}>Party</span>}
          </Subtitle>
          {/* Where a save goes, on a line of its own under the subtitle (edit mode only). */}
          {saveDestination}
          <dl className={styles.vitals}>
            {stats.map(stat => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{renderStat(stat)}</dd>
              </div>
            ))}
          </dl>
        </div>
        {entity.imageUrl ? (
          <EditTarget id="imageUrl" label="Token image" editor={<TokenEditor />}>
            <img className={styles.sheetToken} src={entity.imageUrl} alt={`${entity.name} token`} loading="lazy" />
          </EditTarget>
        ) : editing && (
          // An empty token's place: a dashed circle the size of a token.
          <div className={styles.tokenSlot}>
            <EditTarget id="imageUrl" label="Token image" placeholder editor={<TokenEditor />} />
          </div>
        )}
        {headerAction && <div className={styles.sheetActions}>{headerAction}</div>}
      </header>

      {editing && <SettingsStrip />}

      {/* Abilities beside the info lines when the pane is wide, so the text sections start high. */}
      <div className={styles.sheetSummary}>
        <div className={styles.abilityTables}>
          <AbilityTable entity={entity} caption="Physical abilities" abilities={PHYSICAL} tone="physical" />
          <AbilityTable entity={entity} caption="Mental abilities" abilities={MENTAL} tone="mental" />
        </div>
        {editing ? (
          <dl className={styles.sheetInfo}>
            {INFO_EDITORS.map(({ label, id, editor, live: liveLine }) => {
              const line = infoLines.find(candidate => candidate.label === label);
              // Every line has a row while editing, so adding the first value keeps its control
              // (and focus) mounted. An absent line's placeholder takes the whole row and its label
              // is only read out, so the label column stays as wide as view mode's.
              if (liveAt(id)) {
                return (
                  <div key={id}>
                    <dt>{label}</dt>
                    <dd>{liveLine}</dd>
                  </div>
                );
              }
              return (
                <div key={id}>
                  <dt className={line ? undefined : styles.visuallyHidden}>{label}</dt>
                  <dd className={line ? undefined : styles.infoPlaceholder}>
                    <EditTarget
                      id={id}
                      label={line ? `${label}, ${line.items.join(", ")}` : label}
                      placeholder={!line}
                      editor={editor}
                    >
                      {line?.items.join(", ")}
                    </EditTarget>
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          infoLines.length > 0 && <InfoLines lines={infoLines} />
        )}
      </div>

      {hasSpellcasting && <SpellLookupStatus />}
      {/* Editing always shows the body, so "+ Add section" is there on an empty sheet. */}
      {editing ? (
        <SheetBody frozen>
          <EditableEntrySections entity={entity} />
        </SheetBody>
      ) : (showAllSections ? sections.length > 0 : hasSpellcasting) && (
        <SheetBody>
          <EntityEntrySections entity={entity} kinds={showAllSections ? undefined : SPELLCASTING_ONLY} />
        </SheetBody>
      )}

      {!editing && isPc && hasFeatures && (
        <details className={styles.sheetMore} onToggle={event => setFeaturesOpen(event.currentTarget.open)}>
          <summary>Traits and actions</summary>
          {featuresOpen && (
            <SheetBody>
              <EntityEntrySections entity={entity} kinds={WITHOUT_SPELLCASTING} />
            </SheetBody>
          )}
        </details>
      )}
      {children}
    </article>
  );
};

/**
 * Traits, actions and spellcasting in columns placed by `useSheetColumns`. While editing
 * (`frozen`) the columns stay put as fields open and text grows.
 */
const SheetBody: React.FC<{ frozen?: boolean; children: React.ReactNode }> = ({ frozen = false, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useSheetColumns(ref, frozen);
  return <div ref={ref} className={styles.sheetBody}>{children}</div>;
};

const InfoLines: React.FC<{ lines: EntityInfoLine[] }> = ({ lines }) => (
  <dl className={styles.sheetInfo}>
    {lines.map(line => (
      <div key={line.label}>
        <dt>{line.label}</dt>
        <dd>{line.items.join(", ")}</dd>
      </div>
    ))}
  </dl>
);

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
const AbilityTable: React.FC<AbilityTableProps> = ({ entity, caption, abilities, tone }) => {
  const editing = useEntityEdit() !== null;
  const liveAt = useLiveRegion();
  return (
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
        const save = formatSignedValue(entity.saves?.[ability] ?? modifier);
        return (
          <tr key={ability}>
            <th scope="row">
              <abbr title={ABILITY_FULL_NAMES[ability]}>{ABILITY_LABELS[ability]}</abbr>
            </th>
            <td className={styles.abilityScore}>
              {liveAt(`abilityScores.${ability}`) ? <LiveAbilityScore ability={ability} /> : <EditTarget
                id={`abilityScores.${ability}`}
                kind="inline"
                label={`${ABILITY_FULL_NAMES[ability]} score, ${score}`}
                editor={<AbilityScoreEditor ability={ability} />}
              >
                {score}
              </EditTarget>}
            </td>
            <td className={styles.abilityValue} title={editing ? `From ${ABILITY_FULL_NAMES[ability]}` : undefined}>{formatSignedNumber(modifier)}</td>
            <td className={`${styles.abilityValue} ${liveAt(`saves.${ability}`) ? markerHost : ""}`}>
              {liveAt(`saves.${ability}`) ? <LiveSaveCell ability={ability} /> : <EditTarget
                id={`saves.${ability}`}
                label={`${ABILITY_FULL_NAMES[ability]} saving throw, ${save}`}
                editor={<ProficiencyEditor field="saves" only={ability} />}
              >
                {save}
              </EditTarget>}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
  );
};

/** A paragraph in view mode. While editing it may hold an expanded editor, which a paragraph cannot contain. */
const Subtitle: React.FC<{ editing: boolean; children: React.ReactNode }> = ({ editing, children }) =>
  editing ? <div className={styles.sheetSubtitle}>{children}</div> : <p className={styles.sheetSubtitle}>{children}</p>;
