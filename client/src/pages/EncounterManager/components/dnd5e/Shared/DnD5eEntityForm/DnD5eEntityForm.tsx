import React, { useRef } from "react";
import { FiSave } from "react-icons/fi";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { FormActions, FormErrorAlert } from "src/components/FormControls/index.js";
import type {
  EntityFormMode,
  EntityFormSubmitValue,
  ProficiencyRowsView,
} from "./DnD5eEntityForm.types.js";
import { useDnD5eEntityDraft } from "./hooks/useDnD5eEntityDraft.js";
import { parseEntityDraft } from "./model/validation.js";
import { AdvancedSections } from "./sections/AdvancedSections.js";
import { CoreColumn } from "./sections/CoreColumn.js";
import styles from "./DnD5eEntityForm.module.css";

type DnD5eEntityFormProps = {
  mode: EntityFormMode;
  initialEntity?: DnD5eEntityDetails;
  onSubmit: (entity: EntityFormSubmitValue) => Promise<void> | void;
  onCancel?: () => void;
  isSubmitting?: boolean;
  error?: string | null;
};

export const DnD5eEntityForm: React.FC<DnD5eEntityFormProps> = ({
  initialEntity,
  mode,
  ...props
}) => (
  <DnD5eEntityFormContent
    key={getDraftResetKey(mode, initialEntity)}
    mode={mode}
    initialEntity={initialEntity}
    {...props}
  />
);

const DnD5eEntityFormContent: React.FC<DnD5eEntityFormProps> = ({
  mode,
  initialEntity,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = null,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const draftState = useDnD5eEntityDraft(initialEntity);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    draftState.setLocalError(null);

    const validation = parseEntityDraft(draftState.draft);
    if (!validation.ok) {
      draftState.applyValidationState(validation);
      const invalidProficiencyGroup = getProficiencyRowsView(validation.firstInvalidField);
      if (invalidProficiencyGroup) {
        draftState.setActiveProficiencyRows(invalidProficiencyGroup);
      }
      focusInvalidField(validation.firstInvalidField);
      return;
    }

    await onSubmit(validation.entity);
  };

  const focusInvalidField = (fieldName?: string) => {
    if (!fieldName) return;
    window.requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>(
        `[data-field="${fieldName}"]`
      );
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  return (
    <form ref={formRef} className={styles.entityForm} onSubmit={handleSubmit} noValidate>
      <FormErrorAlert error={draftState.localError ?? error} />

      <div className={styles.formLayout}>
        <div className={styles.coreColumn}>
          <CoreColumn
            draft={draftState.draft}
            fieldErrors={draftState.fieldErrors}
            proficiencyBonus={draftState.proficiencyBonus}
            updateDraft={draftState.updateDraft}
            addSpeed={draftState.addSpeed}
            updateSpeed={draftState.updateSpeed}
            removeSpeed={draftState.removeSpeed}
            applyPreset={draftState.applyPreset}
          />
        </div>

        <div className={styles.advancedColumn}>
          <AdvancedSections
            draft={draftState.draft}
            fieldErrors={draftState.fieldErrors}
            openSections={draftState.openSections}
            activeProficiencyRows={draftState.activeProficiencyRows}
            passivePerception={draftState.passivePerception}
            proficiencyBonus={draftState.proficiencyBonus}
            sectionCounts={draftState.sectionCounts}
            updateDraft={draftState.updateDraft}
            toggleSection={draftState.toggleSection}
            setActiveProficiencyRows={draftState.setActiveProficiencyRows}
            getRowError={draftState.getRowError}
            appendRecordRow={draftState.appendRecordRow}
            updateRecordRow={draftState.updateRecordRow}
            removeRecordRow={draftState.removeRecordRow}
            appendDamageModifier={draftState.appendDamageModifier}
            updateDamageModifier={draftState.updateDamageModifier}
            removeDamageModifier={draftState.removeDamageModifier}
            appendConditionImmunity={draftState.appendConditionImmunity}
            updateConditionImmunity={draftState.updateConditionImmunity}
            removeConditionImmunity={draftState.removeConditionImmunity}
            addTrait={draftState.addTrait}
            updateTrait={draftState.updateTrait}
            removeTrait={draftState.removeTrait}
            addAction={draftState.addAction}
            updateAction={draftState.updateAction}
            removeAction={draftState.removeAction}
            addSpellcasting={draftState.addSpellcasting}
            updateSpellcasting={draftState.updateSpellcasting}
            removeSpellcasting={draftState.removeSpellcasting}
          />
        </div>
      </div>

      <FormActions
        className={styles.formActions}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        submitLabel={
          <>
            <FiSave aria-hidden="true" />
            {isSubmitting ? "Saving..." : mode === "create" ? "Create Entity" : "Save Entity"}
          </>
        }
      />
    </form>
  );
};

const getDraftResetKey = (
  mode: EntityFormMode,
  initialEntity: DnD5eEntityDetails | undefined
): string =>
  initialEntity
    ? `${mode}:${initialEntity.templateId}:${JSON.stringify(initialEntity)}`
    : mode;

const getProficiencyRowsView = (fieldName?: string): ProficiencyRowsView | undefined => {
  if (fieldName?.startsWith("saves.")) return "saves";
  if (fieldName?.startsWith("skills.")) return "skills";
  return undefined;
};

export default DnD5eEntityForm;
