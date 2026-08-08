import React, { useState } from "react";
import { useCreateDnD5eEntity } from "src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js";
import { DnD5eEntityForm } from "./DnD5eEntityForm.js";
import type { DnD5eEntityDetails } from "shared/domain/encounters/dnd5e/entity.js";
import type { EntityFormSubmitValue } from "./DnD5eEntityForm.types.js";

type CreateEntityFormProps = {
  onCancel?: () => void;
  /** Receives the entity the server saved, including its generated template ID. */
  onCreated?: (entity: DnD5eEntityDetails) => void;
};

export const CreateEntityForm: React.FC<CreateEntityFormProps> = ({
  onCancel,
  onCreated,
}) => {
  const createMutation = useCreateDnD5eEntity();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (entity: EntityFormSubmitValue) => {
    setError(null);
    try {
      const { entity: saved } = await createMutation.mutateAsync(entity);
      onCreated?.(saved);
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create entity");
    }
  };

  return (
    <DnD5eEntityForm
      mode="create"
      onSubmit={handleSubmit}
      onCancel={onCancel}
      isSubmitting={createMutation.isPending}
      error={error}
    />
  );
};

export default CreateEntityForm;
