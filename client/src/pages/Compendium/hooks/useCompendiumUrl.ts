import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export type CompendiumSection = "spells" | "entities" | "items";

/**
 * An entity open in edit mode: an existing template (`?entity=<id>&edit=1`), or a new one that is
 * not saved yet (`?entity=new`), optionally duplicated from another template (`&from=<id>`).
 */
export type EntityEditLocation = { target: number | "new"; from: number | null };

type CompendiumLocation = { section: CompendiumSection; id: number | null; entityEdit?: EntityEditLocation };

type CompendiumState = {
  section: CompendiumSection;
  /** Each tab's last selection, kept while the other tab or another page is shown. */
  selection: Record<CompendiumSection, number | null>;
  /** The entity in edit mode, kept like a selection. A new entity keeps the previous selection for Cancel. */
  entityEdit: EntityEditLocation | null;
};

const SECTION_PARAM = "section";
const EDIT_PARAM = "edit";
const FROM_PARAM = "from";
const NEW_ENTITY = "new";
const ID_PARAMS: Record<CompendiumSection, string> = { spells: "spell", entities: "entity", items: "item" };
const OWNED_PARAMS = [SECTION_PARAM, ID_PARAMS.spells, ID_PARAMS.entities, ID_PARAMS.items, EDIT_PARAM, FROM_PARAM];
const SECTIONS: readonly string[] = ["spells", "entities", "items"];

const INITIAL_STATE: CompendiumState = {
  section: "spells",
  selection: { spells: null, entities: null, items: null },
  entityEdit: null,
};

const parseId = (value: string | null): number | null => {
  if (value === null || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
};

// What the URL asks for, or null when it names nothing (a bare /compendium): then remembered state applies.
// A valid entity ID (or "new") wins over a spell ID, and a spell ID over an item ID; an ID implies its section.
function readLocation(params: URLSearchParams): CompendiumLocation | null {
  if (params.get(ID_PARAMS.entities) === NEW_ENTITY) {
    return { section: "entities", id: null, entityEdit: { target: "new", from: parseId(params.get(FROM_PARAM)) } };
  }
  const entityId = parseId(params.get(ID_PARAMS.entities));
  if (entityId !== null) {
    const editing = params.get(EDIT_PARAM) === "1";
    return { section: "entities", id: entityId, ...(editing ? { entityEdit: { target: entityId, from: null } } : {}) };
  }
  const spellId = parseId(params.get(ID_PARAMS.spells));
  if (spellId !== null) return { section: "spells", id: spellId };
  const itemId = parseId(params.get(ID_PARAMS.items));
  if (itemId !== null) return { section: "items", id: itemId };
  const section = params.get(SECTION_PARAM);
  if (section !== null && SECTIONS.includes(section)) return { section: section as CompendiumSection, id: null };
  return null;
}

// One canonical form per location: ?spell=42, ?entity=17, ?entity=17&edit=1, ?entity=new(&from=17),
// ?item=5, or ?section=<tab> without a selection. Parameters the Compendium does not own are kept.
function writeLocation(params: URLSearchParams, location: CompendiumLocation): URLSearchParams {
  const next = new URLSearchParams(params);
  OWNED_PARAMS.forEach(name => next.delete(name));
  const edit = location.section === "entities" ? location.entityEdit : undefined;
  if (edit?.target === NEW_ENTITY) {
    next.set(ID_PARAMS.entities, NEW_ENTITY);
    if (edit.from !== null) next.set(FROM_PARAM, String(edit.from));
  } else if (location.id === null) {
    next.set(SECTION_PARAM, location.section);
  } else {
    next.set(ID_PARAMS[location.section], String(location.id));
    if (edit && edit.target === location.id) next.set(EDIT_PARAM, "1");
  }
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
  ...(state.entityEdit ? { entityEdit: state.entityEdit } : {}),
});

const adopt = (state: CompendiumState, location: CompendiumLocation): CompendiumState => {
  if (location.section !== "entities") {
    return { ...state, section: location.section, selection: { ...state.selection, [location.section]: location.id } };
  }
  // A new entity is not a selection: the previous one stays for when the draft closes.
  const id = location.entityEdit?.target === NEW_ENTITY ? state.selection.entities : location.id;
  return {
    section: "entities",
    selection: { ...state.selection, entities: id },
    entityEdit: location.entityEdit ?? null,
  };
};

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

  /** Moves to `next` as a new history entry, so Back returns to where this was. */
  const push = (next: CompendiumState) => {
    setState(next);
    if (isActive) setSearchParams(params => writeLocation(params, currentLocation(next)));
  };

  /** Switch tabs as a new history entry, so Back returns to the previous tab. */
  const showSection = (section: CompendiumSection) => {
    if (section === state.section) return;
    push({ ...state, section });
  };

  /**
   * Select in one tab (null clears). The URL follows only for the visible tab. Selecting another
   * entity leaves edit mode; the editor keeps an unsaved draft aside.
   */
  const select = (section: CompendiumSection, id: number | null) => {
    setState(previous => ({
      ...previous,
      selection: { ...previous.selection, [section]: id },
      entityEdit: section === "entities" && previous.entityEdit?.target !== id ? null : previous.entityEdit,
    }));
  };

  /** Open an entity in edit mode (or a new one) as a new history entry, so Back leaves it. */
  const editEntity = (edit: EntityEditLocation) => {
    push({
      ...state,
      section: "entities",
      selection: edit.target === NEW_ENTITY ? state.selection : { ...state.selection, entities: edit.target },
      entityEdit: edit,
    });
  };

  /**
   * Leave edit mode in place (the URL entry is replaced): after a save, with the saved template
   * selected, or after Cancel, with the selection as it was (`undefined`) or cleared (null).
   */
  const endEntityEdit = (selected?: number | null) => {
    setState(previous => ({
      ...previous,
      selection: selected === undefined ? previous.selection : { ...previous.selection, entities: selected },
      entityEdit: null,
    }));
  };

  return { section: state.section, selection: state.selection, entityEdit: state.entityEdit, showSection, select, editEntity, endEntityEdit };
}
