import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, type RenderHookOptions, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { http } from "msw";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "src/app/contexts/AuthContext.js";
import type { User } from "src/api/types.js";
import { json } from "./msw/handlers.js";
import { server } from "./msw/server.js";
import { initQueryClient } from "src/pages/SoundManager/services/AudioService/queryClient.js";

export interface ProviderOptions {
  /** Initial location for the MemoryRouter, for example `/compendium`. */
  route?: string;
  /** Stores a session token so API modules send `Authorization`. */
  sessionToken?: string;
  /**
   * Signs this user in: wraps the tree in the real `AuthProvider` and answers
   * `GET /api/auth/user-session` with them. Implies a session token. `useAuth()` is loading until
   * that request resolves, so wait for UI that depends on the user.
   */
  user?: User;
}

export const testUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  username: "gm",
  isGm: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastLogin: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

/** A client with the app's caching rules (`staleTime: Infinity`) and no retries. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper({ route = "/", sessionToken, user }: ProviderOptions) {
  const token = sessionToken ?? (user ? "test-session-token" : undefined);
  if (token) localStorage.setItem("sessionToken", token);
  if (user) {
    server.use(
      http.get("/api/auth/user-session", () =>
        json({ user, session: { token: token ?? "", createdAt: user.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" } })
      )
    );
  }
  const queryClient = createTestQueryClient();
  // The audio service reads the cache through a module-level client; point it at this one.
  initQueryClient(queryClient);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{user ? <AuthProvider>{children}</AuthProvider> : children}</MemoryRouter>
    </QueryClientProvider>
  );
  return { queryClient, Wrapper };
}

export function renderWithProviders(ui: ReactElement, options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {}) {
  const { route, sessionToken, user, ...renderOptions } = options;
  const { queryClient, Wrapper } = makeWrapper({ route, sessionToken, user });
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  options: ProviderOptions & Omit<RenderHookOptions<Props>, "wrapper"> = {}
) {
  const { route, sessionToken, user, ...hookOptions } = options;
  const { queryClient, Wrapper } = makeWrapper({ route, sessionToken, user });
  return { queryClient, ...renderHook(hook, { wrapper: Wrapper, ...hookOptions }) };
}
