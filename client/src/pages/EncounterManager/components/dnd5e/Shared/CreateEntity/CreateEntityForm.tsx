import React, { useState } from 'react';
import ConfigForm, { FormField } from 'src/components/Form/Form.js';
import { useCreateDnD5eEntity } from 'src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js';
import type { DnD5eEntityDetails } from 'shared/domain/encounters/dnd5e/entity.js';
import styles from './CreateEntityForm.module.css';

interface CreateEntityFormProps {
  onCancel?: () => void;
}

export const CreateEntityForm: React.FC<CreateEntityFormProps> = ({ 
  onCancel 
}) => {
  // Form state
  const [name, setName] = useState('');
  const [role, setRole] = useState<'pc' | 'npc' | 'creature'>('creature');
  const [cr, setCr] = useState('');
  const [ac, setAc] = useState('10');
  const [hp, setHp] = useState('1');
  const [walkSpeed, setWalkSpeed] = useState('30');
  const [size, setSize] = useState<DnD5eEntityDetails['size']>('medium');
  const [alignment, setAlignment] = useState('unaligned');
  
  // Ability scores
  const [str, setStr] = useState('10');
  const [dex, setDex] = useState('10');
  const [con, setCon] = useState('10');
  const [int, setInt] = useState('10');
  const [wis, setWis] = useState('10');
  const [cha, setCha] = useState('10');

  const [error, setError] = useState<string | null>(null);
  
  const createMutation = useCreateDnD5eEntity();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      const entityData: Omit<DnD5eEntityDetails, 'templateId' | 'createdAt'> = {
        name: name.trim(),
        role,
        cr: cr.trim() || undefined,
        ac: parseInt(ac) || 10,
        hp: parseInt(hp) || 1,
        speeds: { walk: parseInt(walkSpeed) || 30 },
        size,
        alignment,
        abilityScores: {
          str: parseInt(str) || 10,
          dex: parseInt(dex) || 10,
          con: parseInt(con) || 10,
          int: parseInt(int) || 10,
          wis: parseInt(wis) || 10,
          cha: parseInt(cha) || 10,
        },
        resistances: [],
        immunities: [],
        vulnerabilities: [],
        traits: [],
        actions: [],
        spellcasting: [],
      };

      await createMutation.mutateAsync(entityData);
      if (onCancel) onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entity');
    }
  };

  const fields: FormField[] = [
    {
      id: 'name',
      label: 'Name',
      type: 'text',
      value: name,
      onChange: (v) => setName(v),
      required: true,
      placeholder: 'Enter entity name',
    },
    {
      id: 'role',
      label: 'Type',
      type: 'select',
      value: role,
      onChange: (v) => setRole(v as 'pc' | 'npc' | 'creature'),
      options: [
        { value: 'creature', label: 'Creature' },
        { value: 'npc', label: 'NPC' },
        { value: 'pc', label: 'PC' },
      ],
    },
    {
      id: 'cr',
      label: 'Challenge Rating',
      type: 'text',
      value: cr,
      onChange: (v) => setCr(v),
      placeholder: 'e.g., 1, 1/2, 1/4',
    },
    {
      id: 'ac',
      label: 'Armor Class',
      type: 'text',
      value: ac,
      onChange: (v) => setAc(v),
      required: true,
    },
    {
      id: 'hp',
      label: 'Hit Points',
      type: 'text',
      value: hp,
      onChange: (v) => setHp(v),
      required: true,
    },
    {
      id: 'walkSpeed',
      label: 'Walk Speed',
      type: 'text',
      value: walkSpeed,
      onChange: (v) => setWalkSpeed(v),
      placeholder: '30',
    },
    {
      id: 'size',
      label: 'Size',
      type: 'select',
      value: size,
      onChange: (v) => setSize(v as DnD5eEntityDetails['size']),
      options: [
        { value: 'tiny', label: 'Tiny' },
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
        { value: 'huge', label: 'Huge' },
        { value: 'gargantuan', label: 'Gargantuan' },
      ],
    },
    {
      id: 'alignment',
      label: 'Alignment',
      type: 'text',
      value: alignment,
      onChange: (v) => setAlignment(v),
      placeholder: 'unaligned',
    },
  ];

  const abilityScoreFields: FormField[] = [
    { id: 'str', label: 'STR', type: 'text', value: str, onChange: (v) => setStr(v) },
    { id: 'dex', label: 'DEX', type: 'text', value: dex, onChange: (v) => setDex(v) },
    { id: 'con', label: 'CON', type: 'text', value: con, onChange: (v) => setCon(v) },
    { id: 'int', label: 'INT', type: 'text', value: int, onChange: (v) => setInt(v) },
    { id: 'wis', label: 'WIS', type: 'text', value: wis, onChange: (v) => setWis(v) },
    { id: 'cha', label: 'CHA', type: 'text', value: cha, onChange: (v) => setCha(v) },
  ];

  return (
    <div className={styles.createEntityForm}>
      <h2>Create New Entity</h2>
      
      <ConfigForm
        fields={fields}
        onSubmit={handleSubmit}
        submitLabel="Create Entity"
        isSubmitting={createMutation.isPending}
        error={error}
      >
        <div className={styles.abilityScoresSection}>
          <h3>Ability Scores</h3>
          <div className={styles.abilityScoresGrid}>
            {abilityScoreFields.map(field => (
              <div key={field.id} className={styles.abilityScoreField}>
                <label htmlFor={field.id}>{field.label}</label>
                <input
                  id={field.id}
                  type="text"
                  value={field.value as string}
                  onChange={(e) => (field.onChange as (v: string) => void)(e.target.value)}
                  placeholder="10"
                />
              </div>
            ))}
          </div>
        </div>
      </ConfigForm>

      {onCancel && (
        <button 
          onClick={onCancel} 
          className={styles.cancelButton}
          disabled={createMutation.isPending}
        >
          Cancel
        </button>
      )}
    </div>
  );
};

export default CreateEntityForm;
