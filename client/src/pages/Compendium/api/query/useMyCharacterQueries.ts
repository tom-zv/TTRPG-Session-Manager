import { useQuery } from "@tanstack/react-query";
import { MyCharacterApi } from "../myCharacterApi.js";
import { MY_CHARACTER_KEYS } from "./myCharacterKeys.js";

// Refreshed on demand (when the player reopens Entities), like the rest of the app's queries.

export function useMyCharacterSummaries(userId: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: MY_CHARACTER_KEYS.list(userId),
    queryFn: ({ signal }) => MyCharacterApi.getSummaries(signal),
    staleTime: Infinity,
    enabled: options.enabled ?? true,
  });
}

/** null data means the character is unavailable: missing, not a PC, or not assigned to this user. */
export function useMyCharacter(userId: number, id: number | null) {
  return useQuery({
    queryKey: MY_CHARACTER_KEYS.detail(userId, id ?? 0),
    queryFn: ({ signal }) => MyCharacterApi.getCharacter(id ?? 0, signal),
    staleTime: Infinity,
    enabled: id !== null,
  });
}
