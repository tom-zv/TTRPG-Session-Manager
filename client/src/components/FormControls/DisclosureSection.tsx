import React from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import styles from "./FormControls.module.css";

type DisclosureSectionProps = {
  id: string;
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
};

export const DisclosureSection: React.FC<DisclosureSectionProps> = ({
  id,
  title,
  count,
  isOpen,
  onToggle,
  children,
}) => (
  <section className={styles.disclosureSection}>
    <button
      type="button"
      className={styles.disclosureToggle}
      onClick={() => onToggle(id)}
      aria-expanded={isOpen}
      aria-controls={`${id}-section-body`}
    >
      {isOpen ? <FiChevronDown aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />}
      <span className={styles.disclosureTitle}>{title}</span>
      <span className={styles.disclosureCountWrap}>
        {count != null && count > 0 && <span className={styles.disclosureCount}>{count}</span>}
      </span>
    </button>
    {isOpen && (
      <div id={`${id}-section-body`} className={styles.disclosureBody}>
        {children}
      </div>
    )}
  </section>
);
