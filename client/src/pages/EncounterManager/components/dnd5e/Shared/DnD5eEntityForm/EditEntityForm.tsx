import React, { useState } from "react";
import { useUpdateDnD5eEntity } from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import { DnD5eEntityForm } from "./DnD5eEntityForm.js";
import type { EntityFormSubmitValue } from "./DnD5eEntityForm.types.js";

type EditEntityFormProps = {
  entity: DnD5eEntityDetails;
  onCancel?: () => void;
  onSaved?: (entity: EntityFormSubmitValue) => void;
};

export const EditEntityForm: React.FC<EditEntityFormProps> = ({
  entity,
  onCancel,
  onSaved,
}) => {
  const updateMutation = useUpdateDnD5eEntity();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (nextEntity: EntityFormSubmitValue) => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: entity.templateId,
        data: nextEntity,
      });
      onSaved?.(nextEntity);
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entity");
    }
  };

  return (
    <DnD5eEntityForm
      mode="edit"
      initialEntity={entity}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={updateMutation.isPending}
      error={error}
    />
  );
};

export default EditEntityForm;
