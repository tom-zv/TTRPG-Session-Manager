import { authenticatedJsonHeaders } from "src/api/requestHeaders.js";
import type { 
  EntityDetailsBySystem,
  EntitySummaryBySystem,
} from "shared/domain/encounters/coreEntity.js";
import type { SystemType } from "shared/domain/encounters/coreEncounter.js";

import type {
  CreateEntityRequest,
  EntityWriteIssue,
  UpdateEntityBody,
  UpdateEntityRequest,
} from "shared/domain/encounters/dnd5e/entityValidation.js";

interface EntityDetailsResponse<T = EntityDetailsBySystem<SystemType>> {
  entity: T;
}

interface EntityDetailsArrayResponse<T = EntityDetailsBySystem<SystemType>> {
  entities: T[];
}

interface EntitySummariesResponse<T = EntitySummaryBySystem<SystemType>> {
  entities: T[];
}

interface InsertEntityResponse {
  insertId: number;
  entity: EntityDetailsBySystem<SystemType>;
}

/** A create or update the server rejected (400), with the write contract's issues by field path. */
export class EntityWriteError extends Error {
  readonly issues: EntityWriteIssue[];

  constructor(message: string, issues: EntityWriteIssue[]) {
    super(message);
    this.name = "EntityWriteError";
    this.issues = issues;
  }
}

const isWriteIssue = (value: unknown): value is EntityWriteIssue =>
  typeof value === "object" && value !== null
  && typeof (value as Record<string, unknown>).path === "string"
  && typeof (value as Record<string, unknown>).message === "string";

/** The error a failed write throws: the issues when the server sent them, otherwise its message. */
async function writeFailure(response: Response, failure: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => ({}));
  const record = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const message = typeof record.message === "string" && record.message ? record.message : failure;
  const details = record.details;
  if (response.status === 400 && Array.isArray(details) && details.length > 0 && details.every(isWriteIssue)) {
    return new EntityWriteError(message, details);
  }
  return new Error(message);
}

export class EntityApi {
  /**
   * Get all entity details for a specific system
   */
  static async getAllEntities<T extends SystemType>(
    system: T
  ): Promise<EntityDetailsBySystem<T>[]> {
    const response = await fetch(`/api/${system}/entities`, {
      method: 'GET',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch entities' }));
      throw new Error(error.message || 'Failed to fetch entities');
    }

    const data: EntityDetailsArrayResponse = await response.json();
    return data.entities as EntityDetailsBySystem<T>[];
  }

  /**
   * Get entity summaries for a specific system (lightweight data for lists)
   */
  static async getEntitySummaries<T extends SystemType>(
    system: T, signal?: AbortSignal
  ): Promise<EntitySummaryBySystem<T>[]> {
    const response = await fetch(`/api/${system}/entities/summary`, {
      method: 'GET',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch entity summaries' }));
      throw new Error(error.message || 'Failed to fetch entity summaries');
    }

    const data: EntitySummariesResponse = await response.json();
    return data.entities as EntitySummaryBySystem<T>[];
  }

  /**
   * Get a specific entity by ID
   */
  static async getEntityById<T extends SystemType>(
    system: T,
    id: number, signal?: AbortSignal
  ): Promise<EntityDetailsBySystem<T>> {
    const response = await fetch(`/api/${system}/entities/${id}`, {
      method: 'GET',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to fetch entity' }));
      throw new Error(error.message || 'Failed to fetch entity');
    }

    const data: EntityDetailsResponse = await response.json();
    return data.entity as EntityDetailsBySystem<T>;
  }

  /**
   * Batch fetch entities by IDs (single HTTP request)
   */
  static async getEntityTemplatesByIds<T extends SystemType>(
    system: T,
    entityIds: number[], signal?: AbortSignal
  ): Promise<EntityDetailsBySystem<T>[]> {
    if (!entityIds || entityIds.length === 0) {
      return [];
    }

    const response = await fetch(`/api/${system}/entities/batch`, {
      method: 'POST',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
      signal,
      body: JSON.stringify({ entityIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to batch fetch entities' }));
      throw new Error(error.message || 'Failed to batch fetch entities');
    }

    const data: EntityDetailsArrayResponse = await response.json();
    return data.entities as EntityDetailsBySystem<T>[];
  }

  /**
   * Create a new entity
   */
  static async createEntity<T extends SystemType>(
    system: T,
    entityData: CreateEntityRequest
  ): Promise<{ insertId: number; entity: EntityDetailsBySystem<T> }> {
    const response = await fetch(`/api/${system}/entities`, {
      method: 'POST',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
      body: JSON.stringify({ data: entityData }),
    });

    if (!response.ok) throw await writeFailure(response, 'Failed to create entity');

    const data: InsertEntityResponse = await response.json();
    return {
      insertId: data.insertId,
      entity: data.entity as EntityDetailsBySystem<T>
    };
  }

  /**
   * Update an existing entity. An imported one is changed in place only with `overwriteImported`;
   * without it the server answers 409.
   * @returns The updated entity
   */
  static async updateEntity<T extends SystemType>(
    system: T,
    id: number,
    updateData: UpdateEntityRequest,
    options: { overwriteImported?: true } = {}
  ): Promise<EntityDetailsBySystem<T>> {
    const body: UpdateEntityBody = { data: updateData, ...options };
    const response = await fetch(`/api/${system}/entities/${id}`, {
      method: 'PUT',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) throw await writeFailure(response, 'Failed to update entity');

    const data: EntityDetailsResponse = await response.json();
    return data.entity as EntityDetailsBySystem<T>;
  }

  /**
   * Delete an entity by ID
   */
  static async deleteEntity<T extends SystemType>(
    system: T,
    id: number
  ): Promise<boolean> {
    const response = await fetch(`/api/${system}/entities/${id}`, {
      method: 'DELETE',
      headers: authenticatedJsonHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to delete entity' }));
      throw new Error(error.message || 'Failed to delete entity');
    }

    const data: {success: boolean} = await response.json();
    return data.success;
  }
}

export default EntityApi;
