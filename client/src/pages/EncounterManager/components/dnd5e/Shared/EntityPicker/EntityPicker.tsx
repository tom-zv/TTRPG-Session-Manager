import React, { useState, useMemo } from 'react';
import { useDnD5eEntitySummaries } from 'src/pages/EncounterManager/api/dnd5e/entities/query/useDnD5eEntityQueries.js';
import type { DnD5eEntitySummary } from 'shared/domain/encounters/dnd5e/entity.js';
import styles from './EntityPicker.module.css';

interface EntityPickerProps {
  onSelect: (templateId: number, name: string, hp: number) => void;
  onCancel?: () => void;
  excludeIds?: number[];
  title?: string;
}

export const EntityPicker: React.FC<EntityPickerProps> = ({ 
  onSelect, 
  onCancel,
  title = 'Select Entity'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'pc' | 'npc' | 'creature'>('all');
  
  const { data: entitySummaries, isLoading, error } = useDnD5eEntitySummaries();

  const filteredEntities = useMemo(() => {
    if (!entitySummaries) return [];
    
    return entitySummaries.filter(entity => {
      
      // Filter by type
      if (selectedType !== 'all' && entity.entityType !== selectedType) return false;
      
      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return entity.name.toLowerCase().includes(query);
      }
      
      return true;
    });
  }, [entitySummaries, selectedType, searchQuery]);

  const handleSelect = (entity: DnD5eEntitySummary) => {
    onSelect(entity.templateId, entity.name, entity.hp);
  };

  if (isLoading) {
    return (
      <div className={styles.entityPicker}>
        <h2>{title}</h2>
        <div className={styles.entityPickerLoading}>Loading entities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.entityPicker}>
        <h2>{title}</h2>
        <div className={styles.entityPickerError}>
          Error loading entities: {(error as Error).message}
        </div>
        {onCancel && (
          <button onClick={onCancel} className={styles.cancelButton}>
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.entityPicker}>
      <h2>{title}</h2>
      
      <div className={styles.entityPickerFilters}>
        <input
          type="text"
          placeholder="Search entities..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        
        <select 
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as typeof selectedType)}
          className={styles.typeFilter}
        >
          <option value="all">All Types</option>
          <option value="pc">Player Characters</option>
          <option value="npc">NPCs</option>
          <option value="creature">Creatures</option>
        </select>
      </div>

      <div className={styles.entityPickerList}>
        {filteredEntities.length === 0 ? (
          <div className={styles.entityPickerEmpty}>
            No entities found matching your criteria.
          </div>
        ) : (
          filteredEntities.map(entity => (
            <button 
              key={entity.templateId}
              className={styles.entityPickerItem}
              onClick={() => handleSelect(entity)}
              type="button"
            >
              <div className={styles.entityItemName}>{entity.name}</div>
              <div className={styles.entityItemDetails}>
                <span className={`${styles.entityTypeBadge} ${styles[entity.entityType as 'pc' | 'npc' | 'creature']}`}>
                  {entity.entityType.toUpperCase()}
                </span>
                {entity.cr && (
                  <span className={styles.entityCr}>CR {entity.cr}</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {onCancel && (
        <div className={styles.entityPickerActions}>
          <button onClick={onCancel} className={styles.cancelButton}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default EntityPicker;
