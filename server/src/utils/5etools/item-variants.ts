import { isRecord } from "./primitives.js";
import { getPath, splitByTags, walkStrings, type UpstreamRecord } from "./copy.js";

// Magic-variant ("generic variant") families and the specifics generated from base items. Mirrors
// upstream js/render.js Renderer.item: _genericVariants_addInheritedPropertiesToSelf,
// _createSpecificVariants and _createSpecificVariants_createSpecificVariant, for the site's default
// (non-VTT) edition rules. Display-only enrichment (fluff, loot tables, merged property/type text)
// is left out; the raw records stay in storage for later normalization.

const DAMAGE_TYPES: Record<string, string> = {
  A: "acid", B: "bludgeoning", C: "cold", F: "fire", O: "force", L: "lightning", N: "necrotic",
  P: "piercing", I: "poison", Y: "psychic", R: "radiant", S: "slashing", T: "thunder",
};

export const damageTypeName = (code: unknown): string | undefined =>
  typeof code === "string" ? DAMAGE_TYPES[code.toUpperCase()] : undefined;

/** The family's own browsable record: inherited fields copied onto the variant (upstream order). */
export function familyRecord(variant: UpstreamRecord, warnings: string[]): UpstreamRecord {
  const record = structuredClone(variant);
  const inherits = isRecord(variant.inherits) ? variant.inherits : {};
  const blocked = new Set(["entries", "propertyAdd", "namePrefix", "nameSuffix", "propertyRemove"]);
  for (const [prop, value] of Object.entries(inherits)) {
    if (blocked.has(prop)) continue;
    if (value === null || value === undefined) delete record[prop];
    else if (record[prop] !== undefined && record[prop] !== null) {
      record[prop] = Array.isArray(record[prop]) && Array.isArray(value) ? [...record[prop], ...value] : value;
    } else record[prop] = value;
  }
  if (record.entries === undefined && inherits.entries !== undefined) {
    record.entries = applyAllProperties(inherits.entries, inherits, warnings);
  }
  if (Array.isArray(inherits.propertyAdd)) {
    record.property = [...(Array.isArray(record.property) ? record.property : []), ...inherits.propertyAdd];
  }
  return record;
}

/**
 * Whether upstream would generate this family on this base item. The edition table: a classic base
 * only takes classic families; a 2024 ("one") base takes anything but classic; an edition-less base
 * takes every family.
 */
export function isEditionMatch(base: UpstreamRecord, variant: UpstreamRecord): boolean {
  const baseEdition = base.edition ?? null;
  const variantEdition = variant.edition ?? null;
  if (baseEdition === variantEdition) return true;
  if (baseEdition === "classic") return false;
  if (baseEdition === null) return true;
  if (baseEdition === "one") return variantEdition !== "classic";
  throw new Error(`Unhandled edition combination "${String(baseEdition)}"/"${String(variantEdition)}".`);
}

export function isEligibleBase(base: UpstreamRecord): boolean {
  // e.g. "Arrows (20)": packs never take a variant.
  return base.packContents === undefined;
}

export function matchesVariant(base: UpstreamRecord, variant: UpstreamRecord): boolean {
  if (!isEligibleBase(base) || !isEditionMatch(base, variant)) return false;
  const requires = Array.isArray(variant.requires) ? variant.requires : [];
  if (!requires.some(requirement => isRequirementMatch(base, requirement, true))) return false;
  return !isRequirementMatch(base, variant.excludes, false);
}

function isRequirementMatch(candidate: unknown, requirements: unknown, isEvery: boolean): boolean {
  if (!isRecord(candidate) || !isRecord(requirements)) return false;
  for (const [key, requirement] of Object.entries(requirements)) {
    const match = isValueMatch(candidate[key], requirement, isEvery);
    if (isEvery && !match) return false;
    if (!isEvery && match) return true;
  }
  return isEvery;
}

function isValueMatch(candidate: unknown, requirement: unknown, isEvery: boolean): boolean {
  if (Array.isArray(requirement)) {
    return Array.isArray(candidate) ? candidate.some(value => requirement.includes(value)) : requirement.includes(candidate);
  }
  if (isRecord(requirement)) return isRequirementMatch(candidate, requirement, isEvery);
  return Array.isArray(candidate) ? candidate.some(value => value === requirement) : candidate === requirement;
}

/** The generated specific record: a copy of the base with the family's inherits applied. */
export function createSpecific(base: UpstreamRecord, variant: UpstreamRecord, warnings: string[]): UpstreamRecord {
  const inherits = isRecord(variant.inherits) ? variant.inherits : {};
  const specific: UpstreamRecord = structuredClone(base);
  const baseEntries = Array.isArray(base.entries) ? structuredClone(base.entries) : [];

  // Magic items price themselves; book metadata comes from the family.
  for (const prop of ["value", "srd", "srd52", "basicRules", "basicRules2024", "page", "reprintedAs", "referenceSources", "hasFluff", "hasFluffImages"]) {
    delete specific[prop];
  }
  specific.baseItem = `${String(base.name)}|${String(base.source)}`.toLowerCase();

  let variantEntries: unknown[] = [];
  // Removals first, then upstream declaration order.
  const ordered = Object.entries(inherits).sort(([a], [b]) => Number(b.includes("Remove")) - Number(a.includes("Remove")));
  for (const [prop, value] of ordered) {
    switch (prop) {
      case "namePrefix": specific.name = `${String(value)}${String(specific.name)}`; break;
      case "nameSuffix": specific.name = `${String(specific.name)}${String(value)}`; break;
      case "nameRemove": specific.name = String(specific.name).split(String(value)).join(""); break;
      case "entries": {
        const applied = applyAllProperties(value, injectableProps(base, inherits), warnings);
        variantEntries = Array.isArray(applied) ? applied : [applied];
        break;
      }
      case "vulnerable":
      case "resist":
      case "immune":
        break; // merged below
      case "conditionImmune":
        specific.conditionImmune = unique([...(Array.isArray(specific.conditionImmune) ? specific.conditionImmune : []), ...asList(value)]);
        break;
      case "weightExpression":
      case "valueExpression": {
        // Upstream leaves the field unset when the base has no value to compute from.
        const result = evaluateExpression(String(value), base, specific);
        if (result === "invalid") warnings.push(`${prop} "${String(value)}" is not plain arithmetic.`);
        else if (result !== undefined) specific[prop === "weightExpression" ? "weight" : "value"] = result;
        break;
      }
      case "barding":
        specific.bardingType = base.type;
        break;
      case "propertyAdd": {
        const current = Array.isArray(specific.property) ? specific.property : [];
        specific.property = [...current, ...asList(value).filter(added => !current.some(existing => propertyUid(existing) === propertyUid(added)))];
        break;
      }
      case "propertyRemove": {
        if (!Array.isArray(specific.property)) break;
        const removed = asList(value);
        specific.property = specific.property.filter(existing => !removed.includes(propertyUid(existing)));
        if ((specific.property as unknown[]).length === 0) delete specific.property;
        break;
      }
      default:
        specific[prop] = value;
    }
  }
  mergeVulnerableResistImmune(specific, inherits);
  // Family text leads, then the base item's own text (upstream splices it before _fullEntries).
  specific.entries = [...variantEntries, ...baseEntries];
  return specific;
}

function injectableProps(base: UpstreamRecord, inherits: UpstreamRecord): UpstreamRecord {
  return {
    baseName: base.name,
    dmgType: base.dmgType ? damageTypeName(base.dmgType) ?? base.dmgType : null,
    bonusAc: inherits.bonusAc,
    bonusWeapon: inherits.bonusWeapon,
    bonusWeaponAttack: inherits.bonusWeaponAttack,
    bonusWeaponDamage: inherits.bonusWeaponDamage,
    bonusWeaponCritDamage: inherits.bonusWeaponCritDamage,
    bonusSpellAttack: inherits.bonusSpellAttack,
    bonusSpellSaveDc: inherits.bonusSpellSaveDc,
    bonusSavingThrow: inherits.bonusSavingThrow,
  };
}

/** Upstream Renderer.applyAllProperties: `{=prop}` / `{=prop/modifiers}` in every string. */
export function applyAllProperties(entries: unknown, props: UpstreamRecord, warnings: string[]): unknown {
  return walkStrings(structuredClone(entries), text => applyProperties(text, props, warnings));
}

const LEADING_AN = new Set(["a", "e", "i", "o", "u"]);

function applyProperties(text: string, props: UpstreamRecord, warnings: string[]): string {
  if (!text.includes("{=")) return text;
  return splitByTags(text).map(part => {
    if (part.startsWith("{@")) {
      const space = part.indexOf(" ");
      return space === -1 ? part : `${part.slice(0, space)} ${applyProperties(part.slice(space + 1, -1), props, warnings)}}`;
    }
    if (!part.startsWith("{=")) return part;
    const [path, modifiers = ""] = part.slice(2, -1).split("/");
    let value: unknown = props[path];
    if (value === null || value === undefined) {
      // Upstream prints "undefined" or throws; keep the sentence readable instead.
      warnings.push(`Property {=${path}} has no value here.`);
      return path === "baseName" ? "item" : "";
    }
    for (const modifier of modifiers) {
      const textValue = String(value);
      switch (modifier) {
        case "a": value = LEADING_AN.has(textValue[0]?.toLowerCase() ?? "") ? "an" : "a"; break;
        case "l": value = textValue.toLowerCase(); break;
        case "t": value = textValue.replace(/\b\w/g, char => char.toUpperCase()); break;
        case "u": value = textValue.toUpperCase(); break;
        case "r": value = Math.round(Number(value)); break;
        case "f": value = Math.floor(Number(value)); break;
        case "c": value = Math.ceil(Number(value)); break;
        default:
          warnings.push(`Unsupported property modifier "${modifier}" in {=${path}/${modifiers}}.`);
      }
    }
    return String(value);
  }).join("");
}

// "[[baseItem.value]] * 4": a path substitution then plain arithmetic (upstream parseRandomise2 of
// an expression without dice). Undefined when a path is missing or the result is not a number.
function evaluateExpression(expression: string, base: UpstreamRecord, specific: UpstreamRecord): number | "invalid" | undefined {
  let missing = false;
  const substituted = expression.replace(/\[\[([^\]]+)]]/g, (_match, pathText: string) => {
    const [root, ...path] = pathText.split(".");
    const value = root === "baseItem" ? getPath(base, path) : root === "item" ? getPath(specific, path) : getPath(specific, [root, ...path]);
    if (typeof value !== "number") missing = true;
    return String(value);
  });
  if (missing) return undefined;
  return evaluateArithmetic(substituted) ?? "invalid";
}

function evaluateArithmetic(expression: string): number | undefined {
  const tokens = expression.match(/\d+(?:\.\d+)?|[-+*/()]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) return undefined;
  let position = 0;
  const parsePrimary = (): number => {
    const token = tokens[position++];
    if (token === "(") {
      const value = parseSum();
      position += 1;
      return value;
    }
    if (token === "-") return -parsePrimary();
    return Number(token);
  };
  const parseProduct = (): number => {
    let value = parsePrimary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      value = operator === "*" ? value * parsePrimary() : value / parsePrimary();
    }
    return value;
  };
  const parseSum = (): number => {
    let value = parseProduct();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      value = operator === "+" ? value + parseProduct() : value - parseProduct();
    }
    return value;
  };
  const result = parseSum();
  return position === tokens.length && Number.isFinite(result) ? result : undefined;
}

// A damage type should appear in only one of vulnerable/resist/immune: values the family grants
// are removed from the base item's other lists.
function mergeVulnerableResistImmune(specific: UpstreamRecord, inherits: UpstreamRecord): void {
  const props = ["vulnerable", "resist", "immune"] as const;
  const fromBase: Partial<Record<typeof props[number], unknown[]>> = {};
  for (const prop of props) if (Array.isArray(specific[prop])) fromBase[prop] = [...(specific[prop] as unknown[])];

  for (const prop of props) {
    const value = inherits[prop];
    if (value === undefined) continue;
    if (value === null) {
      delete fromBase[prop];
      continue;
    }
    const granted = new Set<string>();
    for (const item of asList(value)) {
      if (typeof item === "string") granted.add(item);
      else if (isRecord(item) && Array.isArray(item[prop])) {
        for (const sub of item[prop] as unknown[]) if (typeof sub === "string") granted.add(sub);
      }
    }
    for (const other of props) {
      if (other === prop || !fromBase[other]) continue;
      const kept = fromBase[other].filter(item => typeof item !== "string" || !granted.has(item));
      if (kept.length > 0) fromBase[other] = kept;
      else delete fromBase[other];
    }
  }
  for (const prop of props) {
    const granted = inherits[prop];
    if (fromBase[prop] || (granted !== undefined && granted !== null)) {
      specific[prop] = unique([...(fromBase[prop] ?? []), ...asList(granted ?? [])]);
    } else delete specific[prop];
  }
}

const asList = (value: unknown): unknown[] => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const propertyUid = (value: unknown): unknown => isRecord(value) ? value.uid : value;

function unique(values: unknown[]): unknown[] {
  const seen: unknown[] = [];
  return values.filter(value => {
    const key = typeof value === "object" ? JSON.stringify(value) : value;
    if (seen.includes(key)) return false;
    seen.push(key);
    return true;
  });
}
