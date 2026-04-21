import React, { useState } from "react";
import { SystemType } from "shared/domain/encounters/coreEncounter.js";
import styles from "./CreateEncounterForm.module.css";
import { DnD5eEncounterDetails } from "shared/domain/encounters/dnd5e/encounter.js";
import ConfigForm, { FormField } from "src/components/Form/Form.js";
import { useCreateDnD5eEncounter } from "src/pages/EncounterManager/api/dnd5e/encounters/query/useDnD5eEncounterMutations.js";
import { CreatePayload } from "src/pages/EncounterManager/types.js";

type CreateEncounterFormProps = {
    system: SystemType;
    onCancel: () => void
}

const CreateEncounterForm: React.FC<CreateEncounterFormProps> = ({system, onCancel}) => {

  const [name, setName] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("medium");
  
  const createMutation = useCreateDnD5eEncounter();

  const onCreate = async () => {
      switch (system) {
        case 'dnd5e': {
          const payload: CreatePayload<DnD5eEncounterDetails> = {
            system,
            name: name,
            description: '',
            status: 'planned',
            location: '',
            difficulty: difficulty,
            gmNotes: { text: '', timestamp: new Date().toISOString() },
          };
  
          try {
            await createMutation.mutateAsync(payload);
          } catch (e) {
            console.error(e);
          }
          break;
        }
        default:
          console.warn(`Create encounter not implemented for system: ${system}`);
      }
    };

  const fields: FormField[] = [
    {
      id: "name",
      label: "Name",
      type: "text",
      value: name,
      onChange: (v) => setName(v),
      required: true,
      placeholder: "Enter encounter name",
    },
    {
      id: "difficulty",
      label: "Difficulty",
      type: "text",
      value: difficulty,
      onChange: (v) => setDifficulty(v),
      required: true,
      placeholder: "",
    },

  ];
  return(
    <>
      <ConfigForm fields={fields} onSubmit={onCreate} submitLabel="Create Encounter" />
      {onCancel && (
        <button 
          onClick={onCancel} 
          className={styles.cancelButton}
          disabled={createMutation.isPending}
        >
          Cancel
        </button>
      )}
    </>
  );
};

export default CreateEncounterForm;