import React, { useMemo } from "react";
import { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import styles from "./DnD5eEntityCard.module.css";

type DnD5eEntityCardProps = {
  entity?: DnD5eEntityDetails;
};

// Helper to calculate ability modifier from score
const calcMod = (score: number): number => Math.floor((score - 10) / 2);

// Helper to format modifier with + sign
const formatMod = (mod: number): string => (mod >= 0 ? `${mod}` : `${mod}`);

// Helper to capitalize first letter
const capitalize = (str: string | undefined): string => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Ability score component for reuse
type AbilityScoreProps = {
  abbr: string;
  score: number;
  save: number;
};

const AbilityScore: React.FC<AbilityScoreProps> = ({ abbr, score, save }) => {
  const mod = useMemo(() => calcMod(score), [score]);
  const isPositiveMod = mod >= 0;
  const isPositiveSave = save >= 0;

  return (
    <>
      <div className={styles.ability}>
        <span className={styles.abbr}>{abbr}</span>
        <span className={styles.score}>{score}</span>
      </div>
      <div className={`${styles.val}${isPositiveMod ? ' ' + styles.positive : ''}`}>{formatMod(mod)}</div>
      <div className={`${styles.val}${isPositiveSave ? ' ' + styles.positive : ''}`}>{formatMod(save)}</div>
    </>
  );
};

const DnD5eEntityCardComponent: React.FC<DnD5eEntityCardProps> = ({ entity }) => {
  // Memoize expensive calculations
  const speedsText = useMemo(() => {
    if (!entity?.speeds) return "—";
    return Object.entries(entity.speeds)
      .map(([type, value]) => `${type} ${value} ft.`)
      .join(", ");
  }, [entity]);

  const saves = useMemo(() => {
    if (!entity) return null;
    return {
      str: calcMod(entity.abilityScores.str),
      dex: calcMod(entity.abilityScores.dex),
      con: calcMod(entity.abilityScores.con),
      int: calcMod(entity.abilityScores.int),
      wis: calcMod(entity.abilityScores.wis),
      cha: calcMod(entity.abilityScores.cha),
    };
  }, [entity]);

  const dexMod = useMemo(() => {
    if (!entity) return 0;
    return calcMod(entity.abilityScores.dex);
  }, [entity]);

  if (!entity || !saves) {
    return <div className={styles.entityCard}>No entity selected.</div>;
  }

  const { abilityScores } = entity;

  return (
    <div className={styles.entityCard}>
      {/* Header */}
      <h3>{entity.name}</h3>

      {/* Type line */}
      <div className={styles.kv}>
        <span className={styles.v}>
          {entity.size && capitalize(entity.size)} {entity.entityType}
          {entity.alignment && `, ${entity.alignment}`}
        </span>
      </div>

      {/* Stat line */}
      <div className={styles.statline}>
        <div className={styles.statlineRow}>
          <span>
            <strong>AC</strong> {entity.ac}
          </span>
          <span>
            <strong>Init</strong> {formatMod(dexMod)}
          </span>
        </div>
        <div className={styles.statlineRow}>
          <span>
            <strong>HP</strong> {entity.hp}
          </span>
          <span>
            <strong>Speed</strong> {speedsText}
          </span>
        </div>
      </div>

      {/* Ability grid */}
      <div className={styles.abilityGrid}>
        {/* Header row for the 3 groups */}
        <div className={`${styles.gridHead} ${styles.empty}`}></div>
        <div className={styles.gridHead}>MOD</div>
        <div className={styles.gridHead}>SAVE</div>
        <div className={`${styles.gridHead} ${styles.empty}`}></div>
        <div className={styles.gridHead}>MOD</div>
        <div className={styles.gridHead}>SAVE</div>
        <div className={`${styles.gridHead} ${styles.empty}`}></div>
        <div className={styles.gridHead}>MOD</div>
        <div className={styles.gridHead}>SAVE</div>

        {/* Column 1: STR, INT */}
        <AbilityScore abbr="STR" score={abilityScores.str} save={saves.str} />
        <AbilityScore abbr="INT" score={abilityScores.int} save={saves.int} />

        {/* Column 2: DEX, WIS */}
        <AbilityScore abbr="DEX" score={abilityScores.dex} save={saves.dex} />
        <AbilityScore abbr="WIS" score={abilityScores.wis} save={saves.wis} />

        {/* Column 3: CON, CHA */}
        <AbilityScore abbr="CON" score={abilityScores.con} save={saves.con} />
        <AbilityScore abbr="CHA" score={abilityScores.cha} save={saves.cha} />
      </div>

      {/* Resistances/Immunities/Vulnerabilities */}
      {entity.resistances && entity.resistances.length > 0 && (
        <div className={styles.kv}>
          <span className={styles.k}>Resistances: </span>
          <span className={styles.v}>{entity.resistances.join(", ")}</span>
        </div>
      )}
      {entity.immunities && entity.immunities.length > 0 && (
        <div className={styles.kv}>
          <span className={styles.k}>Immunities: </span>
          <span className={styles.v}>{entity.immunities.join(", ")}</span>
        </div>
      )}
      {entity.vulnerabilities && entity.vulnerabilities.length > 0 && (
        <div className={styles.kv}>
          <span className={styles.k}>Vulnerabilities: </span>
          <span className={styles.v}>{entity.vulnerabilities.join(", ")}</span>
        </div>
      )}

      {/* Traits */}
      {entity.traits && entity.traits.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Traits</div>
          <div className={styles.section}>
            {entity.traits.map((trait, idx) => (
              <p key={idx}>
                <strong>{trait.name}.</strong> {trait.description}
              </p>
            ))}
          </div>
        </>
      )}

      {/* Spellcasting */}
      {entity.spellcasting && entity.spellcasting.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Spellcasting</div>
          <div className={styles.section}>
            {entity.spellcasting.map((sc, idx) => (
              <div key={idx}>
                <p>
                  <strong>{sc.displayAs || sc.name}.</strong>
                </p>
                {sc.descriptions.map((desc, dIdx) => (
                  <p key={dIdx}>{desc}</p>
                ))}
                {sc.levels && sc.levels.length > 0 && (
                  <ul>
                    {sc.levels.map((lvl) => (
                      <li key={lvl.level}>
                        <strong>
                          {lvl.level === 0 ? "Cantrips" : `${lvl.level}${getOrdinalSuffix(lvl.level)} level`}
                        </strong>
                        {lvl.slots && ` (${lvl.slots} slots)`}: {lvl.spells?.join(", ")}
                      </li>
                    ))}
                  </ul>
                )}
                {sc.freqSpells && (
                  <ul>
                    {Object.entries(sc.freqSpells).map(([freq, spells]) => (
                      <li key={freq}>
                        <strong>{formatFrequency(freq)}</strong>: {spells.join(", ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      {entity.actions && entity.actions.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Actions</div>
          <div className={styles.section}>
            {entity.actions.map((action, idx) => (
              <p key={idx}>
                <strong>{action.name}</strong> <em>({action.actionType})</em>. {action.description}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Memoize the entire component to prevent re-renders when entity hasn't changed
export const DnD5eEntityCard = React.memo(DnD5eEntityCardComponent);

// Helper to get ordinal suffix (1st, 2nd, 3rd, etc.)
const getOrdinalSuffix = (num: number): string => {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
};

// Helper to format frequency strings
const formatFrequency = (freq: string): string => {
  if (freq === "at will") return "At will";
  if (freq.includes("e")) return `${freq.replace("e", "")}/day each`;
  return `${freq}/day`;
};
