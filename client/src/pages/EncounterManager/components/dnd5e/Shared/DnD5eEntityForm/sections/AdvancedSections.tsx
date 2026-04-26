import React from "react";
import { DisclosureSection } from "src/components/FormControls/index.js";
import type { OpenSectionId } from "../DnD5eEntityForm.types.js";
import { SpellcastingRows } from "../rows/index.js";
import type { AdvancedSectionsProps } from "./AdvancedSections.types.js";
import { DefenseSection } from "./DefenseSection.js";
import { EntrySection } from "./EntrySection.js";
import { IdentitySection } from "./IdentitySection.js";
import { LegendarySection } from "./LegendarySection.js";
import { ProficiencySection } from "./ProficiencySection.js";

const SECTION_TITLES: Record<OpenSectionId, string> = {
  identity: "Identity",
  proficiencies: "Proficiencies",
  defenses: "Defenses",
  entries: "Traits And Actions",
  spellcasting: "Spellcasting",
  legendary: "Legendary",
};

export const AdvancedSections: React.FC<AdvancedSectionsProps> = (props) => {
  const { draft, openSections, sectionCounts, toggleSection } = props;

  return (
    <>
      <FormSection id="identity" {...props}>
        <IdentitySection {...props} />
      </FormSection>

      <FormSection id="proficiencies" {...props}>
        <ProficiencySection {...props} />
      </FormSection>

      <FormSection id="defenses" {...props}>
        <DefenseSection {...props} />
      </FormSection>

      <FormSection id="entries" {...props}>
        <EntrySection {...props} />
      </FormSection>

      <DisclosureSection
        id="spellcasting"
        title={SECTION_TITLES.spellcasting}
        count={sectionCounts.spellcasting}
        isOpen={openSections.spellcasting}
        onToggle={(id) => toggleSection(id as OpenSectionId)}
      >
        <SpellcastingRows
          rows={draft.spellcasting}
          abilityScores={draft.abilityScores}
          proficiencyBonus={props.proficiencyBonus}
          onAdd={props.addSpellcasting}
          onUpdate={props.updateSpellcasting}
          onRemove={props.removeSpellcasting}
          getError={(id) => props.getRowError("spellcasting", id)}
        />
      </DisclosureSection>

      <FormSection id="legendary" {...props}>
        <LegendarySection {...props} />
      </FormSection>
    </>
  );
};

const FormSection: React.FC<
  AdvancedSectionsProps & {
    id: OpenSectionId;
    children: React.ReactNode;
  }
> = ({ id, openSections, sectionCounts, toggleSection, children }) => (
  <DisclosureSection
    id={id}
    title={SECTION_TITLES[id]}
    count={sectionCounts[id]}
    isOpen={openSections[id]}
    onToggle={(nextId) => toggleSection(nextId as OpenSectionId)}
  >
    {children}
  </DisclosureSection>
);
