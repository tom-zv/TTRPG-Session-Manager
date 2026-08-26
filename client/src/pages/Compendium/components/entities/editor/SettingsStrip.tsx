import React from "react";
import { ENTITY_SETTINGS, type EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";
import { useActiveEdit } from "./EntityEditContext.js";
import { withSetting } from "./model/settingsPatch.js";
import styles from "./EntityEditor.module.css";

type SettingPath = { group: keyof typeof ENTITY_SETTINGS; key: string; label: string; help: string };

const FOR_NPC: readonly SettingPath[] = [
  { group: "compendium", key: "featured", ...ENTITY_SETTINGS.compendium.featured },
  { group: "combat", key: "deathSaves", ...ENTITY_SETTINGS.combat.deathSaves },
];
const FOR_PC: readonly SettingPath[] = [{ group: "party", key: "member", ...ENTITY_SETTINGS.party.member }];

const readFlag = (settings: EntitySettings | undefined, { group, key }: SettingPath): boolean =>
  (settings?.[group] as Record<string, boolean | undefined> | undefined)?.[key] === true;

/**
 * The behaviour settings that apply to the role being edited. A change is a draft edit (Undo
 * reverses it); Save sends only the changed settings, so toggles made elsewhere are kept.
 */
export const SettingsStrip: React.FC = () => {
  const edit = useActiveEdit();
  const { role, settings } = edit.draft;
  const applicable = role === "npc" ? FOR_NPC : role === "pc" ? FOR_PC : [];
  if (applicable.length === 0) return null;

  return (
    <fieldset className={styles.settingsStrip}>
      <legend className={styles.visuallyHidden}>Behaviour settings</legend>
      {applicable.map(setting => (
        <label key={`${setting.group}.${setting.key}`} title={setting.help}>
          <input
            type="checkbox"
            checked={readFlag(settings, setting)}
            onChange={event => {
              // The open editor commits first; an invalid one keeps the toggle from applying.
              if (!edit.open(() => null)) return;
              edit.commit({ settings: withSetting(settings ?? undefined, setting.group, setting.key, event.target.checked) });
            }}
          />{" "}
          {setting.label}
        </label>
      ))}
    </fieldset>
  );
};
