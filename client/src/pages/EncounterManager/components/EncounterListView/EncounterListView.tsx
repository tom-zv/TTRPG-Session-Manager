import React, { useMemo, useState } from 'react';
import styles from './EncounterListView.module.css';
import { useDeleteDnD5eEncounter} from '../../api/dnd5e/encounters/query/useDnD5eEncounterMutations.js';
import 
  {AnySystemEncounterSummary, isSupportedSystem, supportedSystems, SystemType} from 'shared/domain/encounters/coreEncounter.js';
import Dialog from 'src/components/Dialog/Dialog.js';
import { CreateEntityForm } from '../dnd5e/Shared/CreateEntity/CreateEntityForm.js';
import CreateEncounterForm from '../dnd5e/EncounterEditor/CreateEncounter/CreateEncounterForm.js';

// const systemOptions = supportedSystems.map((value) => ({
//   value,
//   label: getSystemDisplayName(value),
// }));

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

interface EncounterListViewProps {
  system: SystemType;
  setSystem: (sys: SystemType) => void;
  onOpenEditor: (encounterId: number) => void;
  onLaunchLive: (encounterId: number) => void;
  encounterSummaries: AnySystemEncounterSummary[];
  setIsLive: (bool: boolean) => void;
}

export const EncounterListView: React.FC<EncounterListViewProps> = ({ system, setSystem, onOpenEditor, onLaunchLive, encounterSummaries }) => {
  
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');
  const [isCreateEntityDialogOpen, setIsCreateEntityDialogOpen] = useState(false);
  const [isCreateEncounterDialogOpen, setIsCreateEncounterDialogOpen] = useState(false);
  const encounters = useMemo(() => {
    if (!encounterSummaries) return [];
    const q = query.trim().toLowerCase();
    return encounterSummaries.filter((e) => {
      const matchesQuery =
        !q || [e.name, e.description, e.location]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = !status || e.status === status;
      const matchesDifficulty = !difficulty || (e.difficulty ?? '') === difficulty;
      return matchesQuery && matchesStatus && matchesDifficulty;
    });
  }, [encounterSummaries, query, status, difficulty]);

  const deleteMutation = useDeleteDnD5eEncounter();

  const onDelete = (id: number) => {
    switch (system) {
      case 'dnd5e':
        if (confirm('Delete this encounter? This cannot be undone.')) {
          deleteMutation.mutate(id);
        }
        break;
      default:
        console.warn(`Delete encounter not implemented for system: ${system}`);
    }
  };

  return (
    <div className="page-container">
  <div className={styles.encounterToolbar}>
        <select
          value={system}
          onChange={(e) => {
            const next = e.target.value;
            if (isSupportedSystem(next)) {
              setSystem(next);
            } else {
              console.warn(`Unsupported system selected: ${next}`);
            }
          }}
          title="Game system"
        >
          {supportedSystems.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search name, description, location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="planned">Planned</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">All Difficulty</option>
          <option value="trivial">Trivial</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
          <option value="deadly">Deadly</option>
        </select>
        <button onClick={() => setIsCreateEncounterDialogOpen(true)}>+ New Encounter</button>
        <button onClick={() => setIsCreateEntityDialogOpen(true)}>+ Create Entity</button>
      </div>

  {/* {isLoading && <div>Loading encounters…</div>}
  {isError && <div className="encounter-error">Error: {(error as Error)?.message}</div>} */}

      {/* {!isLoading && !isError && ( */}
        <div className={styles.encounterTableContainer}>
          <table className={styles.encounterTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Difficulty</th>
                <th className={styles.textRight}>Entities (PC/NPC/Creature)</th>
                <th>Created</th>
                <th className={styles.textRight}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {encounters.map((enc) => {
                return (
                  <tr key={enc.id}>
                    <td>
                      <div className={styles.encounterName}>{enc.name}</div>
                      {enc.description && (
                        <div className={styles.encounterDescription}>
                          {enc.description}
                        </div>
                      )}
                    </td>
                    <td>{enc.status}</td>
                    <td>{enc.difficulty}</td>
                    <td>{enc.location}</td>
    
                    <td>{formatDate(enc.createdAt)}</td>
                    <td className={styles.encounterActions}>
                      <button onClick={() => onLaunchLive(enc.id)}>launch</button>
                      <button onClick={() => onOpenEditor(enc.id)}>Plan</button>
                      <button onClick={() => onDelete(enc.id)} disabled={deleteMutation.isPending}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {encounters.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.encounterEmpty}>
                    No encounters match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      {/* )} */}

      <Dialog
        isOpen={isCreateEntityDialogOpen}
        onClose={() => setIsCreateEntityDialogOpen(false)}
        title="Create New Entity"
      >
        <CreateEntityForm
          onCancel={() => setIsCreateEntityDialogOpen(false)}
        />
      </Dialog>

      <Dialog
        isOpen={isCreateEncounterDialogOpen}
        onClose={() => setIsCreateEncounterDialogOpen(false)}
        title="Create New Entity"
      >
        <CreateEncounterForm
          system={system}
          onCancel={() => setIsCreateEncounterDialogOpen(false)}
        />
      </Dialog>
    </div>
  );
};

export default EncounterListView;
