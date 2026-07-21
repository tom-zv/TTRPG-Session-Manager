import React, { useMemo, useState } from "react";
import { SPELL_SCHOOLS, validateSpellInput, type Spell, type SpellSchool } from "shared/domain/dnd5e/spell.js";
import {
  ComboboxInput,
  FormActions,
  FormErrorAlert,
  FormField,
  NumberStepper,
  TagInput,
} from "src/components/FormControls/index.js";
import { useCreateSpell, useSpellCasters, useUpdateSpell } from "../../../api/query/useSpellQueries.js";
import { RichText } from "../../RichText/RichText.js";
import { capitalize } from "../spellFilters.js";
import {
  CASTING_TIME_PRESETS,
  CLASS_PRESETS,
  CONDITION_PRESETS,
  DAMAGE_TYPE_PRESETS,
  DURATION_PRESETS,
  RANGE_PRESETS,
  SAVE_PRESETS,
  blankSpellDraft,
  deriveCastingUnit,
  draftToInput,
  isConcentrationDuration,
  spellToDraft,
  type SpellDraft,
} from "./spellFormModel.js";
import styles from "./SpellForm.module.css";

export type SpellFormMode =
  | { kind: "create" }
  | { kind: "edit"; spell: Spell }
  | { kind: "duplicate"; spell: Spell };

type SpellFormProps = {
  mode: SpellFormMode;
  onSaved: (spell: Spell) => void;
  onCancel: () => void;
};

const toOptions = (values: readonly string[]) => values.map(value => ({ value, label: value }));

/** Create, edit or duplicate a spell. Submits a full snapshot, validated with the shared rules. */
export const SpellForm: React.FC<SpellFormProps> = ({ mode, onSaved, onCancel }) => {
  const [draft, setDraft] = useState<SpellDraft>(() =>
    mode.kind === "create" ? blankSpellDraft() : spellToDraft(mode.spell, { duplicate: mode.kind === "duplicate" })
  );
  const [error, setError] = useState<string | null>(null);
  const createSpell = useCreateSpell();
  const updateSpell = useUpdateSpell();
  const editedId = mode.kind === "edit" ? mode.spell.id : null;
  const { data: casters } = useSpellCasters(editedId);
  const isSubmitting = createSpell.isPending || updateSpell.isPending;

  const update = <Key extends keyof SpellDraft>(key: Key, value: SpellDraft[Key]) =>
    setDraft(current => ({ ...current, [key]: value }));

  const renamed = mode.kind === "edit" && draft.name.trim().toLowerCase() !== mode.spell.name.toLowerCase();
  const castingUnit = deriveCastingUnit(draft.castingTime);
  const higherLevelsLabel = draft.level === "0" ? "Cantrip Upgrade" : "Using a Higher-Level Spell Slot";
  const preview = useMemo(() => draft.description.trim(), [draft.description]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = draftToInput(draft);
    const errors = validateSpellInput(input);
    if (errors.length > 0) {
      setError(errors.join("\n"));
      return;
    }
    setError(null);
    try {
      const saved = editedId !== null
        ? await updateSpell.mutateAsync({ id: editedId, input })
        : await createSpell.mutateAsync(input);
      onSaved(saved);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to save the spell.");
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <FormErrorAlert error={error} />

      <div className={styles.layout}>
        <div className={styles.column}>
          <div className={styles.rowWide}>
            <FormField label="Name" name="spell-name">
              <input value={draft.name} onChange={event => update("name", event.target.value)} maxLength={64} required />
            </FormField>
            <FormField label="Source" name="spell-source">
              <input value={draft.source} onChange={event => update("source", event.target.value)} maxLength={16} />
            </FormField>
            <FormField label="Page" name="spell-page">
              <NumberStepper id="spell-page" name="spell-page" value={draft.page} onChange={page => update("page", page)} min={1} />
            </FormField>
          </div>
          {renamed && (casters?.length ?? 0) > 0 && (
            <p className={styles.warning} role="status">
              {casters!.length} creature{casters!.length === 1 ? "" : "s"} name this spell as &ldquo;{mode.spell.name}&rdquo;. They
              link to spells by name, so after the rename they show it as plain text until their spell lists are updated.
            </p>
          )}

          <div className={styles.row}>
            <FormField label="Level" name="spell-level">
              <select value={draft.level} onChange={event => update("level", event.target.value)}>
                <option value="0">Cantrip</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </FormField>
            <FormField label="School" name="spell-school">
              <select value={draft.school} onChange={event => update("school", event.target.value as SpellSchool)}>
                {SPELL_SCHOOLS.map(school => <option key={school} value={school}>{capitalize(school)}</option>)}
              </select>
            </FormField>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={draft.ritual} onChange={event => update("ritual", event.target.checked)} />
              Ritual
            </label>
          </div>

          <div className={styles.row}>
            <FormField label="Casting time" name="spell-casting-time">
              <ComboboxInput
                id="spell-casting-time"
                name="spell-casting-time"
                value={draft.castingTime}
                onChange={value => update("castingTime", value)}
                options={toOptions(CASTING_TIME_PRESETS)}
                clearLabel="Clear casting time"
              />
            </FormField>
            <FormField label="Range" name="spell-range">
              <ComboboxInput
                id="spell-range"
                name="spell-range"
                value={draft.range}
                onChange={value => update("range", value)}
                options={toOptions(RANGE_PRESETS)}
                clearLabel="Clear range"
              />
            </FormField>
          </div>
          <p className={styles.hint}>Filtered as: {castingUnit}.</p>
          {(castingUnit === "reaction" || draft.castingTrigger) && (
            <FormField label="Trigger" name="spell-trigger">
              <input
                value={draft.castingTrigger}
                placeholder="which you take when you are hit by an attack roll"
                onChange={event => update("castingTrigger", event.target.value)}
                maxLength={512}
              />
            </FormField>
          )}

          <FormField label="Duration" name="spell-duration">
            <ComboboxInput
              id="spell-duration"
              name="spell-duration"
              value={draft.duration}
              onChange={value => update("duration", value)}
              options={toOptions(DURATION_PRESETS)}
              clearLabel="Clear duration"
            />
          </FormField>
          <p className={styles.hint}>
            {isConcentrationDuration(draft.duration)
              ? "Concentration: the duration starts with \"Concentration\"."
              : "Start the duration with \"Concentration, up to\" for a concentration spell."}
          </p>

          <fieldset className={styles.fieldset}>
            <legend>Components</legend>
            <div className={styles.row}>
              {(["v", "s", "m"] as const).map(key => (
                <label key={key} className={styles.checkbox}>
                  <input type="checkbox" checked={draft[key]} onChange={event => update(key, event.target.checked)} />
                  {key.toUpperCase()}
                </label>
              ))}
            </div>
            {draft.m && (
              <>
                <FormField label="Material" name="spell-material">
                  <input
                    value={draft.material}
                    placeholder="a diamond worth 50+ GP"
                    onChange={event => update("material", event.target.value)}
                    maxLength={512}
                  />
                </FormField>
                <div className={styles.row}>
                  <FormField label="Cost (GP)" name="spell-material-cost">
                    <NumberStepper
                      id="spell-material-cost"
                      name="spell-material-cost"
                      value={draft.materialCostGp}
                      onChange={cost => update("materialCostGp", cost)}
                      min={0}
                    />
                  </FormField>
                  <label className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={draft.materialConsumed}
                      onChange={event => update("materialConsumed", event.target.checked)}
                    />
                    Consumed
                  </label>
                </div>
              </>
            )}
          </fieldset>

          <div className={styles.tagGrid}>
            <TagInput label="Classes" name="spell-classes" items={draft.classes} onChange={items => update("classes", items)} presets={CLASS_PRESETS} />
            <TagInput label="Damage types" name="spell-damage" items={draft.damageTypes} onChange={items => update("damageTypes", items)} presets={DAMAGE_TYPE_PRESETS} />
            <TagInput label="Saving throws" name="spell-saves" items={draft.saves} onChange={items => update("saves", items)} presets={SAVE_PRESETS} />
            <TagInput label="Conditions" name="spell-conditions" items={draft.conditions} onChange={items => update("conditions", items)} presets={CONDITION_PRESETS} />
            <TagInput label="Aliases" name="spell-aliases" items={draft.aliases} onChange={items => update("aliases", items)} placeholder="Other names" />
            <FormField label="Spell attack" name="spell-attack">
              <select value={draft.attack} onChange={event => update("attack", event.target.value as SpellDraft["attack"])}>
                <option value="">None</option>
                <option value="melee">Melee</option>
                <option value="ranged">Ranged</option>
              </select>
            </FormField>
          </div>
        </div>

        <div className={styles.column}>
          <FormField label="Description" name="spell-description">
            <textarea
              rows={10}
              value={draft.description}
              onChange={event => update("description", event.target.value)}
              required
            />
          </FormField>
          <details className={styles.syntax}>
            <summary>Formatting</summary>
            <ul>
              <li>A blank line starts a new paragraph.</li>
              <li><code>**Lead-in.**</code> at the start of a paragraph is shown in bold.</li>
              <li>Lines starting with <code>- </code> form a list.</li>
              <li>Lines like <code>| Roll | Effect |</code> form a table; the first row is the header.</li>
              <li><code>{"{@spell Fireball|XPHB}"}</code> links another spell.</li>
            </ul>
          </details>
          <FormField label={higherLevelsLabel} name="spell-higher-levels">
            <textarea rows={3} value={draft.higherLevels} onChange={event => update("higherLevels", event.target.value)} />
          </FormField>
          <section className={styles.preview} aria-label="Description preview">
            <h4>Preview</h4>
            {preview ? <RichText text={preview} /> : <p className={styles.hint}>The description appears here.</p>}
          </section>
        </div>
      </div>

      <FormActions
        submitLabel={isSubmitting ? "Saving…" : mode.kind === "edit" ? "Save spell" : "Create spell"}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
      />
    </form>
  );
};
