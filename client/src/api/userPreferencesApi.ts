import type { UserPreferences } from "shared/domain/users/preferences.js";
import { authenticatedJsonHeaders } from "./requestHeaders.js";

export async function getUserPreferences(): Promise<UserPreferences> {
  return preferencesRequest("GET");
}

export async function patchUserPreferences(patch: Pick<UserPreferences, "encounterDefaults">): Promise<UserPreferences> {
  return preferencesRequest("PATCH", patch);
}

async function preferencesRequest(method: string, patch?: Pick<UserPreferences, "encounterDefaults">): Promise<UserPreferences> {
  const response = await fetch("/api/users/me/preferences", {
    method,
    headers: authenticatedJsonHeaders(),
    credentials: "include",
    body: patch ? JSON.stringify(patch) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to save preferences");
  return data.preferences;
}
