import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { GiDragonHead, GiSpellBook, GiSwapBag } from "react-icons/gi";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import { MY_CHARACTER_KEYS } from "../api/query/myCharacterKeys.js";
import { INVENTORY_KEYS } from "../api/query/inventoryKeys.js";
import { forgetOtherViewers } from "../api/query/itemCache.js";
import { ITEM_KEYS, type ItemViewer } from "../api/query/itemKeys.js";
import { useCompendiumUrl, type CompendiumSection } from "../hooks/useCompendiumUrl.js";
import { BrowserDetailSlot, NARROW_BROWSER_QUERY } from "./browser/BrowserLayout.js";
import { CompendiumModeSwitch, type CompendiumMode } from "./CompendiumModeSwitch.js";
import { EntityBrowser } from "./entities/EntityBrowser.js";
import { ItemBrowser } from "./items/ItemBrowser.js";
import { ItemReferenceVisit } from "./items/ItemLink.js";
import { MyCharactersBrowser } from "./entities/MyCharactersBrowser.js";
import { SpellBrowser } from "./spells/SpellBrowser.js";
import styles from "./Compendium.module.css";
import browserStyles from "./browser/Browser.module.css";

const MODES: readonly CompendiumMode[] = [
  { value: "spells", label: "Spells", hint: "Spell list and homebrew", icon: GiSpellBook, panelId: "compendium-spells-panel" },
  { value: "entities", label: "Entities", hint: "Characters, NPCs and creatures", icon: GiDragonHead, panelId: "compendium-entities-panel" },
  { value: "items", label: "Items", hint: "Equipment, magic items and homebrew", icon: GiSwapBag, panelId: "compendium-items-panel" },
];

export const COMPENDIUM_PATH = "/compendium";

// Reference data. The page stays mounted like the others, and so do all tabs, so each keeps its
// filters and selection; sections load when first shown. Section and selection live in the URL
// (see useCompendiumUrl), which only this component reads and writes.
//
// Layout: finding things happens in the left column (mode switch, filters, list); reading takes the
// whole right side. Each browser renders its details into its section's reader through a portal
// (BrowserDetailSlot). On narrow screens there is only the column, and details open in a dialog.
export const Compendium: React.FC = () => {
  const isActive = useLocation().pathname === COMPENDIUM_PATH;
  const { section, selection, showSection, select } = useCompendiumUrl(isActive);
  const { currentUser, isLoading: authLoading } = useAuth();
  const viewer = useMemo<ItemViewer | null>(
    () => (currentUser ? { userId: currentUser.id, isGm: currentUser.isGm } : null),
    [currentUser]
  );
  useViewerScope(viewer, () => {
    select("entities", null);
    select("items", null);
  });
  const entitiesActive = isActive && section === "entities";
  const visits = useSectionVisits(isActive ? section : null, viewer !== null && !viewer.isGm);
  const isNarrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const [spellsReader, setSpellsReader] = useState<HTMLDivElement | null>(null);
  const [entitiesReader, setEntitiesReader] = useState<HTMLDivElement | null>(null);
  const [itemsReader, setItemsReader] = useState<HTMLDivElement | null>(null);

  return (
    <div className={styles.compendium}>
      {/* The same Group in both layouts, so the column (and every browser's state) never remounts. */}
      <Group orientation="horizontal" className={styles.panels}>
        <Panel id="compendium-finder" defaultSize="36%" minSize="22%" maxSize={isNarrow ? "100%" : "55%"} className={styles.finderPanel}>
          <div className={styles.finder}>
            <h1 className={styles.visuallyHidden}>Compendium</h1>
            <CompendiumModeSwitch modes={MODES} value={section} onChange={showSection} />
            <section
              id="compendium-spells-panel"
              role="tabpanel"
              aria-labelledby="compendium-spells-panel-label"
              className={styles.panel}
              hidden={section !== "spells"}
            >
              <BrowserDetailSlot.Provider value={isNarrow ? null : spellsReader}>
                <ItemReferenceVisit.Provider value={visits.spells}>
                  <SpellBrowser
                    isActive={isActive && section === "spells"}
                    selectedId={selection.spells}
                    onSelect={id => select("spells", id)}
                  />
                </ItemReferenceVisit.Provider>
              </BrowserDetailSlot.Provider>
            </section>
            <section
              id="compendium-entities-panel"
              role="tabpanel"
              aria-labelledby="compendium-entities-panel-label"
              className={styles.panel}
              hidden={section !== "entities"}
            >
              {/* Wait for the user: GMs browse every template, players only their assigned characters.
                  Keyed by viewer (account and role) so a switch starts fresh. */}
              <BrowserDetailSlot.Provider value={isNarrow ? null : entitiesReader}>
                <ItemReferenceVisit.Provider value={visits.entities}>
                  {authLoading || !viewer ? (
                    <p className={browserStyles.status}>Loading…</p>
                  ) : viewer.isGm ? (
                    <EntityBrowser
                      key={ITEM_KEYS.viewerSegment(viewer)}
                      viewer={viewer}
                      isActive={entitiesActive}
                      selectedId={selection.entities}
                      onSelect={id => select("entities", id)}
                    />
                  ) : (
                    <MyCharactersBrowser
                      key={ITEM_KEYS.viewerSegment(viewer)}
                      viewer={viewer}
                      isActive={entitiesActive}
                      selectedId={selection.entities}
                      onSelect={id => select("entities", id)}
                    />
                  )}
                </ItemReferenceVisit.Provider>
              </BrowserDetailSlot.Provider>
            </section>
            <section
              id="compendium-items-panel"
              role="tabpanel"
              aria-labelledby="compendium-items-panel-label"
              className={styles.panel}
              hidden={section !== "items"}
            >
              {/* Players see only visible items, GMs every item: wait for the user, and start fresh per viewer. */}
              <BrowserDetailSlot.Provider value={isNarrow ? null : itemsReader}>
                <ItemReferenceVisit.Provider value={visits.items}>
                  {authLoading || !viewer ? (
                    <p className={browserStyles.status}>Loading…</p>
                  ) : (
                    <ItemBrowser
                      key={ITEM_KEYS.viewerSegment(viewer)}
                      viewer={viewer}
                      isActive={isActive && section === "items"}
                      selectedId={selection.items}
                      onSelect={id => select("items", id)}
                    />
                  )}
                </ItemReferenceVisit.Provider>
              </BrowserDetailSlot.Provider>
            </section>
          </div>
        </Panel>
        {!isNarrow && (
          <>
            <Separator className={styles.resizeHandle} />
            <Panel id="compendium-reader" defaultSize="64%" minSize="40%" className={styles.readerPanel}>
              <div ref={setSpellsReader} className={styles.reader} hidden={section !== "spells"} />
              <div ref={setEntitiesReader} className={styles.reader} hidden={section !== "entities"} />
              <div ref={setItemsReader} className={styles.reader} hidden={section !== "items"} />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
};

/**
 * How many times a player has come back to each tab (or to the page on it). The count changes in
 * the render that shows the tab again, so its item links and previews ask again before anything is
 * painted (see ItemReferenceVisit). A GM's counts stay 0: their documents keep their answers, and
 * the GM's own catalog changes refresh them.
 */
function useSectionVisits(shown: CompendiumSection | null, counts: boolean): Readonly<Record<CompendiumSection, number>> {
  const [visits, setVisits] = useState<Readonly<Record<CompendiumSection, number>>>({ spells: 0, entities: 0, items: 0 });
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) {
    setLastShown(shown);
    if (shown !== null && counts) setVisits(current => ({ ...current, [shown]: current[shown] + 1 }));
  }
  return visits;
}

/**
 * When a different account signs in while the page stays mounted, or the account's role changes:
 * clear the entity and item selections (they belonged to the previous viewer) and drop other
 * accounts' cached character sheets and other viewers' inventories and item entries.
 * Signing in for the first time keeps a selection that came from the URL.
 */
function useViewerScope(viewer: ItemViewer | null, clearSelection: () => void) {
  const queryClient = useQueryClient();
  const scope = viewer ? ITEM_KEYS.viewerSegment(viewer) : null;
  const [seenScope, setSeenScope] = useState(scope);
  if (scope !== null && scope !== seenScope) {
    setSeenScope(scope);
    if (seenScope !== null) clearSelection();
  }

  const userId = viewer?.userId ?? null;
  const isGm = viewer?.isGm ?? false;
  useEffect(() => {
    if (userId === null) return;
    queryClient.removeQueries({
      queryKey: MY_CHARACTER_KEYS.all,
      predicate: query => query.queryKey[MY_CHARACTER_KEYS.all.length] !== userId,
    });
    // Inventories are role-specific even on one account: a GM's copy names hidden items.
    const segment = ITEM_KEYS.viewerSegment({ userId, isGm });
    queryClient.removeQueries({
      queryKey: INVENTORY_KEYS.all,
      predicate: query => query.queryKey[INVENTORY_KEYS.all.length] !== segment,
    });
    forgetOtherViewers(queryClient, { userId, isGm });
  }, [queryClient, userId, isGm]);
}
