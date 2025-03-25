import React from 'react';

interface ViewToggleProps {
  viewMode: "grid" | "list";
  setViewMode: (mode: "grid" | "list") => void;
  showToggle?: boolean | null;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  viewMode,
  setViewMode,
  showToggle = false
}) => {
  if (!showToggle) {
    return null;
  }

  return (
    <div className="view-toggle">
      <button
        className={`view-toggle-button ${viewMode === "list" ? "active" : ""}`}
        onClick={() => setViewMode("list")}
        name="List View"
      >
        ☰
      </button>
      <button
        className={`view-toggle-button ${viewMode === "grid" ? "active" : ""}`}
        onClick={() => setViewMode("grid")}
        name="Grid View"
      >
        ⊞
      </button>
    </div>
  );
};

export default ViewToggle;