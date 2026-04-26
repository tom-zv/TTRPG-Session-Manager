import React from "react";
import { FormField, NumberStepper } from "src/components/FormControls/index.js";
import type { AdvancedSectionsProps } from "./AdvancedSections.types.js";
import styles from "./DnD5eEntityFormSections.module.css";

export const LegendarySection: React.FC<AdvancedSectionsProps> = ({
  draft,
  fieldErrors,
  updateDraft,
}) => (
  <div className={styles.gridTwo}>
    <FormField
      label="Legendary Actions"
      name="legendaryActionCount"
      error={fieldErrors.legendaryActionCount}
    >
      <NumberStepper
        id="legendary-action-count"
        name="legendary-action-count"
        min={0}
        value={draft.legendaryActionCount}
        onChange={(value) => updateDraft("legendaryActionCount", value)}
      />
    </FormField>
    <FormField label="Legendary Header" name="legendaryHeaderText">
      <textarea
        rows={4}
        value={draft.legendaryHeaderText}
        onChange={(event) => updateDraft("legendaryHeaderText", event.target.value)}
      />
    </FormField>
  </div>
);
