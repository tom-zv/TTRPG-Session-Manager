import type { DnD5eEntityDB } from "src/api/encounter/entities/dnd5e/types.js";
import type { Dnd5eToolsMonster } from "./types.js";
import { ALIGNMENT_NAMES, SIZE_NAMES } from "./constants.js";
import { asArray, asNumber, asString, fitField, isRecord, parseFirstNumber, unique } from "./primitives.js";
import { renderDnd5eToolsText, renderEntry } from "./text-renderer.js";

export function normalizeImageUrl(monster: Dnd5eToolsMonster, warnings: string[]): string | undefined {
  const url = asString(monster.tokenUrl) ?? asString(monster.imageUrl) ?? asString(monster.image_url);
  return url ? fitField(url, 256, `${monster.name ?? "monster"} image_url`, warnings) : undefined;
}

export function normalizeCreatureType(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase();
  if (isRecord(value)) return asString(value.type)?.toLowerCase();
  return undefined;
}

export function normalizeTypeTags(value: unknown): string[] | undefined {
  if (!isRecord(value)) return undefined;

  const tags: string[] = [];
  for (const tag of asArray(value.tags)) {
    if (typeof tag === "string") {
      tags.push(renderDnd5eToolsText(tag));
    } else if (isRecord(tag)) {
      const rendered = asString(tag.tag) ?? asString(tag.type) ?? asString(tag.name);
      if (rendered) tags.push(renderDnd5eToolsText(rendered));
    }
  }

  const swarmSize = asString(value.swarmSize);
  if (swarmSize) tags.push(`swarm:${normalizeSize([swarmSize])}`);

  return tags.length > 0 ? unique(tags) : undefined;
}

export function normalizeCr(value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (isRecord(value)) return asString(value.cr) ?? (asNumber(value.cr) !== undefined ? String(value.cr) : undefined);
  return undefined;
}

export function normalizeAc(value: unknown): number {
  for (const entry of asArray(value)) {
    const ac = extractAc(entry);
    if (ac !== undefined) return ac;
  }

  return extractAc(value) ?? 10;
}

export function normalizeHp(value: unknown): { average: number; formula?: string } {
  if (typeof value === "number") return { average: value };

  if (isRecord(value)) {
    const average = asNumber(value.average) ?? 1;
    const formula = asString(value.formula) ?? asString(value.special);
    return { average, formula };
  }

  return { average: 1 };
}

export function normalizeSpeeds(value: unknown): Record<string, number> {
  if (typeof value === "number") return { walk: value };
  if (typeof value === "string") return { walk: parseFirstNumber(value) ?? 30 };
  if (!isRecord(value)) return { walk: 30 };

  const speeds: Record<string, number> = {};
  for (const [speedType, speedValue] of Object.entries(value)) {
    if (speedType === "canHover" || speedType === "alternate") continue;

    if (typeof speedValue === "number") {
      speeds[speedType] = speedValue;
    } else if (typeof speedValue === "string") {
      const parsed = parseFirstNumber(speedValue);
      if (parsed !== undefined) speeds[speedType] = parsed;
    } else if (isRecord(speedValue)) {
      const parsed = asNumber(speedValue.number) ?? parseFirstNumber(asString(speedValue.condition));
      if (parsed !== undefined) speeds[speedType] = parsed;
    }
  }

  return Object.keys(speeds).length > 0 ? speeds : { walk: 30 };
}

export function normalizeSize(value: unknown): DnD5eEntityDB["size"] {
  const first = asArray(value)[0] ?? value;
  if (typeof first !== "string") return "medium";
  return SIZE_NAMES[first.toUpperCase()] ?? first.toLowerCase() as DnD5eEntityDB["size"];
}

export function normalizeAlignment(value: unknown): string {
  if (!value) return "unaligned";

  if (Array.isArray(value) && value.every(item => typeof item === "string")) {
    const mapped = value.map(item => ALIGNMENT_NAMES[item] ?? item.toLowerCase());
    return mapped.join(" ");
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeAlignment(item)).join(" or ");
  }

  if (isRecord(value)) {
    const chance = asNumber(value.chance);
    const alignment = normalizeAlignment(value.alignment);
    return chance !== undefined ? `${alignment} (${chance}%)` : alignment;
  }

  if (typeof value === "string") return ALIGNMENT_NAMES[value] ?? value.toLowerCase();

  return "unaligned";
}

export function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;

  const entries = Object.entries(value)
    .map(([key, recordValue]) => [key, asString(recordValue) ?? String(recordValue)] as const)
    .filter(([, recordValue]) => recordValue !== "undefined");

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function normalizeStringArray(value: unknown): string[] | undefined {
  const values = asArray(value)
    .map(item => {
      if (typeof item === "string") return renderDnd5eToolsText(item);
      if (typeof item === "number") return String(item);
      if (isRecord(item)) return renderEntry(item);
      return undefined;
    })
    .filter((item): item is string => Boolean(item));

  return values.length > 0 ? values : undefined;
}

export function normalizeLegendaryActionCount(monster: Dnd5eToolsMonster, legendaryActions: unknown[]): number {
  return asNumber(monster.legendaryActions)
    ?? asNumber(monster.legendaryActionsLair)
    ?? (legendaryActions.length > 0 ? 3 : 0);
}

function extractAc(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (isRecord(value)) return asNumber(value.ac);
  return undefined;
}
