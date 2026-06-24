import type { UserSummaryDTO } from "shared/DTO/users/types.js";
import { authenticatedJsonHeaders } from "./requestHeaders.js";

/** All users, for GM pickers. GM only. */
export async function getUsers(): Promise<UserSummaryDTO[]> {
  const response = await fetch("/api/users", {
    method: "GET",
    headers: authenticatedJsonHeaders(),
    credentials: "include",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Failed to load users");
  return data.users;
}
