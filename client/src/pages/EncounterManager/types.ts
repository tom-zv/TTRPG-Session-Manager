/**
 * Payload helpers for API requests derived from domain entities.
 *
 * CreatePayload<T>
 * - Omits server-managed fields. An encounter's campaign is sent beside the payload, never in it.
 *
 * UpdatePayload<T>
 * - A partial version of CreatePayload<T> for PATCH/PUT, allowing sparse updates.
 *
 */
export type CreatePayload<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'campaignId'>;
export type UpdatePayload<T> = Partial<CreatePayload<T>>;