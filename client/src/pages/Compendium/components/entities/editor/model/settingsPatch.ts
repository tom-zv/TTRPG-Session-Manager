import { ENTITY_SETTINGS, type EntitySettings } from "shared/domain/encounters/dnd5e/settings.js";

type Group = keyof typeof ENTITY_SETTINGS;
type Leaves = Record<string, boolean | string | undefined>;

const definitions = (group: Group): Record<string, { defaultValue: unknown }> => ENTITY_SETTINGS[group];

const leaf = (settings: EntitySettings | undefined, group: Group, key: string): unknown =>
  (settings?.[group] as Leaves | undefined)?.[key] ?? definitions(group)[key]?.defaultValue;

/** The settings with one leaf set, for a draft commit. */
export const withSetting = (settings: EntitySettings | undefined, group: Group, key: string, value: boolean): EntitySettings => ({
  ...settings,
  [group]: { ...(settings?.[group] as Leaves | undefined), [key]: value },
});

/**
 * Only the leaves the draft changed from the loaded template, for the settings PATCH; null when none
 * did. Leaves compare by their resolved value, so a toggle turned back sends nothing, and leaves
 * changed elsewhere since the draft was loaded are left alone.
 */
export const changedSettings = (base: EntitySettings | undefined, draft: EntitySettings | undefined): EntitySettings | null => {
  const patch: Record<string, Leaves> = {};
  for (const group of Object.keys(ENTITY_SETTINGS) as Group[]) {
    for (const key of Object.keys(ENTITY_SETTINGS[group])) {
      const value = leaf(draft, group, key);
      if (value !== leaf(base, group, key)) patch[group] = { ...patch[group], [key]: value as boolean };
    }
  }
  return Object.keys(patch).length > 0 ? patch as EntitySettings : null;
};
