import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Group, Panel, Separator } from "react-resizable-panels";
import { GiDragonHead, GiSpellBook } from "react-icons/gi";
import { useAuth } from "src/app/contexts/AuthContext.js";
import { useMediaQuery } from "src/hooks/useMediaQuery.js";
import { MY_CHARACTER_KEYS } from "../api/query/myCharacterKeys.js";
import { useCompendiumUrl } from "../hooks/useCompendiumUrl.js";
import { BrowserDetailSlot, NARROW_BROWSER_QUERY } from "./browser/BrowserLayout.js";
import { CompendiumModeSwitch, type CompendiumMode } from "./CompendiumModeSwitch.js";
import { EntityBrowser } from "./entities/EntityBrowser.js";
import { MyCharactersBrowser } from "./entities/MyCharactersBrowser.js";
import { SpellBrowser } from "./spells/SpellBrowser.js";
import styles from "./Compendium.module.css";
import browserStyles from "./browser/Browser.module.css";

const MODES: readonly CompendiumMode[] = [
  { value: "spells", label: "Spells", hint: "Spell list and homebrew", icon: GiSpellBook, panelId: "compendium-spells-panel" },
  { value: "entities", label: "Entities", hint: "Characters, NPCs and creatures", icon: GiDragonHead, panelId: "compendium-entities-panel" },
];

export const COMPENDIUM_PATH = "/compendium";

// Reference data. The page stays mounted like the others, and so do both tabs, so each keeps its
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
  const userId = currentUser?.id ?? null;
  useViewerScope(userId, () => select("entities", null));
  const entitiesActive = isActive && section === "entities";
  const isNarrow = useMediaQuery(NARROW_BROWSER_QUERY);
  const [spellsReader, setSpellsReader] = useState<HTMLDivElement | null>(null);
  const [entitiesReader, setEntitiesReader] = useState<HTMLDivElement | null>(null);

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
                <SpellBrowser
                  isActive={isActive && section === "spells"}
                  selectedId={selection.spells}
                  onSelect={id => select("spells", id)}
                />
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
                  Keyed by user so an account switch starts with fresh filters. */}
              <BrowserDetailSlot.Provider value={isNarrow ? null : entitiesReader}>
                {authLoading || !currentUser ? (
                  <p className={browserStyles.status}>Loading…</p>
                ) : currentUser.isGm ? (
                  <EntityBrowser
                    key={currentUser.id}
                    isActive={entitiesActive}
                    selectedId={selection.entities}
                    onSelect={id => select("entities", id)}
                  />
                ) : (
                  <MyCharactersBrowser
                    key={currentUser.id}
                    userId={currentUser.id}
                    isActive={entitiesActive}
                    selectedId={selection.entities}
                    onSelect={id => select("entities", id)}
                  />
                )}
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
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
};

/**
 * When a different account signs in while the page stays mounted: clear the entity selection
 * (it belonged to the previous viewer) and drop other accounts' cached character sheets.
 * Signing in for the first time keeps a selection that came from the URL.
 */
function useViewerScope(userId: number | null, clearSelection: () => void) {
  const queryClient = useQueryClient();
  const [viewerId, setViewerId] = useState(userId);
  if (userId !== null && userId !== viewerId) {
    setViewerId(userId);
    if (viewerId !== null) clearSelection();
  }

  useEffect(() => {
    if (userId === null) return;
    queryClient.removeQueries({
      queryKey: MY_CHARACTER_KEYS.all,
      predicate: query => query.queryKey[MY_CHARACTER_KEYS.all.length] !== userId,
    });
  }, [queryClient, userId]);
}
