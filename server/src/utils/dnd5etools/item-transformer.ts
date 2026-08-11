import {
  ITEM_LIMITS,
  ITEM_RARITIES,
  OPTIONAL_ITEM_ATTUNEMENT,
  itemImportKey,
  itemUid,
  validateItemInput,
  type ItemCategory,
  type ItemDetails,
  type ItemImportIdentity,
  type ItemKind,
  type ItemRarity,
  type ItemRelation,
  type StoredItemDetails,
} from "shared/domain/dnd5e/item.js";
import type { SpellRef } from "shared/domain/dnd5e/spell.js";
import { asArray, asNumber, asString, isRecord } from "./primitives.js";
import { DESCRIPTION_TEXT_OPTIONS, renderDnd5eToolsText } from "./text-renderer.js";
import { renderSpellEntries } from "./spell-transformer.js";
import { resolveCopies, walkStrings, getPath, type UpstreamRecord } from "./item-copy.js";
import { createSpecific, damageTypeName, familyRecord, matchesVariant } from "./item-variants.js";

// 5etools items.json + items-base.json + magicvariants.json -> catalog rows for dnd5e.items.
// Pure: no database access, so a dry run and a real import build the same plan.

export type UpstreamItemKind = "named" | "base" | "group" | "family" | "specific";

export interface Dnd5eToolsItemSources {
  items: unknown;     // data/items.json: { item, itemGroup }
  base: unknown;      // data/items-base.json: { baseitem, itemProperty, itemType, itemEntry, itemMastery }
  variants: unknown;  // data/magicvariants.json: { magicvariant }
}

export interface ItemImportRelation {
  relation: ItemRelation;
  position: number;           // upstream array index
  memberRef: string;          // as written: "longsword|phb"
  memberKey?: string;         // import key of the resolved catalog record
  quantity?: number;
}

/** One catalog row, in the shape the import service writes. */
export interface ItemImportRecord {
  importKey: string;
  upstreamKind: UpstreamItemKind;
  kind: ItemKind;
  name: string;
  source: string;
  page?: number;
  category?: ItemCategory;
  rarity: ItemRarity;
  requiresAttunement: boolean;
  attunementNote?: string;
  valueCp?: number;
  weightLb?: number;
  aliases: string[];
  details: StoredItemDetails;
  familyKey?: string;         // specifics: import key of the family
  baseKey?: string;           // specifics and named items: import key of the base item
  relations: ItemImportRelation[];
  warnings: string[];
}

export interface ItemImportIssue {
  label: string;              // "Longsword|PHB"
  message: string;
}

export interface ItemImportPlan {
  /** Writable records in dependency order: base, named, family, specific, group, then packs. */
  records: ItemImportRecord[];
  /** Records left out of the plan. */
  failures: ItemImportIssue[];
  /** References kept as text without a link. */
  unresolved: ItemImportIssue[];
  cyclic: ItemImportIssue[];
  /** Upstream operations, codes and entry shapes the normalizer does not support. Raw data is kept. */
  unsupported: ItemImportIssue[];
  counts: {
    input: Record<Exclude<UpstreamItemKind, "specific">, number>;
    byKind: Record<UpstreamItemKind, number>;
    byRole: Record<ItemKind, number>;
  };
}

// Descriptions keep spell and item tags, like spell and monster text (DESCRIPTION_TEXT_OPTIONS).
// Rules fields (dice, charges, recharge) keep only spell tags, as before item links.
const ITEM_TEXT_OPTIONS = { keepTags: ["spell"] } as const;
const DEFAULT_REF_SOURCE = "DMG";

const TYPE_CATEGORIES: Record<string, ItemCategory> = {
  M: "melee weapon", R: "ranged weapon", A: "ammunition", AF: "ammunition",
  LA: "light armor", MA: "medium armor", HA: "heavy armor", S: "shield",
  G: "gear", SCF: "gear", FD: "gear", TAH: "gear", EXP: "gear",
  T: "tool", AT: "tool", INS: "tool", GS: "tool",
  MNT: "mount", VEH: "vehicle", SHP: "vehicle", SPC: "vehicle", AIR: "vehicle",
  P: "potion", SC: "scroll", RG: "ring", RD: "rod", WD: "wand",
  $A: "treasure", $G: "treasure", $C: "treasure", TG: "treasure", TB: "treasure",
  OTH: "other",
};

interface Lookups {
  properties: Map<string, string>;   // "v|xphb" -> "Versatile"
  propertiesByCode: Map<string, string>; // "rld" -> "Reload", first definition
  masteries: Map<string, string>;    // "sap|xphb" -> "Sap"
  entryTemplates: Map<string, unknown[]>; // "armor of resistance|dmg" -> entriesTemplate
}

interface PlanState {
  plan: ItemImportPlan;
  lookups: Lookups;
}

export function buildItemImportPlan(sources: Dnd5eToolsItemSources): ItemImportPlan {
  const itemsJson = requireObject(sources.items, "items.json");
  const baseJson = requireObject(sources.base, "items-base.json");
  const variantsJson = requireObject(sources.variants, "magicvariants.json");
  const plan: ItemImportPlan = {
    records: [],
    failures: [],
    unresolved: [],
    cyclic: [],
    unsupported: [],
    counts: {
      input: { named: 0, base: 0, group: 0, family: 0 },
      byKind: { named: 0, base: 0, group: 0, family: 0, specific: 0 },
      byRole: { concrete: 0, family: 0, group: 0 },
    },
  };
  const readInputRecords = (value: unknown, kind: keyof ItemImportPlan["counts"]["input"], label: string) => {
    plan.counts.input[kind] = Array.isArray(value) ? value.length : 0;
    return records(value, label, plan.failures);
  };
  const named = readInputRecords(itemsJson.item, "named", "items.json item");
  const groups = readInputRecords(itemsJson.itemGroup, "group", "items.json itemGroup");
  const bases = readInputRecords(baseJson.baseitem, "base", "items-base.json baseitem");
  const variants = readInputRecords(variantsJson.magicvariant, "family", "magicvariants.json magicvariant");
  const state: PlanState = { plan, lookups: buildLookups(baseJson, plan.failures) };

  // Internal copies (upstream _meta.internalCopies): items within items.json, families within magicvariants.json.
  const resolvedNamed = resolveList(state, named);
  const resolvedVariants = resolveList(state, variants);

  // Reference index: upstream uid -> import key, for group members, pack contents and base links.
  const uidToKey = new Map<string, string>();
  const ambiguous = new Set<string>();
  const index = (uid: string, key: string) => {
    if (uidToKey.has(uid) && uidToKey.get(uid) !== key) ambiguous.add(uid);
    else uidToKey.set(uid, key);
  };
  const baseUids = new Set<string>();
  for (const base of bases) {
    const uid = uidOf(base);
    baseUids.add(uid);
    index(uid, itemImportKey({ kind: "base", uid }));
  }
  for (const item of resolvedNamed) if (item) index(uidOf(item.record), itemImportKey({ kind: "named", uid: uidOf(item.record) }));
  for (const variant of resolvedVariants) if (variant) index(uidOf(variant.record), itemImportKey({ kind: "family", uid: uidOf(variant.record) }));
  for (const group of groups) index(uidOf(group), itemImportKey({ kind: "group", uid: uidOf(group) }));

  // Generate specifics: every eligible base × every family it matches, once per printing pair.
  const specifics: Array<{ family: UpstreamRecord; base: UpstreamRecord; record: UpstreamRecord; warnings: string[] }> = [];
  for (const variant of resolvedVariants) {
    if (!variant) continue;
    if (!Array.isArray(variant.record.requires)) {
      state.plan.unsupported.push({ label: labelOf(variant.record), message: "Family without requirements generates no specifics." });
      continue;
    }
    for (const base of bases) {
      try {
        if (!matchesVariant(base, variant.record)) continue;
        const warnings: string[] = [];
        specifics.push({ family: variant.record, base, record: createSpecific(base, variant.record, warnings), warnings });
      } catch (error) {
        state.plan.failures.push({ label: `${labelOf(variant.record)} > ${labelOf(base)}`, message: errorMessage(error) });
      }
    }
  }
  for (const specific of specifics) {
    const key = itemImportKey({ kind: "specific", familyUid: uidOf(specific.family), baseUid: uidOf(specific.base) });
    index(uidOf(specific.record), key);
  }

  const resolveRef = (ref: string, label: string, what: string): string | undefined => {
    const uid = refUid(ref);
    if (ambiguous.has(uid)) {
      state.plan.unresolved.push({ label, message: `${what} "${ref}" matches more than one record.` });
      return undefined;
    }
    const key = uidToKey.get(uid);
    if (!key) state.plan.unresolved.push({ label, message: `${what} "${ref}" not found.` });
    return key;
  };

  const out: ItemImportRecord[] = [];
  const add = (build: () => ItemImportRecord | undefined, label: string) => {
    try {
      const record = build();
      if (record) out.push(record);
    } catch (error) {
      state.plan.failures.push({ label, message: errorMessage(error) });
    }
  };

  for (const base of bases) {
    add(() => normalize(state, {
      kind: "concrete",
      upstreamKind: "base",
      identity: { kind: "base", uid: uidOf(base) },
      record: base,
      upstream: { kind: "base", record: base },
      relations: packRelations(base, label => resolveRef(label, labelOf(base), "Pack content")),
    }), labelOf(base));
  }
  for (const { raw, record: item } of resolvedNamed.flatMap(entry => entry ? [entry] : [])) {
    add(() => {
      const baseRef = asString(item.baseItem);
      let baseKey: string | undefined;
      if (baseRef) {
        const uid = refUid(baseRef);
        baseKey = itemImportKey({ kind: "base", uid });
        if (!baseUids.has(uid)) state.plan.unresolved.push({ label: labelOf(item), message: `Base item "${baseRef}" is not in the inputs.` });
      }
      return normalize(state, {
        kind: "concrete",
        upstreamKind: "named",
        identity: { kind: "named", uid: uidOf(item) },
        record: item,
        upstream: raw === item ? { kind: "named", record: item } : { kind: "named", record: raw, resolved: item },
        baseKey,
        relations: packRelations(item, ref => resolveRef(ref, labelOf(item), "Pack content")),
      });
    }, labelOf(item));
  }

  const specificCategories = new Map<string, Set<ItemCategory | undefined>>();
  const familyRecords: ItemImportRecord[] = [];
  for (const variant of resolvedVariants) {
    if (!variant) continue;
    add(() => {
      const warnings: string[] = [];
      const record = familyRecord(variant.record, warnings);
      const normalized = normalize(state, {
        kind: "family",
        upstreamKind: "family",
        identity: { kind: "family", uid: uidOf(variant.record) },
        record: { ...record, name: variant.record.name, source: sourceOf(variant.record) },
        upstream: variant.raw === variant.record
          ? { kind: "family", record: variant.raw }
          : { kind: "family", record: variant.raw, resolved: variant.record },
        relations: [],
        warnings,
        noCategory: true,
      });
      if (normalized) familyRecords.push(normalized);
      return normalized;
    }, labelOf(variant.record));
  }

  for (const specific of specifics) {
    const familyUid = uidOf(specific.family);
    const baseUid = uidOf(specific.base);
    add(() => {
      const normalized = normalize(state, {
        kind: "concrete",
        upstreamKind: "specific",
        identity: { kind: "specific", familyUid, baseUid },
        record: specific.record,
        upstream: { kind: "specific", family: familyUid, base: baseUid, uid: uidOf(specific.record) },
        familyKey: itemImportKey({ kind: "family", uid: familyUid }),
        baseKey: itemImportKey({ kind: "base", uid: baseUid }),
        relations: [],
        warnings: specific.warnings,
      });
      if (normalized) {
        const set = specificCategories.get(normalized.familyKey ?? "") ?? new Set();
        set.add(normalized.category);
        specificCategories.set(normalized.familyKey ?? "", set);
      }
      return normalized;
    }, `${labelOf(specific.family)} > ${labelOf(specific.base)}`);
  }

  // A family's category is the one all its specifics share, if they agree.
  for (const family of familyRecords) {
    const categories = specificCategories.get(family.importKey);
    if (categories?.size === 1) {
      const [category] = categories;
      if (category) family.category = category;
    }
  }

  for (const group of groups) {
    add(() => normalize(state, {
      kind: "group",
      upstreamKind: "group",
      identity: { kind: "group", uid: uidOf(group) },
      record: group,
      upstream: { kind: "group", record: group },
      relations: asArray(group.items).flatMap((member, position) => {
        const ref = asString(member);
        if (!ref) {
          state.plan.unsupported.push({ label: labelOf(group), message: `Group member ${JSON.stringify(member)} is not a reference.` });
          return [];
        }
        const memberKey = resolveRef(ref, labelOf(group), "Group member");
        return [{ relation: "group_member" as const, position, memberRef: ref, ...(memberKey ? { memberKey } : {}) }];
      }),
    }), labelOf(group));
  }

  const byKey = new Map<string, ItemImportRecord>();
  const unique: ItemImportRecord[] = [];
  for (const record of out) {
    if (byKey.has(record.importKey)) {
      plan.failures.push({ label: `${record.name}|${record.source}`, message: `Identity ${record.importKey} collides with another record.` });
      continue;
    }
    byKey.set(record.importKey, record);
    unique.push(record);
  }

  // Write order: base, named, family, specific, group, then packs, so every parent, group member
  // and pack content is written before the row that links to it.
  const isPack = (record: ItemImportRecord) => record.relations.some(relation => relation.relation === "pack_content");
  for (const record of [...unique.filter(record => !isPack(record)), ...unique.filter(isPack)]) {
    // Specifics must link to a family and an eligible base item.
    if (record.familyKey && byKey.get(record.familyKey)?.kind !== "family") {
      plan.failures.push({ label: `${record.name}|${record.source}`, message: `Family ${record.familyKey} is not in the plan.` });
      continue;
    }
    if (record.upstreamKind === "specific" && record.baseKey && byKey.get(record.baseKey)?.upstreamKind !== "base") {
      plan.failures.push({ label: `${record.name}|${record.source}`, message: `Base item ${record.baseKey} is not in the plan.` });
      continue;
    }
    plan.records.push(record);
    plan.counts.byKind[record.upstreamKind] += 1;
    plan.counts.byRole[record.kind] += 1;
  }
  return plan;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function requireObject(value: unknown, file: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${file} must be a JSON object.`);
  return value;
}

function records(value: unknown, label: string, failures: ItemImportIssue[]): UpstreamRecord[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value.filter((record, index): record is UpstreamRecord => {
    if (isRecord(record)) return true;
    failures.push({ label: `${label}[${index}]`, message: "Expected an object." });
    return false;
  });
}

const sourceOf = (record: UpstreamRecord): string =>
  asString(record.source) ?? (isRecord(record.inherits) ? asString(record.inherits.source) : undefined) ?? "";

const uidOf = (record: UpstreamRecord): string => itemUid(asString(record.name) ?? "", sourceOf(record));
const labelOf = (record: UpstreamRecord): string => `${asString(record.name) ?? "(unnamed)"}|${sourceOf(record)}`;

/** "longsword|phb" or "Dagger" (default source DMG) -> uid. */
export function refUid(ref: string, defaultSource = DEFAULT_REF_SOURCE): string {
  const [name = "", source = ""] = ref.split("|");
  return itemUid(name, source.trim() || defaultSource);
}

function resolveList(state: PlanState, list: UpstreamRecord[]): Array<{ raw: UpstreamRecord; record: UpstreamRecord } | undefined> {
  const resolution = resolveCopies(list, uidOf);
  for (const failure of resolution.failures) {
    const issue = { label: labelOf(list[failure.index]), message: failure.error };
    if (failure.kind === "cyclic") state.plan.cyclic.push(issue);
    else if (failure.kind === "unresolved") state.plan.unresolved.push(issue);
    else state.plan.unsupported.push(issue);
    state.plan.failures.push(issue);
  }
  return resolution.records.map((record, index) => record ? { raw: list[index], record: list[index]._copy ? record : list[index] } : undefined);
}

function buildLookups(baseJson: Record<string, unknown>, failures: ItemImportIssue[]): Lookups {
  const properties = new Map<string, string>();
  const propertiesByCode = new Map<string, string>();
  for (const property of records(baseJson.itemProperty, "itemProperty", failures)) {
    const name = asString(property.name)
      ?? firstEntryName(property.entries)
      ?? firstEntryName(property.entriesTemplate);
    const abbreviation = asString(property.abbreviation);
    if (!name || !abbreviation) continue;
    properties.set(`${abbreviation}|${asString(property.source) ?? "PHB"}`.toLowerCase(), name);
    if (!propertiesByCode.has(abbreviation.toLowerCase())) propertiesByCode.set(abbreviation.toLowerCase(), name);
  }
  const masteries = new Map<string, string>();
  for (const mastery of records(baseJson.itemMastery, "itemMastery", failures)) {
    const name = asString(mastery.name);
    if (name) masteries.set(`${name}|${asString(mastery.source) ?? "PHB"}`.toLowerCase(), name);
  }
  const entryTemplates = new Map<string, unknown[]>();
  for (const entry of records(baseJson.itemEntry, "itemEntry", failures)) {
    const name = asString(entry.name);
    if (name) entryTemplates.set(itemUid(name, asString(entry.source) ?? DEFAULT_REF_SOURCE), asArray(entry.entriesTemplate));
  }
  return { properties, propertiesByCode, masteries, entryTemplates };
}

const firstEntryName = (value: unknown): string | undefined => {
  const first = asArray(value)[0];
  return isRecord(first) ? asString(first.name) : undefined;
};

function packRelations(record: UpstreamRecord, resolve: (ref: string) => string | undefined): ItemImportRelation[] {
  return asArray(record.packContents).flatMap((content, position) => {
    if (isRecord(content) && typeof content.special === "string" && content.item === undefined) return [];
    const ref = typeof content === "string" ? content : isRecord(content) && typeof content.item === "string" ? content.item : undefined;
    if (!ref?.trim()) throw new Error(`Pack content at position ${position} needs an item reference.`);
    const quantity = isRecord(content) ? optionalNumber(content.quantity, "Pack quantity") : undefined;
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 0xffff_ffff)) {
      throw new Error("Pack quantity must be a positive whole number that fits the catalog.");
    }
    const memberKey = resolve(ref);
    return [{
      relation: "pack_content" as const,
      position,
      memberRef: ref,
      ...(memberKey ? { memberKey } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
    }];
  });
}

// ─── Normalization ────────────────────────────────────────────────────────────

interface NormalizeInput {
  kind: ItemKind;
  upstreamKind: UpstreamItemKind;
  identity: ItemImportIdentity;
  record: UpstreamRecord;
  upstream: Record<string, unknown>;
  familyKey?: string;
  baseKey?: string;
  relations: ItemImportRelation[];
  warnings?: string[];
  noCategory?: boolean;
}

function normalize(state: PlanState, input: NormalizeInput): ItemImportRecord {
  const { record } = input;
  const label = labelOf(record);
  const warnings = [...(input.warnings ?? [])];
  const unsupported = (message: string) => state.plan.unsupported.push({ label, message });

  const rarityValue = asString(record.rarity) ?? "none";
  const rarity = (ITEM_RARITIES as readonly string[]).includes(rarityValue) ? rarityValue as ItemRarity : "unknown";
  if (rarity !== rarityValue) unsupported(`Rarity "${rarityValue}" mapped to unknown.`);

  const attunement = normalizeAttunement(record.reqAttune, unsupported);
  const details = buildDetails(state, record, warnings, unsupported);

  const candidate = {
    name: asString(record.name),
    source: sourceOf(record),
    page: optionalNumber(record.page, "Page"),
    category: input.noCategory ? undefined : categoryOf(record, unsupported),
    rarity,
    requiresAttunement: attunement.requires,
    attunementNote: attunement.note,
    valueCp: optionalNumber(record.value, "Value"),
    weightLb: optionalNumber(record.weight, "Weight"),
    aliases: asArray(record.alias).map(asString).filter((alias): alias is string => Boolean(alias?.trim())),
    details,
  };
  // The same rules as GM authoring, so every imported row fits its columns and stays editable.
  const validation = validateItemInput(candidate);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const value = validation.value;
  const importKey = itemImportKey(input.identity);
  if (Array.from(importKey).length > 512) throw new Error("Import identity is too long for the catalog.");
  for (const relation of input.relations) {
    if (relation.position > 0xffff || Array.from(relation.memberRef).length > 512) {
      throw new Error("Relationship position or reference is too long for the catalog.");
    }
  }

  for (const warning of warnings) {
    if (warning.startsWith("Unhandled entry type")) unsupported(warning);
  }
  return {
    importKey,
    upstreamKind: input.upstreamKind,
    kind: input.kind,
    name: value.name,
    source: value.source,
    ...(value.page !== undefined ? { page: value.page } : {}),
    ...(value.category !== undefined ? { category: value.category } : {}),
    rarity: value.rarity,
    requiresAttunement: value.requiresAttunement,
    ...(value.attunementNote !== undefined ? { attunementNote: value.attunementNote } : {}),
    ...(value.valueCp !== undefined ? { valueCp: value.valueCp } : {}),
    ...(value.weightLb !== undefined ? { weightLb: value.weightLb } : {}),
    aliases: value.aliases,
    details: { ...value.details, upstream: input.upstream },
    ...(input.familyKey ? { familyKey: input.familyKey } : {}),
    ...(input.baseKey ? { baseKey: input.baseKey } : {}),
    relations: input.relations,
    warnings: warnings.filter(warning => !warning.startsWith("Unhandled entry type")),
  };
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = asNumber(value);
  if (parsed === undefined) throw new Error(`${label} must be numeric.`);
  return parsed;
}

function normalizeAttunement(value: unknown, unsupported: (message: string) => void): { requires: boolean; note?: string } {
  if (value === undefined || value === null || value === false) return { requires: false };
  if (value === true) return { requires: true };
  if (typeof value === "string") {
    // "optional" attunement is not required; the raw value stays in storage.
    if (value.trim().toLowerCase() === "optional") {
      return { requires: false, note: OPTIONAL_ITEM_ATTUNEMENT };
    }
    return { requires: true, note: value };
  }
  unsupported(`Attunement ${JSON.stringify(value)} imported as required.`);
  return { requires: true };
}

function categoryOf(record: UpstreamRecord, unsupported: (message: string) => void): ItemCategory | undefined {
  if (record.staff === true) return "staff";
  if (record.wondrous === true) return "wondrous item";
  const type = asString(record.type);
  if (!type) return undefined;
  const abbreviation = type.split("|")[0].trim().toUpperCase();
  // "GV": a group of magic-variant families; its members carry the categories.
  if (abbreviation === "GV") return undefined;
  const category = TYPE_CATEGORIES[abbreviation];
  if (category) return category;
  unsupported(`Item type "${type}" mapped to other.`);
  return "other";
}

function buildDetails(
  state: PlanState,
  record: UpstreamRecord,
  warnings: string[],
  unsupported: (message: string) => void
): ItemDetails {
  const entries = [...expandItemEntries(state, record, asArray(record.entries)), ...asArray(record.additionalEntries)];
  const description = renderSpellEntries(entries, warnings);
  if (/\{@(?!(?:spell|item)(?:\s|\}))/i.test(description)) unsupported("Description has unrendered inline markup.");
  const qualifiers: string[] = [];
  const properties = asArray(record.property).map(property => propertyName(state, property, unsupported, qualifiers));
  const mastery = asArray(record.mastery).map(value => masteryName(state, value, unsupported, qualifiers));
  const fullDescription = [description, ...qualifiers].filter(Boolean).join("\n\n");
  const text = (value: unknown) => {
    const raw = asString(value);
    return raw === undefined ? undefined : renderDnd5eToolsText(raw, ITEM_TEXT_OPTIONS) || undefined;
  };
  const dice = text(record.dmg1);
  const weaponCategory = asString(record.weaponCategory)?.toLowerCase();
  const charges = typeof record.charges === "number" ? record.charges : text(record.charges);

  return {
    ...(fullDescription ? { description: fullDescription } : {}),
    ...(record.wondrous === true ? { wondrous: true } : {}),
    ...(weaponCategory === "simple" || weaponCategory === "martial" ? { weaponCategory } : {}),
    ...(dice ? {
      damage: {
        dice,
        ...(damageTypeName(record.dmgType) ? { type: damageTypeName(record.dmgType) } : {}),
        ...(text(record.dmg2) ? { versatileDice: text(record.dmg2) } : {}),
      },
    } : {}),
    ...(asString(record.range) ? { range: asString(record.range) } : {}),
    ...listField("properties", properties),
    ...listField("mastery", mastery),
    ...(asNumber(record.ac) !== undefined ? { armorClass: asNumber(record.ac) } : {}),
    ...(asNumber(record.strength) !== undefined ? { strength: asNumber(record.strength) } : {}),
    ...(record.stealth === true ? { stealthDisadvantage: true } : {}),
    ...(asString(record.bonusWeapon) ? { bonusWeapon: asString(record.bonusWeapon) } : {}),
    ...(asString(record.bonusAc) ? { bonusAc: asString(record.bonusAc) } : {}),
    ...(charges !== undefined ? { charges } : {}),
    ...(asString(record.recharge) ? { recharge: asString(record.recharge) } : {}),
    ...(text(record.rechargeAmount) ? { rechargeAmount: text(record.rechargeAmount) } : {}),
    ...listField("spells", attachedSpells(record.attachedSpells)),
  };
}

function listField<K extends string, T>(key: K, values: Array<T | undefined>): Partial<Record<K, T[]>> {
  const kept = values.filter((value): value is T => value !== undefined);
  const unique = kept.filter((value, index) => kept.findIndex(other => JSON.stringify(other) === JSON.stringify(value)) === index);
  return unique.length > 0 ? { [key]: unique } as Partial<Record<K, T[]>> : {};
}

function propertyName(state: PlanState, value: unknown, unsupported: (message: string) => void, qualifiers: string[]): string | undefined {
  const uid = isRecord(value) ? asString(value.uid) : asString(value);
  if (!uid) return undefined;
  const [abbreviation = "", source = "PHB"] = uid.split("|");
  // Upstream falls back to the PHB code; an unqualified "RLD" is only defined by DMG/XDMG, so also
  // accept the first definition of the code.
  const name = state.lookups.properties.get(`${abbreviation}|${source}`.toLowerCase())
    ?? state.lookups.properties.get(`${abbreviation}|phb`.toLowerCase())
    ?? (uid.includes("|") ? undefined : state.lookups.propertiesByCode.get(abbreviation.toLowerCase()));
  if (!name) {
    unsupported(`Item property "${uid}" has no name in items-base.json.`);
    return abbreviation;
  }
  return withNote(name, value, qualifiers);
}

function masteryName(state: PlanState, value: unknown, unsupported: (message: string) => void, qualifiers: string[]): string | undefined {
  const uid = isRecord(value) ? asString(value.uid) : asString(value);
  if (!uid) return undefined;
  const [name = "", source = "PHB"] = uid.split("|");
  const known = state.lookups.masteries.get(`${name}|${source}`.toLowerCase());
  if (!known) unsupported(`Weapon mastery "${uid}" has no entry in items-base.json.`);
  return withNote(known ?? name, value, qualifiers);
}

// Keep short qualifiers with the label and move longer ones into the description.
function withNote(name: string, value: unknown, qualifiers: string[]): string {
  const note = isRecord(value) ? asString(value.note) : undefined;
  if (!note) return name;
  const display = `${name} (${renderDnd5eToolsText(note)})`;
  if (display.length <= ITEM_LIMITS.shortText) return display;
  qualifiers.push(`**${name}.** ${renderDnd5eToolsText(note, DESCRIPTION_TEXT_OPTIONS)}`);
  return name;
}

// attachedSpells: ["fireball|xphb", ...] or { will: [...], daily: { "1e": [...] }, charges: {...}, ... }
function attachedSpells(value: unknown): SpellRef[] {
  const names: string[] = [];
  const collect = (node: unknown) => {
    if (typeof node === "string") names.push(node);
    else if (Array.isArray(node)) node.forEach(collect);
    else if (isRecord(node)) Object.values(node).forEach(collect);
  };
  if (Array.isArray(value)) collect(value);
  else if (isRecord(value)) {
    for (const field of ["will", "daily", "rest", "charges", "limited", "ritual", "other"]) collect(value[field]);
  }
  return names.flatMap(ref => {
    const [name = "", source = ""] = ref.split("|").map(part => part.trim());
    if (!name) return [];
    return [source ? { name, source: source.toUpperCase() } : { name }];
  });
}

// "{#itemEntry Armor of Resistance|DMG}" -> the template's entries, with {{item.resist}} filled from the item.
function expandItemEntries(state: PlanState, record: UpstreamRecord, entries: unknown[]): unknown[] {
  return entries.flatMap(entry => {
    if (typeof entry === "string") {
      const match = /^\{#itemEntry ([^}]+)\}$/.exec(entry.trim());
      if (!match) return [entry];
      const template = state.lookups.entryTemplates.get(refUid(match[1]));
      if (!template) {
        state.plan.unresolved.push({ label: labelOf(record), message: `Item entry template "${match[1]}" not found.` });
        return [];
      }
      return walkStrings(structuredClone(template), text => applyTemplate(record, text)) as unknown[];
    }
    if (isRecord(entry) && Array.isArray(entry.entries)) {
      return [{ ...entry, entries: expandItemEntries(state, record, entry.entries) }];
    }
    return [entry];
  });
}

// Upstream Renderer.utils.applyTemplate: {{item.path}} and {{getFullImmRes item.path}}.
function applyTemplate(record: UpstreamRecord, text: string): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, body: string) => {
    const args = body.trim().split(/\s+/);
    const valueOf = (path: string) => {
      const [root, ...rest] = path.split(".");
      return root === "item" && rest.length > 0 ? getPath(record, rest) : undefined;
    };
    if (args.length === 1) return formatTemplateValue(valueOf(args[0]));
    if (args.length === 2 && args[0] === "getFullImmRes") return joinList(asArray(valueOf(args[1])).flatMap(immResNames));
    return "";
  });
}

function formatTemplateValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(formatTemplateValue).join(", ");
  return typeof value === "object" ? "" : String(value);
}

function immResNames(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (isRecord(value)) {
    const list = ["resist", "immune", "vulnerable", "conditionImmune"].map(key => value[key]).find(Array.isArray) as unknown[] | undefined;
    return (list ?? []).flatMap(immResNames);
  }
  return [];
}

const joinList = (values: string[]): string =>
  values.length <= 2 ? values.join(" and ") : `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
