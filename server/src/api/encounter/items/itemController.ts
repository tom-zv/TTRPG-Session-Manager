import type { Request, Response, NextFunction } from "express";
import itemService from "./itemService.js";
import { ValidationError } from "../../HttpErrors.js";
import type { AuthRequest } from "src/middleware/userAuth.js";
import {
  ITEM_CATEGORIES,
  ITEM_ID_MAX,
  ITEM_KINDS,
  ITEM_LIMITS,
  ITEM_LIST_LIMITS,
  ITEM_RARITIES,
  validateItemInput,
  validateItemResolveRequest,
  type ItemInput,
  type ItemListResult,
  type ItemMembersResult,
  type ItemOrigin,
  type ItemResolveResult,
} from "shared/domain/dnd5e/item.js";
import {
  itemDbToDomain,
  itemDbToSummary,
} from "src/utils/format-transformers/encounter-transformers/dnd5e/item-transformer.js";
import type { ItemListFilter, ItemPage } from "./itemModel.js";
import type { ItemViewer } from "./types.js";

const viewerOf = (req: Request): ItemViewer => ({ isGm: Boolean((req as AuthRequest).userSession?.userDb.is_gm) });

function readItemId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0 || id > ITEM_ID_MAX) throw new ValidationError("Item ID must be a positive integer");
  return id;
}

// ─── Query parsing ────────────────────────────────────────────────────────────
// Enumerated lists support commas. Each sources parameter is one literal source name.

class QueryReader {
  readonly errors: string[] = [];
  constructor(private readonly query: Record<string, unknown>) {}

  private strings(key: string): string[] | undefined {
    const raw = this.query[key];
    if (raw === undefined) return undefined;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.some(value => typeof value !== "string")) {
      this.errors.push(`${key} must be text.`);
      return undefined;
    }
    return values as string[];
  }

  text(key: string, max: number): string | undefined {
    const raw = this.query[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== "string") {
      this.errors.push(`${key} must be text.`);
      return undefined;
    }
    const value = raw.trim();
    if (value.length > max) this.errors.push(`${key} can be at most ${max} characters.`);
    return value || undefined;
  }

  oneOf<T extends string>(key: string, allowed: readonly T[]): T[] | undefined {
    const values = this.strings(key)?.flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
    if (!values || values.length === 0) return undefined;
    const unknown = values.filter(value => !(allowed as readonly string[]).includes(value));
    if (unknown.length > 0) this.errors.push(`${key} must be among: ${allowed.join(", ")}.`);
    return [...new Set(values)] as T[];
  }

  names(key: string, max: number, count: number): string[] | undefined {
    const values = this.strings(key)?.map(value => value.trim()).filter(Boolean);
    if (!values || values.length === 0) return undefined;
    if (values.length > count || values.some(value => value.length > max)) {
      this.errors.push(`${key} can list at most ${count} values of at most ${max} characters.`);
    }
    return [...new Set(values)];
  }

  flag(key: string): boolean | undefined {
    const raw = this.query[key];
    if (raw === undefined) return undefined;
    if (raw === "true") return true;
    if (raw === "false") return false;
    this.errors.push(`${key} must be true or false.`);
    return undefined;
  }

  whole(key: string, fallback: number, min: number, max: number): number {
    const raw = this.query[key];
    if (raw === undefined) return fallback;
    const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      this.errors.push(`${key} must be a whole number from ${min} to ${max}.`);
      return fallback;
    }
    return value;
  }

  page(): ItemPage {
    return {
      offset: this.whole("offset", 0, 0, ITEM_ID_MAX),
      limit: this.whole("limit", ITEM_LIST_LIMITS.defaultLimit, 1, ITEM_LIST_LIMITS.maxLimit),
    };
  }

  done(): void {
    if (this.errors.length > 0) throw new ValidationError(this.errors.join("\n"));
  }
}

const ORIGINS: readonly ItemOrigin[] = ["imported", "homebrew"];

function readListFilter(req: Request): ItemListFilter {
  const reader = new QueryReader(req.query as Record<string, unknown>);
  const q = reader.text("q", ITEM_LIST_LIMITS.query);
  const specifics = reader.flag("specifics");
  const filter: ItemListFilter = {
    q,
    includeSpecifics: specifics ?? q !== undefined,
    kinds: reader.oneOf("kinds", ITEM_KINDS),
    categories: reader.oneOf("categories", ITEM_CATEGORIES),
    origins: reader.oneOf("origins", ORIGINS),
    rarities: reader.oneOf("rarities", ITEM_RARITIES),
    sources: reader.names("sources", ITEM_LIMITS.source, ITEM_LIMITS.list),
    attunement: reader.flag("attunement"),
    ...reader.page(),
  };
  reader.done();
  return filter;
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function listItems(req: Request, res: Response, next: NextFunction) {
  try {
    const viewer = viewerOf(req);
    const { rows, ...page } = await itemService.listItems(readListFilter(req), viewer);
    const result: ItemListResult = { items: rows.map(row => itemDbToSummary(row, viewer)), ...page };
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function getItemById(req: Request, res: Response, next: NextFunction) {
  try {
    const viewer = viewerOf(req);
    const item = await itemService.getItem(readItemId(req), viewer);
    res.status(200).json({ item: itemDbToDomain(item, viewer) });
  } catch (err) {
    next(err);
  }
}

async function getItemMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const viewer = viewerOf(req);
    const id = readItemId(req);
    const reader = new QueryReader(req.query as Record<string, unknown>);
    const page = reader.page();
    reader.done();
    const { rows, ...rest } = await itemService.getItemMembers(id, viewer, page);
    const result: ItemMembersResult = {
      ...rest,
      members: rows.map(row => ({
        item: itemDbToSummary(row, viewer),
        ...(row.quantity !== null && row.quantity !== undefined ? { quantity: row.quantity } : {}),
      })),
    };
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

async function resolveItems(req: Request, res: Response, next: NextFunction) {
  try {
    const viewer = viewerOf(req);
    const request = validateItemResolveRequest(req.body);
    if (!request.ok) throw new ValidationError(request.errors.join("\n"));
    const resolved = await itemService.resolveItems(request.value.refs, viewer);
    const result: ItemResolveResult = {
      results: resolved.map(({ ref, row }) => ({ ref, item: row ? itemDbToSummary(row, viewer) : null })),
    };
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

function readItemInput(req: Request): ItemInput {
  const validated = validateItemInput(req.body);
  if (!validated.ok) throw new ValidationError("Invalid item data.", validated.issues);
  return validated.value;
}

async function createItem(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await itemService.createItem(readItemInput(req));
    res.status(201).json({ item: itemDbToDomain(item, viewerOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function updateItem(req: Request, res: Response, next: NextFunction) {
  try {
    const id = readItemId(req);
    const item = await itemService.updateItem(id, readItemInput(req));
    res.status(200).json({ item: itemDbToDomain(item, viewerOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function setItemVisibility(req: Request, res: Response, next: NextFunction) {
  try {
    const id = readItemId(req);
    const body: unknown = req.body;
    const hidden = typeof body === "object" && body !== null && "hidden" in body ? body.hidden : undefined;
    if (typeof hidden !== "boolean") throw new ValidationError("hidden must be true or false.");
    const item = await itemService.setItemVisibility(id, hidden);
    res.status(200).json({ item: itemDbToDomain(item, viewerOf(req)) });
  } catch (err) {
    next(err);
  }
}

async function deleteItem(req: Request, res: Response, next: NextFunction) {
  try {
    await itemService.deleteItem(readItemId(req));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export default {
  listItems,
  getItemById,
  getItemMembers,
  resolveItems,
  createItem,
  updateItem,
  setItemVisibility,
  deleteItem,
};
