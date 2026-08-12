import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export type CompendiumSection = "spells" | "entities" | "items";

type CompendiumLocation = { section: CompendiumSection; id: number | null };

type CompendiumState = {
  section: CompendiumSection;
  /** Each tab's last selection, kept while the other tab or another page is shown. */
  selection: Record<CompendiumSection, number | null>;
};

const SECTION_PARAM = "section";
const ID_PARAMS: Record<CompendiumSection, string> = { spells: "spell", entities: "entity", items: "item" };
const OWNED_PARAMS = [SECTION_PARAM, ID_PARAMS.spells, ID_PARAMS.entities, ID_PARAMS.items];
const SECTIONS: readonly string[] = ["spells", "entities", "items"];

const INITIAL_STATE: CompendiumState = { section: "spells", selection: { spells: null, entities: null, items: null } };

const parseId = (value: string | null): number | null => {
  if (value === null || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

// What the URL asks for, or null when it names nothing (a bare /compendium): then remembered state applies.
// A valid entity ID wins over a spell ID, and a spell ID over an item ID; an ID implies its section.
function readLocation(params: URLSearchParams): CompendiumLocation | null {
  const entityId = parseId(params.get(ID_PARAMS.entities));
  if (entityId !== null) return { section: "entities", id: entityId };
  const spellId = parseId(params.get(ID_PARAMS.spells));
  if (spellId !== null) return { section: "spells", id: spellId };
  const itemId = parseId(params.get(ID_PARAMS.items));
  if (itemId !== null) return { section: "items", id: itemId };
  const section = params.get(SECTION_PARAM);
  if (section !== null && SECTIONS.includes(section)) return { section: section as CompendiumSection, id: null };
  return null;
}

// One canonical form per location: ?spell=42, ?entity=17, ?item=5, or ?section=<tab> without a selection.
// Parameters the Compendium does not own are kept.
function writeLocation(params: URLSearchParams, location: CompendiumLocation): URLSearchParams {
  const next = new URLSearchParams(params);
  OWNED_PARAMS.forEach(name => next.delete(name));
  if (location.id === null) next.set(SECTION_PARAM, location.section);
  else next.set(ID_PARAMS[location.section], String(location.id));
  return next;
}

/**
 * The search string of a link to a Compendium selection, e.g. from an inventory row to its item.
 * Following it switches tab and selection as a new history entry; unrelated parameters stay.
 */
export function compendiumLinkSearch(params: URLSearchParams, section: CompendiumSection, id: number): string {
  return `?${writeLocation(params, { section, id }).toString()}`;
}

const ownedParamsKey = (params: URLSearchParams) =>
  JSON.stringify(OWNED_PARAMS.map(name => params.getAll(name)));

const currentLocation = (state: CompendiumState): CompendiumLocation => ({
  section: state.section,
  id: state.selection[state.section],
});

const adopt = (state: CompendiumState, location: CompendiumLocation): CompendiumState => ({
  section: location.section,
  selection: { ...state.selection, [location.section]: location.id },
});

/**
 * The Compendium's section and selections, mirrored in the URL. Only this hook reads or writes the
 * Compendium's parameters, and only while the page is shown: a hidden page or tab never touches the URL.
 * Links and Back/Forward take precedence over remembered state; a bare /compendium restores it.
 */
export function useCompendiumUrl(isActive: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlKey = isActive ? ownedParamsKey(searchParams) : null;
  const [state, setState] = useState<CompendiumState>(() => {
    const location = isActive ? readLocation(searchParams) : null;
    return location ? adopt(INITIAL_STATE, location) : INITIAL_STATE;
  });
  // The URL last adopted. Adopt only when the URL changes, never by comparing it with state: a
  // selection updates state at once, and the effect below writes it to the URL afterwards.
  const [seenKey, setSeenKey] = useState<string | null>(urlKey);

  if (urlKey !== null && urlKey !== seenKey) {
    setSeenKey(urlKey);
    const location = readLocation(searchParams);
    if (location) setState(previous => adopt(previous, location));
  }

  useEffect(() => {
    if (!isActive) return;
    const canonical = writeLocation(searchParams, currentLocation(state));
    if (ownedParamsKey(canonical) !== ownedParamsKey(searchParams)) {
      setSearchParams(canonical, { replace: true });
    }
  }, [isActive, searchParams, setSearchParams, state]);

  /** Switch tabs as a new history entry, so Back returns to the previous tab. */
  const showSection = (section: CompendiumSection) => {
    if (section === state.section) return;
    const next: CompendiumState = { ...state, section };
    setState(next);
    if (isActive) setSearchParams(params => writeLocation(params, currentLocation(next)));
  };

  /** Select in one tab (null clears). The URL follows only for the visible tab. */
  const select = (section: CompendiumSection, id: number | null) => {
    setState(previous => ({ ...previous, selection: { ...previous.selection, [section]: id } }));
  };

  return { section: state.section, selection: state.selection, showSection, select };
}
