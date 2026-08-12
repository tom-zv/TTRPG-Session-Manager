import React, { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMyCharacter, useMyCharacterSummaries } from "../../api/query/useMyCharacterQueries.js";
import { MY_CHARACTER_KEYS } from "../../api/query/myCharacterKeys.js";
import { INVENTORY_KEYS } from "../../api/query/inventoryKeys.js";
import type { ItemMutationScope } from "../../api/query/itemCache.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { useMountedViewerScope } from "../../hooks/useMountedViewerScope.js";
import { InventorySection } from "./InventorySection.js";
import { BrowserLayout, useBrowserDetail } from "../browser/BrowserLayout.js";
import { BrowserToolbar } from "../browser/BrowserToolbar.js";
import { EntityList } from "./EntityList.js";
import { EntitySheet } from "./EntitySheet.js";
import { sortEntities } from "./entityFilters.js";
import browserStyles from "../browser/Browser.module.css";

type MyCharactersBrowserProps = {
  /** The signed-in player; every query is scoped to them. */
  viewer: ItemViewer;
  isActive: boolean;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

/**
 * A player's read-only browser of the player characters assigned to them. Lists and sheets come only
 * from the assigned-PC endpoints; a direct link to anything else shows the unavailable state.
 */
export const MyCharactersBrowser: React.FC<MyCharactersBrowserProps> = ({ viewer, isActive, selectedId, onSelect }) => {
  const queryClient = useQueryClient();
  const { userId } = viewer;
  const scope = useMountedViewerScope(viewer);
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  if (isActive && !hasBeenActive) setHasBeenActive(true);

  const { data: characters, isLoading, error } = useMyCharacterSummaries(userId, { enabled: hasBeenActive });
  const [search, setSearch] = useState("");
  const detailState = useBrowserDetail({ selectedId });

  // Assignments and inventories change on the GM's side: each time the player comes back to
  // Entities, refresh the list and the open sheet, and reset their inventories. Inventory rows show
  // catalog items as the player may see them, and a GM can hide one without the inventory's revision
  // moving, so a return shows "Loading the inventory…" until a fresh answer arrives, never a link
  // the GM has since hidden. A layout effect, so the earlier list is never painted. The first
  // showing loads them anyway.
  const wasActive = useRef(isActive);
  useLayoutEffect(() => {
    if (isActive && !wasActive.current) {
      void queryClient.invalidateQueries({ queryKey: MY_CHARACTER_KEYS.user(userId) });
      void queryClient.resetQueries({ queryKey: INVENTORY_KEYS.viewer(viewer) });
    }
    wasActive.current = isActive;
  }, [isActive, queryClient, userId, viewer]);

  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const visibleCharacters = useMemo(
    () => sortEntities(
      (characters ?? []).filter(character => character.name.toLowerCase().includes(deferredSearch)),
      "name"
    ),
    [characters, deferredSearch]
  );
  const selectedSummary = characters?.find(character => character.templateId === selectedId);
  const total = characters?.length ?? 0;

  if (isLoading || !hasBeenActive) return <p className={browserStyles.status}>Loading your characters…</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;

  return (
    <BrowserLayout
      detailState={detailState}
      toolbar={
        <BrowserToolbar
          label="Filter my characters"
          search={{
            value: search,
            onChange: setSearch,
            placeholder: "Search my characters",
            label: "Search my characters by name",
          }}
          resultLabel={visibleCharacters.length === total
            ? `${total} characters`
            : `${visibleCharacters.length} of ${total} characters`}
          onClear={search.trim() !== "" ? () => setSearch("") : undefined}
        />
      }
      list={
        !characters || characters.length === 0 ? (
          <p className={browserStyles.status}>No characters are assigned to you yet.</p>
        ) : visibleCharacters.length === 0 ? (
          <p className={browserStyles.status}>No characters match.</p>
        ) : (
          <EntityList
            entities={visibleCharacters}
            label="My characters"
            selectedId={selectedId}
            onSelect={(id, via) => {
              onSelect(id);
              detailState.onRowSelected(id, via);
            }}
            onActivate={detailState.open}
          />
        )
      }
      detail={<MyCharacterDetail scope={scope} selectedId={selectedId} />}
      detailLabel="Character details"
      dialogTitle={selectedSummary?.name ?? "Character"}
      // A direct link to a character not in the list still opens, to show that it is unavailable.
      // Only while shown: following an inventory link to an item must not leave this dialog over Items.
      hasSelection={isActive && selectedId !== null}
    />
  );
};

const MyCharacterDetail: React.FC<{ scope: ItemMutationScope; selectedId: number | null }> = ({ scope, selectedId }) => {
  const { data: character, error, isLoading } = useMyCharacter(scope.viewer.userId, selectedId);

  if (selectedId === null) return <p className={browserStyles.status}>Select a character to see their sheet.</p>;
  if (isLoading) return <p className={browserStyles.status}>Loading the character…</p>;
  if (error) return <p className={`${browserStyles.status} ${browserStyles.statusError}`} role="alert">{error.message}</p>;
  // null: missing, not a PC, or not (or no longer) assigned to this player. The refreshed
  // response replaces any sheet cached before access was revoked.
  if (!character) return <p className={browserStyles.status}>This character is not available to you.</p>;
  return (
    <EntitySheet entity={character}>
      <InventorySection entityId={character.templateId} scope={scope} canEdit={false} />
    </EntitySheet>
  );
};
