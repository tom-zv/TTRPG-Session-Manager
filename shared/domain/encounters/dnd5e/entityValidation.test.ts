import { describe, expect, test } from 'vitest';
import { validateDnD5eEntityWrite } from './entityValidation.js';

function issuePaths(fields: Record<string, unknown>): string[] {
  const result = validateDnD5eEntityWrite({ name: 'Storm Herald', ...fields });
  if (result.ok) throw new Error('Expected an invalid entity');
  return result.issues.map(issue => issue.path);
}

describe('entity write validation', () => {
  test('reports schema limits on scalars and nested entries at their request paths', () => {
    expect(issuePaths({
      name: 'x'.repeat(129),
      imageUrl: 'x'.repeat(257),
      hpFormula: 'x'.repeat(256),
      hp: 2_147_483_648,
      passivePerception: 32_768,
      legendaryActionCount: 128,
      senses: ['x'.repeat(129)],
      traits: [{ name: 'Trait', description: '😀'.repeat(16_384), sortOrder: -32_769 }],
      actions: [{ name: 'x'.repeat(65), description: 'A custom section.', actionType: 'Villain' }],
      conditionImmunities: [{ conditionName: 'frightened', conditionNote: 'x'.repeat(257) }],
      spellcasting: [{
        name: 'Spells',
        saveDc: 128,
        spellAttackBonus: -129,
        levels: [{
          level: 2,
          slots: -1,
          spells: [{ name: 'Acid arrow', source: 'x'.repeat(17), note: 'x'.repeat(513) }],
        }],
      }],
    })).toEqual(expect.arrayContaining([
      'name', 'imageUrl', 'hpFormula', 'hp', 'passivePerception', 'legendaryActionCount', 'senses.0',
      'traits.0.description', 'traits.0.sortOrder', 'actions.0.name', 'conditionImmunities.0.conditionNote',
      'spellcasting.0.saveDc', 'spellcasting.0.spellAttackBonus', 'spellcasting.0.levels.0.slots',
      'spellcasting.0.levels.0.spells.0.source', 'spellcasting.0.levels.0.spells.0.note',
    ]));
  });

  test('rejects unsupported enums, damage types and duplicate keys', () => {
    expect(issuePaths({
      role: 'monster',
      size: 'colossal',
      saves: { dex: '+2', ' DEX ': '+3' },
      skills: { Perception: '+1', perception: '+4' },
      vulnerabilities: [{ damageType: 'sunlight' }],
      spellcasting: [{
        name: 'Spells',
        displayAs: 'spellcasting',
        frequencyGroups: [{ frequency: 'nightly', spells: [] }],
        levels: [{ level: 1, spells: [] }, { level: 1, spells: [] }],
      }],
    })).toEqual(expect.arrayContaining([
      'role', 'size', 'saves.dex', 'skills.perception', 'vulnerabilities.0.damageType',
      'spellcasting.0.displayAs', 'spellcasting.0.frequencyGroups.0.frequency', 'spellcasting.0.levels.1.level',
    ]));
  });

  test('trims strings, keeps legacy empty fields and keeps the first spelling of each sense', () => {
    const result = validateDnD5eEntityWrite({
      name: '  Storm Herald ',
      templateId: 4,
      createdAt: 'ignored',
      controllerUserIds: [99],
      cr: '',
      creatureType: '  ',
      senses: [' Darkvision 60 ft. ', 'Blindsight 10 ft.', 'DARKVISION 60 FT.'],
      immunities: [{ damageType: ' Fire ', conditionNote: ' in sunlight ' }],
      actions: [{ name: ' Strike ', description: '  Hit. ', actionType: ' Custom section ', sortOrder: 32_767 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: 'Storm Herald',
      cr: '',
      creatureType: '',
      senses: ['Darkvision 60 ft.', 'Blindsight 10 ft.'],
      immunities: [{ damageType: 'fire', conditionNote: 'in sunlight' }],
      actions: [{ name: 'Strike', description: 'Hit.', actionType: 'Custom section', sortOrder: 32_767 }],
    });
    expect(result.value).not.toHaveProperty('templateId');
    expect(result.value).not.toHaveProperty('createdAt');
    expect(result.value).not.toHaveProperty('controllerUserIds');
  });

  test('accepts the null speeds of a legacy read, defaulting them on create and clearing them on update', () => {
    const created = validateDnD5eEntityWrite({ name: 'Storm Herald', speeds: null });
    expect(created).toMatchObject({ ok: true, value: { speeds: { walk: 30 } } });
    const updated = validateDnD5eEntityWrite({ name: 'Gale Herald', speeds: null }, 'update');
    expect(updated).toEqual({ ok: true, value: expect.objectContaining({ name: 'Gale Herald', speeds: null }) });
  });

  test('rejects text with an unpaired surrogate at its path and keeps well-formed Unicode', () => {
    expect(issuePaths({
      senses: ['\ud800', '\ufffd'],
      skills: { ['Stealth\udc00']: '+4' },
      actions: [{ name: 'Strike', description: 'Hit \ud83d.', actionType: 'action' }],
    })).toEqual(['senses.0', 'skills', 'actions.0.description']);

    const result = validateDnD5eEntityWrite({
      name: 'Storm Herald 😀',
      senses: ['Ténèbres 😀 60 ft.', 'TÉNÈBRES 😀 60 FT.'],
    });
    expect(result).toMatchObject({ ok: true, value: { name: 'Storm Herald 😀', senses: ['Ténèbres 😀 60 ft.'] } });
  });
});
