import type { Dnd5eToolsMonster, EntityTagDB } from "./types.js";
import { TAG_ARRAY_FIELDS } from "./constants.js";
import { asString, fitField, isRecord, uniqueBy } from "./primitives.js";
import { renderDnd5eToolsText } from "./text-renderer.js";

export function buildTags(monster: Dnd5eToolsMonster, warnings: string[]): EntityTagDB[] {
  const tags: EntityTagDB[] = [];

  addTag(tags, "source", asString(monster.source), warnings);
  addTag(tags, "page", monster.page !== undefined ? String(monster.page) : undefined, warnings);
  addTag(tags, "dragon_age", asString(monster.dragonAge), warnings);

  if (monster.srd52 === true) addTag(tags, "rules", "srd52", warnings);
  if (monster.basicRules2024 === true) addTag(tags, "rules", "basic_2024", warnings);
  if (monster.hasToken === true) addTag(tags, "asset", "token", warnings);
  if (monster.hasFluff === true) addTag(tags, "asset", "fluff", warnings);
  if (monster.hasFluffImages === true) addTag(tags, "asset", "fluff_images", warnings);

  for (const { field, tagType } of TAG_ARRAY_FIELDS) {
    for (const value of collectTagValues(monster[field])) {
      addTag(tags, tagType, value, warnings);
    }
  }

  return uniqueBy(tags, tag => `${tag.tag_type}:${tag.tag}`);
}

function addTag(tags: EntityTagDB[], tagType: string, tag: string | undefined, warnings: string[]): void {
  if (!tag) return;
  tags.push({
    tag_type: fitField(tagType, 16, "entity_tags.tag_type", warnings),
    tag: fitField(renderDnd5eToolsText(tag), 32, "entity_tags.tag", warnings),
  });
}

function collectTagValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectTagValues);
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (isRecord(value)) {
    const tag = asString(value.tag) ?? asString(value.name) ?? asString(value.type);
    return tag ? [tag] : [];
  }

  return [];
}
