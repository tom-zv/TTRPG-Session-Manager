import React from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { FormField } from "src/components/FormControls/index.js";
import { ACTION_TYPE_OPTIONS } from "../model/options.js";
import type { ActionEntryDraft, TextEntryDraft } from "../DnD5eEntityForm.types.js";
import styles from "./DnD5eEntityFormRows.module.css";

type EntryRowsProps = {
  title: string;
  fieldPrefix: string;
  addLabel: string;
  rows: TextEntryDraft[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<TextEntryDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const EntryRows: React.FC<EntryRowsProps> = ({
  title,
  fieldPrefix,
  addLabel,
  rows,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => (
  <div className={styles.rowGroup}>
    <div className={styles.rowGroupHeader}>
      <h4>{title}</h4>
      <button type="button" className={`${styles.toolButton} ${styles.plusButton}`} onClick={onAdd}>
        <FiPlus aria-hidden="true" />
        {addLabel}
      </button>
    </div>
    <div className={styles.cardRows}>
      {rows.map((row) => (
        <TextEntryCard
          key={row.id}
          title={title}
          fieldPrefix={fieldPrefix}
          row={row}
          error={getError?.(row.id)}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  </div>
);

type ActionRowsProps = {
  rows: ActionEntryDraft[];
  onAdd: (actionType: string) => void;
  onUpdate: (id: string, patch: Partial<ActionEntryDraft>) => void;
  onRemove: (id: string) => void;
  getError?: (id: string) => string | undefined;
};

export const ActionRows: React.FC<ActionRowsProps> = ({
  rows,
  onAdd,
  onUpdate,
  onRemove,
  getError,
}) => (
  <div className={styles.rowGroup}>
    <div className={styles.rowGroupHeader}>
      <h4>Actions</h4>
      <div className={styles.presetRow}>
        {ACTION_TYPE_OPTIONS.filter((option) =>
          ["action", "bonus action", "reaction", "legendary"].includes(option.value)
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.presetButton} ${styles.plusButton}`}
            onClick={() => onAdd(option.value)}
          >
            <FiPlus aria-hidden="true" />
            {option.label}
          </button>
        ))}
      </div>
    </div>
    <div className={styles.cardRows}>
      {rows.map((row) => (
        <ActionEntryCard
          key={row.id}
          row={row}
          error={getError?.(row.id)}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      ))}
    </div>
  </div>
);

const TextEntryCard: React.FC<{
  title: string;
  fieldPrefix: string;
  row: TextEntryDraft;
  error?: string;
  onUpdate: (id: string, patch: Partial<TextEntryDraft>) => void;
  onRemove: (id: string) => void;
}> = ({ title, fieldPrefix, row, error, onUpdate, onRemove }) => {
  const nameFieldName = `${fieldPrefix}.${row.id}.name`;
  const descFieldName = `${fieldPrefix}.${row.id}.description`;

  return (
    <div className={styles.entryCard}>
      <div className={`${styles.inlineRow} ${styles.actionRow}`}>
        <FormField label={`${title} name`} hideLabel name={nameFieldName} error={error}>
          <input
            type="text"
            value={row.name}
            onChange={(event) => onUpdate(row.id, { name: event.target.value })}
            placeholder="Name"
          />
        </FormField>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => onRemove(row.id)}
          aria-label={`Remove ${title}`}
        >
          <FiTrash2 aria-hidden="true" />
        </button>
      </div>
      <FormField label={`${title} description`} hideLabel name={descFieldName}>
        <textarea
          rows={3}
          value={row.description}
          onChange={(event) => onUpdate(row.id, { description: event.target.value })}
          placeholder="Description"
        />
      </FormField>
    </div>
  );
};

const ActionEntryCard: React.FC<{
  row: ActionEntryDraft;
  error?: string;
  onUpdate: (id: string, patch: Partial<ActionEntryDraft>) => void;
  onRemove: (id: string) => void;
}> = ({ row, error, onUpdate, onRemove }) => (
  <div className={styles.entryCard}>
    <div className={`${styles.inlineRow} ${styles.actionRow}`}>
      <FormField label="Action name" hideLabel name={`actions.${row.id}.name`} error={error}>
        <input
          type="text"
          value={row.name}
          onChange={(event) => onUpdate(row.id, { name: event.target.value })}
          placeholder="Name"
        />
      </FormField>
      <FormField label="Action type" hideLabel name={`actions.${row.id}.type`}>
        <select
          value={row.actionType}
          onChange={(event) => onUpdate(row.id, { actionType: event.target.value })}
        >
          {ACTION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => onRemove(row.id)}
        aria-label="Remove action"
      >
        <FiTrash2 aria-hidden="true" />
      </button>
    </div>
    <FormField label="Action description" hideLabel name={`actions.${row.id}.description`}>
      <textarea
        rows={3}
        value={row.description}
        onChange={(event) => onUpdate(row.id, { description: event.target.value })}
        placeholder="Description"
      />
    </FormField>
  </div>
);
