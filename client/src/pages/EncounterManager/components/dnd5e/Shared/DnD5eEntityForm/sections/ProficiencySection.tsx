import React from "react";
import {
  FormField,
  NumberStepper,
  SegmentedTabs,
} from "src/components/FormControls/index.js";
import type {
  DnD5eEntityFormDraft,
  ProficiencyRowsView,
} from "../DnD5eEntityForm.types.js";
import { SAVE_OPTIONS, SKILL_OPTIONS } from "../model/options.js";
import { RecordRows } from "../rows/index.js";
import type { AdvancedSectionsProps } from "./AdvancedSections.types.js";
import styles from "./DnD5eEntityFormSections.module.css";

export const ProficiencySection: React.FC<AdvancedSectionsProps> = ({
  draft,
  fieldErrors,
  activeProficiencyRows,
  passivePerception,
  proficiencyBonus,
  setActiveProficiencyRows,
  updateDraft,
  appendRecordRow,
  updateRecordRow,
  removeRecordRow,
  getRowError,
}) => {
  const panelId = activeProficiencyRows === "saves" ? "saving-throws-panel" : "skills-panel";

  return (
    <>
      <SegmentedTabs<ProficiencyRowsView>
        label="Proficiency rows"
        value={activeProficiencyRows}
        onChange={setActiveProficiencyRows}
        options={[
          { value: "saves", label: "Saving Throws", count: draft.saves.length, panelId: "saving-throws-panel" },
          { value: "skills", label: "Skills", count: draft.skills.length, panelId: "skills-panel" },
        ]}
      />

      <div id={panelId} role="tabpanel">
        {activeProficiencyRows === "saves" ? (
          <RecordRows
            title="Saving Throws"
            fieldPrefix="saves"
            rows={draft.saves}
            options={SAVE_OPTIONS}
            abilityScores={draft.abilityScores}
            proficiencyBonus={proficiencyBonus}
            addLabel="Save"
            onAdd={(row) => appendRecordRow("saves", "save", row)}
            onUpdate={(id, patch) => updateRecordRow("saves", id, patch)}
            onRemove={(id) => removeRecordRow("saves", id)}
            getError={(id) => getRowError("saves", id)}
          />
        ) : (
          <RecordRows
            title="Skills"
            fieldPrefix="skills"
            rows={draft.skills}
            options={SKILL_OPTIONS}
            abilityScores={draft.abilityScores}
            proficiencyBonus={proficiencyBonus}
            addLabel="Skill"
            onAdd={(row) => appendRecordRow("skills", "skill", row)}
            onUpdate={(id, patch) => updateRecordRow("skills", id, patch)}
            onRemove={(id) => removeRecordRow("skills", id)}
            getError={(id) => getRowError("skills", id)}
          />
        )}
      </div>

      <div className={styles.gridTwo}>
        <FormField
          label="Passive Perception"
          name="passivePerception"
          error={fieldErrors.passivePerception}
        >
          <div className={styles.inlineControl}>
            <select
              id="passive-perception-mode"
              name="passive-perception-mode"
              value={draft.passivePerceptionMode}
              onChange={(event) =>
                updateDraft(
                  "passivePerceptionMode",
                  event.target.value as DnD5eEntityFormDraft["passivePerceptionMode"]
                )
              }
              className={styles.shortControl}
            >
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
            <NumberStepper
              id="passive-perception"
              name="passive-perception"
              min={1}
              value={
                draft.passivePerceptionMode === "auto"
                  ? String(passivePerception)
                  : draft.passivePerception
              }
              disabled={draft.passivePerceptionMode === "auto"}
              onChange={(value) => updateDraft("passivePerception", value)}
              aria-invalid={Boolean(fieldErrors.passivePerception) || undefined}
              className={styles.compactControl}
              inputClassName={fieldErrors.passivePerception ? styles.inputError : undefined}
              data-field="passivePerception"
            />
          </div>
        </FormField>
      </div>
    </>
  );
};
