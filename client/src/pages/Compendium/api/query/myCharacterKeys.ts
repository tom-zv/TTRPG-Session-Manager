// Assigned-PC queries are scoped to the signed-in user, so one account never reads another's cache.
export const MY_CHARACTER_KEYS = {
  all: ["compendium", "dnd5e", "myCharacters"] as const,
  user: (userId: number) => [...MY_CHARACTER_KEYS.all, userId] as const,
  list: (userId: number) => [...MY_CHARACTER_KEYS.user(userId), "list"] as const,
  detail: (userId: number, id: number) => [...MY_CHARACTER_KEYS.user(userId), "detail", id] as const,
};
