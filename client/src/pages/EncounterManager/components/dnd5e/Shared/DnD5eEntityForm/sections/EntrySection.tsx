import React from "react";
import { ActionRows, EntryRows } from "../rows/index.js";
import type { AdvancedSectionsProps } from "./AdvancedSections.types.js";

export const EntrySection: React.FC<AdvancedSectionsProps> = ({
  draft,
  addTrait,
  updateTrait,
  removeTrait,
  addAction,
  updateAction,
  removeAction,
  getRowError,
}) => (
  <>
    <EntryRows
      title="Traits"
      fieldPrefix="traits"
      addLabel="Trait"
      rows={draft.traits}
      onAdd={addTrait}
      onUpdate={updateTrait}
      onRemove={removeTrait}
      getError={(id) => getRowError("traits", id)}
    />
    <ActionRows
      rows={draft.actions}
      onAdd={addAction}
      onUpdate={updateAction}
      onRemove={removeAction}
      getError={(id) => getRowError("actions", id)}
    />
  </>
);
