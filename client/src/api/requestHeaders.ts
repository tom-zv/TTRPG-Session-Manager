export function authenticatedJsonHeaders(): Record<string, string> {
  const token = localStorage.getItem("sessionToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
