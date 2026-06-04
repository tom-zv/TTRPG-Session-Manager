import React from "react";
import { GiWarlockEye } from "react-icons/gi";
import linkStyles from "../SelectionLink.module.css";

type RowSelectionMarkerProps = {
  isActive: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
};

/** The eye marker in a selected row's notch. A button when the row can pin the side card. */
export const RowSelectionMarker: React.FC<RowSelectionMarkerProps> = ({ isActive, isPinned, onTogglePin }) => {
  const activeClass = isActive ? ` ${linkStyles.activeSelectionMarker}` : "";

  if (!onTogglePin) {
    return (
      <span className={`${linkStyles.selectionMarker} ${linkStyles.rowSelectionMarker}${activeClass}`} aria-hidden="true">
        <GiWarlockEye />
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`${linkStyles.selectionMarker} ${linkStyles.selectionMarkerButton} ${linkStyles.rowSelectionMarker}${activeClass}${isPinned ? ` ${linkStyles.pinnedSelectionMarker}` : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onTogglePin();
      }}
      title={isPinned ? "Pinned — click to follow active turn" : "Following active turn — click to pin"}
      aria-label={isPinned ? "Unpin entity" : "Pin entity"}
    >
      <GiWarlockEye />
    </button>
  );
};
