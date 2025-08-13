import React, { useMemo, useState } from 'react';
import './EncounterListView.css';
import { useNavigate } from 'react-router-dom';
import { useDnD5eEncounters, useCreateDnD5eEncounter, useDeleteDnD5eEncounter, useAssignEntitiesToEncounter } from '../api/dnd5e/encounters/useEncounterQueries.js';
import type { Dnd5eEncounter } from 'shared/domain/encounters/dnd5e/encounter.js';
import type { CreatePayload } from '../types.js';

type SystemType = 'dnd5e'; // future: extend with more systems

const systems: { value: SystemType; label: string }[] = [
  { value: 'dnd5e', label: 'D&D 5e' },
];

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function countsByType(enc: Dnd5eEncounter) {
  const mutable: Record<'pc' | 'npc' | 'creature', number> = { pc: 0, npc: 0, creature: 0 };
  for (const e of enc.encounterEntities ?? []) {
    if (e.entityType in mutable) mutable[e.entityType as keyof typeof mutable]++;
  }
  return mutable;
}

export const EncounterListView: React.FC = () => {
  const navigate = useNavigate();
  const [system, setSystem] = useState<SystemType>('dnd5e');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('');

  // System-specific data fetching (agreeing with system-specific query hooks design)
  const { data: dnd5eEncounters, isLoading, isError, error } = useDnD5eEncounters();

  const encounters = useMemo(() => {
    let list: Dnd5eEncounter[] = [];
    if (system === 'dnd5e') list = dnd5eEncounters ?? [];

    // client-side search/filter for v1 (backend filters to follow)
    const q = query.trim().toLowerCase();
    return list.filter((e) => {
      const matchesQuery = !q || [e.name, e.description, e.location]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
      const matchesStatus = !status || e.status === status;
      const matchesDifficulty = !difficulty || (e.difficulty ?? '') === difficulty;
      return matchesQuery && matchesStatus && matchesDifficulty;
    });
  }, [system, dnd5eEncounters, query, status, difficulty]);

  const createMutation = useCreateDnD5eEncounter();
  const deleteMutation = useDeleteDnD5eEncounter();
  const assignEntitiesMutation = useAssignEntitiesToEncounter();

  const onCreate = async () => {
    if (system !== 'dnd5e') return; // future systems
    const payload: CreatePayload<Dnd5eEncounter> = {
      name: 'New Encounter',
      description: '',
      status: 'planned',
      location: '',
      difficulty: 'medium',
      roundCount: 0,
      dmNotes: { text: '', timestamp: new Date().toISOString() },
  encounterEntities: [],
  };
    try {
      await createMutation.mutateAsync(payload);
    } catch (e) {
      console.error(e);
    }
  };

  const onDuplicate = async (enc: Dnd5eEncounter) => {
    if (system !== 'dnd5e') return;
    const copy: CreatePayload<Dnd5eEncounter> = {
      name: `${enc.name} (Copy)`,
      description: enc.description,
      status: 'planned',
      location: enc.location,
      difficulty: enc.difficulty,
      roundCount: 0,
      dmNotes: { text: enc.dmNotes?.text ?? '', timestamp: new Date().toISOString() },
  encounterEntities: [],
  };
    try {
      const newId = await createMutation.mutateAsync(copy);
      const ids = (enc.encounterEntities ?? []).map((e) => e.id).filter(Boolean);
      if (ids.length) {
        await assignEntitiesMutation.mutateAsync({ encounterId: newId, entityIds: ids });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const onDelete = (id: number) => {
    if (system !== 'dnd5e') return;
    if (confirm('Delete this encounter? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const onLaunch = (enc: Dnd5eEncounter) => {
    // Placeholder: Navigate to combat tracker with query params
    navigate(`/combat-tracker?system=${system}&encounterId=${enc.id}`);
  };

  return (
    <div className="page-container">
  <div className="encounter-toolbar">
        <select
          value={system}
          onChange={(e) => setSystem(e.target.value as SystemType)}
          title="Game system"
        >
          {systems.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
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
        <button onClick={onCreate} disabled={createMutation.isPending}>+ New</button>
      </div>

  {isLoading && <div>Loading encounters…</div>}
  {isError && <div className="encounter-error">Error: {(error as Error)?.message}</div>}

      {!isLoading && !isError && (
        <div className="encounter-table-container">
          <table className="encounter-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Difficulty</th>
                <th>Location</th>
                <th className="text-right">Round</th>
                <th className="text-right">Entities (PC/NPC/Creature)</th>
                <th>Created</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {encounters.map((enc) => {
                const c = countsByType(enc);
                return (
                  <tr key={enc.id}>
                    <td>
                      <div className="encounter-name">{enc.name}</div>
                      {enc.description && (
                        <div className="encounter-description">
                          {enc.description}
                        </div>
                      )}
                    </td>
                    <td>{enc.status}</td>
                    <td>{enc.difficulty}</td>
                    <td>{enc.location}</td>
                    <td className="text-right">{enc.roundCount ?? 0}</td>
                    <td className="text-right">{c.pc}/{c.npc}/{c.creature}</td>
                    <td>{formatDate(enc.createdAt)}</td>
                    <td className="encounter-actions">
                      <button onClick={() => onLaunch(enc)}>Launch</button>
                      <button onClick={() => onDuplicate(enc)} disabled={createMutation.isPending}>Duplicate</button>
                      <button onClick={() => onDelete(enc.id)} disabled={deleteMutation.isPending}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {encounters.length === 0 && (
                <tr>
                  <td colSpan={8} className="encounter-empty">
                    No encounters match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default EncounterListView;
