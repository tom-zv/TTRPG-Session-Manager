import {
  getSectionTitle,
  SECTION_ORDER,
  type EntityCardSection,
} from "src/pages/EncounterManager/components/dnd5e/Shared/DnD5eEntityCard/DnD5eEntityCard.utils.js";

export interface AddableEntitySection {
  key: string;
  label: string;
  list: "traits" | "actions" | "spellcasting";
}

export const getAddableSections = (sections: readonly Pick<EntityCardSection, "key">[]): AddableEntitySection[] => {
  const present = new Set(sections.map(({ key }) => key));
  const options = SECTION_ORDER
    .filter(key => key === "spellcasting" || !present.has(key))
    .map((key): AddableEntitySection => ({
      key,
      label: getSectionTitle(key),
      list: key === "trait" ? "traits" : key === "spellcasting" ? "spellcasting" : "actions",
    }));
  return [...options, { key: "custom", label: "Custom…", list: "actions" }];
};
