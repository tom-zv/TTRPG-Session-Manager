import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { ENTITY_SETTINGS } from "shared/domain/encounters/dnd5e/settings.js";
import DnD5eEntityApi from "../../../../api/dnd5e/entities/dnd5eEntityApi.js";
import { updateEntitySettingsCache } from "../../../../services/dnd5e/entityTemplateCache.js";
import { ToggleSwitch } from "../ToggleSwitch/ToggleSwitch.js";
import styles from "./DnD5eEntityRow.module.css";

/** Template-level switch: enables death saves for every copy of this NPC. */
export const NpcDeathSavesToggle: React.FC<{ entity: DnD5eEntity }> = ({ entity }) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      DnD5eEntityApi.patchSettings(entity.templateId, { combat: { deathSaves: enabled } }),
    onSuccess: (settings) => updateEntitySettingsCache(queryClient, entity.templateId, settings),
  });
  const setting = ENTITY_SETTINGS.combat.deathSaves;

  return (
    <div className={styles.secondaryOption}>
      <ToggleSwitch
        checked={entity.settings?.combat?.deathSaves ?? false}
        disabled={mutation.isPending}
        onChange={(enabled) => mutation.mutate(enabled)}
        label={`${setting.label} (all copies)`}
        help={setting.help}
      />
      {mutation.error && <p role="alert" className={styles.inlineError}>{mutation.error.message}</p>}
    </div>
  );
};
