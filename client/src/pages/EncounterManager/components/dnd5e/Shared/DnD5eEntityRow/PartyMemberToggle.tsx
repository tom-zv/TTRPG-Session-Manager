import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DnD5eEntity } from "shared/domain/encounters/dnd5e/entity.js";
import { ENTITY_SETTINGS } from "shared/domain/encounters/dnd5e/settings.js";
import DnD5eEntityApi from "../../../../api/dnd5e/entities/dnd5eEntityApi.js";
import { ENTITY_KEYS } from "../../../../api/dnd5e/entities/query/keys.js";
import { updateEntitySettingsCache } from "../../../../services/dnd5e/entityTemplateCache.js";
import { ToggleSwitch } from "../ToggleSwitch/ToggleSwitch.js";
import styles from "./DnD5eEntityRow.module.css";

/** Template-level switch: party members are added to an encounter together with "Add party". */
export const PartyMemberToggle: React.FC<{ entity: DnD5eEntity }> = ({ entity }) => {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (member: boolean) =>
      DnD5eEntityApi.patchSettings(entity.templateId, { party: { member } }),
    onSuccess: (settings) => {
      updateEntitySettingsCache(queryClient, entity.templateId, settings);
      // The summaries list carries the party flag that "Add party" reads.
      void queryClient.invalidateQueries({ queryKey: ENTITY_KEYS.summaries() });
    },
  });
  const setting = ENTITY_SETTINGS.party.member;

  return (
    <div className={styles.secondaryOption}>
      <ToggleSwitch
        checked={entity.settings?.party?.member ?? false}
        disabled={mutation.isPending}
        onChange={(member) => mutation.mutate(member)}
        label={setting.label}
        help={setting.help}
      />
      {mutation.error && <p role="alert" className={styles.inlineError}>{mutation.error.message}</p>}
    </div>
  );
};
