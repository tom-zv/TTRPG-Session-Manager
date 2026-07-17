import React, { useState } from "react";
import { useLocation } from "react-router-dom";
import { SegmentedTabs, type SegmentedTabOption } from "src/components/FormControls/index.js";
import { SpellBrowser } from "./spells/SpellBrowser.js";
import styles from "./Compendium.module.css";

type CompendiumSection = "spells";

const SECTIONS: Array<SegmentedTabOption<CompendiumSection>> = [
  { value: "spells", label: "Spells", panelId: "compendium-spells-panel" },
];

export const COMPENDIUM_PATH = "/compendium";

// Reference data (spells for now). The page stays mounted like the others; sections load when first shown.
export const Compendium: React.FC = () => {
  const isActive = useLocation().pathname === COMPENDIUM_PATH;
  const [section, setSection] = useState<CompendiumSection>("spells");

  return (
    <div className={styles.compendium}>
      <header className={styles.header}>
        <h1>Compendium</h1>
        <SegmentedTabs label="Compendium sections" value={section} options={SECTIONS} onChange={setSection} />
      </header>
      <section id="compendium-spells-panel" role="tabpanel" className={styles.panel} hidden={section !== "spells"}>
        <SpellBrowser isActive={isActive && section === "spells"} />
      </section>
    </div>
  );
};
