import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useLocation } from "react-router-dom";
import type { User } from "src/api/types.js";
import { fakeSocket, resetFakeSockets } from "src/test/fakes/socket.js";
import { getSocket } from "src/services/SocketService/socket.js";
import { FakeHowl, resetFakeHowls } from "src/test/fakes/howler.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderWithProviders, testUser } from "src/test/render.js";
import { playlistModule } from "src/pages/SoundManager/services/AudioService/hooks/usePlaylistModule.js";
import { collectionKeys } from "src/pages/SoundManager/api/collections/useCollectionQueries.js";
import type { AudioCollection } from "src/pages/SoundManager/types/AudioItem.js";
import { AppRoutes } from "./router.js";

vi.mock("howler", async () => (await import("src/test/fakes/howler.js")).howlerModule);
vi.mock("src/services/SocketService/socket.js", async () => {
  const { socketModule } = await import("src/test/fakes/socket.js");
  return { ...socketModule, getSocket: vi.fn(socketModule.getSocket) };
});

// The other sections have their own suites; here they only show where the app landed.
const Landing = ({ name }: { name: string }) => <p>{`${name} section at ${useLocation().pathname}`}</p>;
vi.mock("src/pages/EncounterManager/components/EncounterManager.js", () => ({ EncounterManager: () => <p>Encounter prep mounted</p> }));
vi.mock("src/pages/Compendium/components/Compendium.js", () => ({ Compendium: () => <Landing name="Compendium" /> }));

const gm = testUser({ id: 1, username: "table-gm", isGm: true });
const player = testUser({ id: 2, username: "table-player", isGm: false });

let audioRequests: string[] = [];

// jsdom has no layout; the Sound Manager's resizable panels only need the observer to exist.
class NoLayoutResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoLayoutResizeObserver);
  audioRequests = [];
  server.use(
    http.all("/api/audio/*", ({ request }) => {
      audioRequests.push(new URL(request.url).pathname);
      return json([]);
    }),
    http.get("/api/campaigns", () => json({ campaigns: [] })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(getSocket).mockClear();
  resetFakeSockets();
  resetFakeHowls();
});

const session = (user: User, token: string) =>
  json({ user, session: { token, createdAt: user.createdAt, expiresAt: "2999-01-01T00:00:00.000Z" } });

const nav = () => screen.getByRole("navigation");

describe("GM audio workspace", () => {
  test.each(["/", "/sound-manager", "/campaigns", "/notes"])("a player opening %s lands on Compendium with the GM workspace unmounted", async route => {
    renderWithProviders(<AppRoutes />, { route, user: player });

    expect(await screen.findByText("Compendium section at /compendium")).toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: "Sound Manager" })).not.toBeInTheDocument();
    expect(within(nav()).getByRole("link", { name: "Compendium" })).toBeInTheDocument();
    expect(screen.queryByText("Encounter prep mounted")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes Coming Soon")).not.toBeInTheDocument();
    expect(within(nav()).getAllByRole("link").map(link => link.textContent)).toEqual(["Encounter", "Compendium"]);
    expect(audioRequests).toEqual([]);
    expect(getSocket).not.toHaveBeenCalledWith("/download");
    expect(FakeHowl.instances).toHaveLength(0);
  });

  test("GM music continues across navigation and logging out releases audio before the next player signs in", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<AppRoutes />, { route: "/sound-manager", user: gm });

    expect(await screen.findByRole("link", { name: "Sound Manager" })).toBeInTheDocument();
    await waitFor(() => expect(audioRequests.length).toBeGreaterThan(0));
    await waitFor(() => expect(queryClient.getQueryCache().findAll({ queryKey: collectionKeys.all }).length).toBeGreaterThan(0));
    const downloads = fakeSocket("/download");
    expect(downloads.listenerCount("audio:file_download_status")).toBe(1);

    // GM music keeps playing while another section is open.
    const playlist: AudioCollection = {
      id: 7, type: "collection", name: "Tavern", audioType: "playlist",
      items: [{ id: 9, type: "file", name: "Theme", path: "audio/music/tavern.mp3", audioType: "music", duration: 60 }],
    };
    queryClient.setQueryData(collectionKeys.collection("playlist", playlist.id), playlist);
    await playlistModule.playPlaylist(playlist.id);
    const howl = FakeHowl.instances[0];
    expect(howl.src).toEqual(["/audio/music/tavern.mp3"]);
    await user.click(within(nav()).getByRole("link", { name: "Compendium" }));
    expect(await screen.findByText("Compendium section at /compendium")).toBeInTheDocument();
    expect(howl.playing()).toBe(true);

    let finishLogout!: () => void;
    const pendingLogout = new Promise<void>(resolve => { finishLogout = resolve; });
    server.use(http.post("/api/auth/logout", async () => {
      await pendingLogout;
      return new HttpResponse(null, { status: 205 });
    }));
    await user.click(screen.getByRole("button", { name: /table-gm/ }));
    await user.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByLabelText("Username")).toBeInTheDocument();
    expect(howl.calls.map(({ method }) => method)).toEqual(expect.arrayContaining(["stop", "unload"]));
    expect(downloads.connected).toBe(false);
    expect(downloads.listenerCount("audio:file_download_status")).toBe(0);
    expect(queryClient.getQueryCache().findAll({ queryKey: collectionKeys.all })).toEqual([]);

    finishLogout();

    // A player signs in on the same tab.
    const requestsBefore = audioRequests.length;
    server.use(
      http.post("/api/auth/login", () => session(player, "player-token")),
      http.get("/api/auth/user-session", () => session(player, "player-token")),
    );
    await user.type(screen.getByLabelText("Username"), "table-player");
    await user.type(screen.getByLabelText("Password"), "secret{Enter}");

    expect(await screen.findByText(/Compendium section at \/compendium/)).toBeInTheDocument();
    expect(within(nav()).queryByRole("link", { name: "Sound Manager" })).not.toBeInTheDocument();
    expect(audioRequests).toHaveLength(requestsBefore);
    expect(queryClient.getQueryCache().findAll({ queryKey: collectionKeys.all })).toEqual([]);
  });

  test("only the active GM section is exposed to focus and assistive technology", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppRoutes />, { route: "/campaigns", user: gm });

    expect(await screen.findByRole("heading", { name: "Campaigns" })).toBeInTheDocument();
    const campaigns = document.getElementById("campaigns-page");
    const encounters = document.getElementById("encounter-manager-page");
    const compendium = document.getElementById("compendium-page");
    expect(campaigns).toHaveAttribute("aria-hidden", "false");
    expect(campaigns?.inert).toBe(false);
    expect(encounters).toHaveAttribute("aria-hidden", "true");
    expect(encounters?.inert).toBe(true);
    expect(compendium).toHaveAttribute("aria-hidden", "true");
    expect(compendium?.inert).toBe(true);

    await user.click(within(nav()).getByRole("link", { name: "Compendium" }));
    expect(await screen.findByText("Compendium section at /compendium")).toBeInTheDocument();
    await waitFor(() => {
      expect(campaigns).toHaveAttribute("aria-hidden", "true");
      expect(campaigns?.inert).toBe(true);
      expect(compendium).toHaveAttribute("aria-hidden", "false");
      expect(compendium?.inert).toBe(false);
    });
  });
});
