/**
 * System-agnostic settings machinery. A game system declares its settings as a two-level schema
 * (group → setting); types, validation, defaults and merging are all derived from that schema.
 */

export type SettingDefinition = { label: string; help: string } & (
  | { type: "enum"; values: readonly string[]; defaultValue: string }
  | { type: "boolean"; defaultValue: boolean }
);

export type SettingsSchema = Record<string, Record<string, SettingDefinition>>;

type SettingValue<D> =
  D extends { type: "enum"; values: readonly (infer V)[] } ? V :
  D extends { type: "boolean" } ? boolean :
  never;

/** Every setting present, with defaults filled in. */
export type ResolvedSettings<S extends SettingsSchema> = {
  [G in keyof S]: { [K in keyof S[G]]: SettingValue<S[G][K]> };
};

/** Any subset of settings, as sent in a write or stored sparsely. */
export type SettingsPatch<S extends SettingsSchema> = {
  [G in keyof S]?: { [K in keyof S[G]]?: SettingValue<S[G][K]> };
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidValue(definition: SettingDefinition, value: unknown): boolean {
  return definition.type === "boolean"
    ? typeof value === "boolean"
    : typeof value === "string" && definition.values.includes(value);
}

/** Throws on unknown groups or settings and on values the schema does not allow. */
export function validateSettingsPatch<S extends SettingsSchema>(schema: S, value: unknown): SettingsPatch<S> {
  if (!isPlainObject(value)) throw new Error("Settings must be an object");
  for (const [group, settings] of Object.entries(value)) {
    const groupSchema = schema[group];
    if (!groupSchema) throw new Error(`Unsupported settings group "${group}"`);
    if (!isPlainObject(settings)) throw new Error(`Settings group "${group}" must be an object`);
    for (const [key, setting] of Object.entries(settings)) {
      const definition = groupSchema[key];
      if (!definition) throw new Error(`Unsupported setting "${group}.${key}"`);
      if (!isValidValue(definition, setting)) {
        const expected = definition.type === "boolean" ? "a boolean" : `one of ${definition.values.join(", ")}`;
        throw new Error(`${group}.${key} must be ${expected}`);
      }
    }
  }
  return value as SettingsPatch<S>;
}

/** Reads stored settings leniently: missing or invalid values fall back to their defaults. */
export function resolveSettings<S extends SettingsSchema>(schema: S, value: unknown): ResolvedSettings<S> {
  const stored = isPlainObject(value) ? value : {};
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const [group, groupSchema] of Object.entries(schema)) {
    const storedGroup = isPlainObject(stored[group]) ? stored[group] : {};
    resolved[group] = {};
    for (const [key, definition] of Object.entries(groupSchema)) {
      resolved[group][key] = isValidValue(definition, storedGroup[key]) ? storedGroup[key] : definition.defaultValue;
    }
  }
  return resolved as ResolvedSettings<S>;
}

/** Merges per setting: provided values win, siblings and unknown stored keys are kept. */
export function mergeSettings<T extends object>(current: T, patch: { [G in keyof T]?: Partial<T[G]> }): T {
  const merged = { ...current } as Record<string, unknown>;
  for (const [group, settings] of Object.entries(patch)) {
    const existing = merged[group];
    merged[group] = { ...(isPlainObject(existing) ? existing : {}), ...(isPlainObject(settings) ? settings : {}) };
  }
  return merged as T;
}
