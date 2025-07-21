import { DnD5eEntityDB, DnD5eEntityUpdateDB, DnD5eEntitySummaryDB } from "src/api/encounters/entities/types.js";
import { DnD5eEntity, DnD5eEntitySummary } from "shared/domain/encounters/dnd5e/entity.js";


/**
 * Transforms a DnD5eEntity to DnD5eEntityUpdateDB
 * @param entity The entity object from the client
 * @returns A database-ready entity object
 */
export function dnd5eEntityToUpdateDb(entity: DnD5eEntity): DnD5eEntityUpdateDB {
  return {
    // Core fields
    id: entity.id,
    name: entity.name,
    image_url: entity.imageUrl,
    created_at: entity.createdAt,
    
    // DnD5e specific fields
    entity_type: entity.entityType,
    cr: entity.cr,
    ac: entity.ac,
    hp: entity.hp,
    speed: entity.speed,
    size: entity.size,
    allignment: entity.alignment,
    
    // Nested objects
    ability_scores: entity.abilityScores,
    resistances: entity.resistances,
    immunities: entity.immunities,
    vulnerabilities: entity.vulnerabilities,
    
    // Array relations
    traits: entity.traits?.map(trait => ({
      name: trait.name,
      description: trait.description
    })),
    actions: entity.actions?.map(action => ({
      name: action.name,
      description: action.description,
      action_type: action.actionType
    })),
    
    // Spellcasting
    spellcasting: entity.spellcasting?.map(spell => ({
      name: spell.name,
      display_as: spell.displayAs,
      descriptions: spell.descriptions,
      levels: spell.levels?.map(level => ({
        level: level.level,
        slots: level.slots,
        spells: level.spells
      })),
      usage_spells: spell.freqSpells
    })),
  };
}

/**
 * Transforms a DnD5eEntityDB to DnD5eEntity 
 * @param db The database entity object
 * @returns A client-ready entity object
 */
export function dnd5eEntityDbToDomain(db: DnD5eEntityDB): DnD5eEntity {
  return {
    // Core fields
    id: db.id,
    name: db.name,
    imageUrl: db.image_url,
    createdAt: db.created_at,
    
    // DnD5e specific fields
    entityType: db.entity_type,
    cr: db.cr,
    ac: db.ac,
    hp: db.hp,
    speed: db.speed,
    size: db.size,
    alignment: db.allignment,
    
    // Nested objects
    abilityScores: db.ability_scores,
    resistances: db.resistances,
    immunities: db.immunities,
    vulnerabilities: db.vulnerabilities,
    
    // Array relations
    traits: db.traits?.map(trait => ({
      name: trait.name,
      description: trait.description
    })),
    actions: db.actions?.map(action => ({
      name: action.name,
      description: action.description,
      actionType: action.action_type
    })),
    
    // Spellcasting
    spellcasting: db.spellcasting?.map(spell => ({
      name: spell.name,
      displayAs: spell.display_as,
      descriptions: spell.descriptions,
      levels: spell.levels?.map(level => ({
        level: level.level,
        slots: level.slots,
        spells: level.spells
      })),
      usageSpells: spell.freq_spells
    })),
  };
}

/**
 * Transforms a DnD5eEntity to DnD5eEntityInsertDB for new entity creation
 * @param entity The entity object from the client
 * @returns A database-ready entity object for insertion
 */
export function dnd5eEntityToInsertDb(entity: DnD5eEntity): Omit<DnD5eEntityDB, 'id'> {
  return {
    // Core fields
    name: entity.name,
    image_url: entity.imageUrl,
    created_at: entity.createdAt || new Date().toISOString(),
    
    // DnD5e specific fields
    entity_type: entity.entityType,
    cr: entity.cr,
    ac: entity.ac || 10,
    hp: entity.hp || 1,
    speed: entity.speed || 30,
    size: entity.size || 'medium',
    allignment: entity.alignment || 'unaligned',
    
    // Nested objects
    ability_scores: entity.abilityScores || {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10
    },
    resistances: entity.resistances || [],
    immunities: entity.immunities || [],
    vulnerabilities: entity.vulnerabilities || [],
    
    // Array relations
    traits: entity.traits?.map(trait => ({
      name: trait.name,
      description: trait.description
    })) || [],
    actions: entity.actions?.map(action => ({
      name: action.name,
      description: action.description,
      action_type: action.actionType
    })) || [],
    
    // Spellcasting
    spellcasting: entity.spellcasting?.map(spell => ({
      name: spell.name,
      display_as: spell.displayAs,
      descriptions: spell.descriptions,
      levels: spell.levels?.map(level => ({
        level: level.level,
        slots: level.slots,
        spells: level.spells
      })),
      usage_spells: spell.freqSpells
    })) || [],
  };
}

/**
 * Transforms a DnD5eEntitySummaryDB to DnD5eEntitySummary 
 * @param db The database entity summary object
 * @returns A client-ready entity summary object
 */
export function dnd5eEntitySummaryDbToDomain(db: DnD5eEntitySummaryDB): DnD5eEntitySummary {
  return {
    id: db.id,
    name: db.name,
    entityType: db.entity_type,
    cr: db.cr,
  };
}