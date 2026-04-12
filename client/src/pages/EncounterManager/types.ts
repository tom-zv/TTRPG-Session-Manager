/**
 * Payload helpers for API requests derived from domain entities.
 *
 * CreatePayload<T>
 * - Omits server-managed fields.
 *
 * UpdatePayload<T>
 * - A partial version of CreatePayload<T> for PATCH/PUT, allowing sparse updates.
 *
 */
export type CreatePayload<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdatePayload<T> = Partial<CreatePayload<T>>;