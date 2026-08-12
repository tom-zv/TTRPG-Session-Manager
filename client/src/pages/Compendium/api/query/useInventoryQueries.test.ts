import { act, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, test } from "vitest";
import type { DnD5eInventory, DnD5eInventoryAppend, DnD5eInventoryReplacement } from "shared/domain/encounters/dnd5e/inventory.js";
import { json } from "src/test/msw/handlers.js";
import { server } from "src/test/msw/server.js";
import { renderHookWithProviders } from "src/test/render.js";
import { INVENTORY_KEYS } from "./inventoryKeys.js";
import { useAppendInventoryItem, useInventory, useSaveInventory } from "./useInventoryQueries.js";

// 13-F013: answers for one inventory arrive out of order. The cache keeps the highest revision it
// has seen, and at an equal revision the later answer (with its fresher catalog view).

const ENTITY = 11;
const viewer = { userId: 1, isGm: true };
const scope = { viewer, isCurrent: () => true };
const key = INVENTORY_KEYS.detail(viewer, ENTITY);

const deferred = () => {
  let release = () => {};
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};

type Hold = { before?: Promise<void>; after?: Promise<void> };

/**
 * The inventory endpoints over one stored list. Each request may take a hold: `before` delays it
 * before it reads or writes (a request waiting on the entity lock), `after` delays its answer.
 */
function serveInventory(initial: DnD5eInventory) {
  const state = { ...initial };
  const fake = { gets: [] as Hold[], posts: [] as Hold[], puts: [] as Hold[], requests: 0 };
  const lantern = { name: "Whispering Lantern", source: "HB" };
  server.use(
    http.get("/api/dnd5e/entities/:id/inventory", async () => {
      fake.requests += 1;
      const hold = fake.gets.shift() ?? {};
      await hold.before;
      const answer = structuredClone(state);
      await hold.after;
      return json(answer);
    }),
    http.post("/api/dnd5e/entities/:id/inventory/items", async ({ request }) => {
      fake.requests += 1;
      const hold = fake.posts.shift() ?? {};
      const { itemId, quantity } = (await request.json()) as DnD5eInventoryAppend;
      await hold.before;
      state.items = [...state.items, { name: lantern.name, quantity, itemId, item: lantern }];
      state.revision += 1;
      const answer = structuredClone(state);
      await hold.after;
      return json(answer, 201);
    }),
    http.put("/api/dnd5e/entities/:id/inventory", async ({ request }) => {
      fake.requests += 1;
      const hold = fake.puts.shift() ?? {};
      const { items, expectedRevision } = (await request.json()) as DnD5eInventoryReplacement;
      await hold.before;
      if (expectedRevision !== undefined && expectedRevision !== state.revision) {
        const conflict = { message: "The inventory changed since it was loaded.", ...structuredClone(state) };
        await hold.after;
        return json(conflict, 409);
      }
      state.items = items;
      state.revision += 1;
      const answer = structuredClone(state);
      await hold.after;
      return json(answer);
    })
  );
  return { fake, state };
}

const renderInventoryHooks = () => renderHookWithProviders(() => ({
  inventory: useInventory(viewer, ENTITY),
  save: useSaveInventory(scope, ENTITY),
  give: useAppendInventoryItem(scope),
}));

const give = { entityId: ENTITY, append: { itemId: 6, quantity: 1 } };

describe("inventory answers out of order (13-F013)", () => {
  test("a read that started during a give and answers after it does not roll the cache back", async () => {
    const { fake } = serveInventory({ items: [], revision: 0 });
    const { result, queryClient } = renderInventoryHooks();
    await waitFor(() => expect(result.current.inventory.data).toEqual({ items: [], revision: 0 }));

    // The give waits on the lock; a read meanwhile sees revision 0 and is slow to answer.
    const commit = deferred();
    const readAnswer = deferred();
    fake.posts.push({ before: commit.promise });
    fake.gets.push({ after: readAnswer.promise });
    act(() => result.current.give.mutate(give));
    await waitFor(() => expect(fake.requests).toBe(2));
    act(() => void result.current.inventory.refetch());
    await waitFor(() => expect(fake.requests).toBe(3));

    commit.release();
    await waitFor(() => expect(queryClient.getQueryData<DnD5eInventory>(key)?.revision).toBe(1));
    readAnswer.release();
    await waitFor(() => expect(result.current.inventory.isFetching).toBe(false));

    expect(result.current.inventory.data).toEqual({
      items: [{ name: "Whispering Lantern", quantity: 1, itemId: 6, item: { name: "Whispering Lantern", source: "HB" } }],
      revision: 1,
    });
  });

  test("an earlier write that answers last does not replace a later one", async () => {
    const { fake } = serveInventory({ items: [], revision: 0 });
    const { result, queryClient } = renderInventoryHooks();
    await waitFor(() => expect(result.current.inventory.isSuccess).toBe(true));

    const firstAnswer = deferred();
    fake.posts.push({ after: firstAnswer.promise });
    act(() => result.current.give.mutate(give));
    await waitFor(() => expect(fake.requests).toBe(2));
    act(() => result.current.give.mutate({ ...give, append: { itemId: 6, quantity: 2 } }));
    await waitFor(() => expect(queryClient.getQueryData<DnD5eInventory>(key)?.revision).toBe(2));

    firstAnswer.release();
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(queryClient.getQueryData<DnD5eInventory>(key)?.items.map(row => row.quantity)).toEqual([1, 2]);
    expect(queryClient.getQueryData<DnD5eInventory>(key)?.revision).toBe(2);
  });

  test("a stale save's conflict that answers after a newer give keeps the newer list", async () => {
    const { fake } = serveInventory({ items: [{ name: "Rope", quantity: 1 }], revision: 1 });
    const { result, queryClient } = renderInventoryHooks();
    await waitFor(() => expect(result.current.inventory.isSuccess).toBe(true));

    const conflictAnswer = deferred();
    fake.puts.push({ after: conflictAnswer.promise });
    act(() => result.current.save.mutate({ items: [], expectedRevision: 0 }));
    await waitFor(() => expect(fake.requests).toBe(2));
    act(() => result.current.give.mutate(give));
    await waitFor(() => expect(queryClient.getQueryData<DnD5eInventory>(key)?.revision).toBe(2));

    conflictAnswer.release();
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    expect(queryClient.getQueryData<DnD5eInventory>(key)?.items.map(row => row.name)).toEqual(["Rope", "Whispering Lantern"]);
  });

  test("a fresh read at the same revision replaces the catalog view, as after a hide or rename", async () => {
    const { state } = serveInventory({
      items: [{ name: "Lamp", quantity: 1, itemId: 6, item: { name: "Whispering Lantern", source: "HB" } }],
      revision: 3,
    });
    const { result, queryClient } = renderInventoryHooks();
    await waitFor(() => expect(result.current.inventory.data?.items[0].item?.name).toBe("Whispering Lantern"));

    state.items = [{ name: "Lamp", quantity: 1, itemId: 6, item: { name: "Lantern of Echoes", source: "HB", hidden: true } }];
    await act(() => queryClient.invalidateQueries({ queryKey: key }));

    await waitFor(() => expect(result.current.inventory.data?.items[0].item).toEqual({ name: "Lantern of Echoes", source: "HB", hidden: true }));
    expect(result.current.inventory.data?.revision).toBe(3);
  });
});
