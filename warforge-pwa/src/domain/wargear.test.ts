import { describe, expect, it } from 'vitest';
import { normalizeDatabase } from './normalize';
import { calculateItemCost } from './calculations';
import { normalizedWargearSelections, resolveModelCompositions, resolveWargear, ruleLimit } from './wargear';
import type { RosterItem } from './types';

const database = normalizeDatabase(JSON.stringify([{
  Name: 'Test Faction',
  BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
  Units: [{
    Name: 'WEAPON SQUAD',
    Points: [{ ModelCount: 5, Cost: 100 }, { ModelCount: 10, Cost: 190 }],
    UnitComposition: {
      ModelCompositions: [
        {
          ModelName: 'Sergeant',
          Wargear: [{
            InitalWargear: ['bolt pistol'],
            Options: [{ Replaces: ['bolt pistol'], Options: ['plasma pistol'] }]
          }]
        },
        {
          ModelName: 'Soldiers',
          Limit: { Min: 4, Max: 9 },
          Wargear: [{
            InitalWargear: ['boltgun'],
            Options: [
              { Max: 2, PerXModels: 5, Replaces: ['boltgun'], Options: ['meltagun', 'flamer'] },
              { RequiredDettachment: 'SPECIAL FORCE', Options: ['relic banner'] }
            ]
          }]
        }
      ],
      WargearDefinitions: [{ Key: 'meltagun', Cost: 10 }]
    },
    Weapons: [
      { Name: 'RANGED WEAPONS', Weapons: [
        { Name: 'Bolt pistol', Range: '12"', Attacks: '1', ToHit: '3+', Strength: '4', AP: '0', Damage: '1' },
        { Name: 'Boltgun', Range: '24"', Attacks: '2', ToHit: '3+', Strength: '4', AP: '0', Damage: '1' },
        { Name: 'Meltagun', Range: '12"', Attacks: '1', ToHit: '3+', Strength: '9', AP: '-4', Damage: 'D6' },
        { Name: 'Plasma pistol – standard', Range: '12"', Attacks: '1', ToHit: '3+', Strength: '7', AP: '-2', Damage: '1' },
        { Name: 'Plasma pistol – supercharge', Range: '12"', Attacks: '1', ToHit: '3+', Strength: '8', AP: '-3', Damage: '2' }
      ] }
    ]
  }],
  Dettachments: [{ Name: 'SPECIAL FORCE' }]
}]));

const unit = database.units[0];

function item(pointIndex = 0): RosterItem {
  return {
    id: 'weapon-item',
    unitId: unit.id,
    pointIndex,
    wargearSelections: {},
    wargearSelectionCounts: {
      'c0-w0-o0': { 'plasma pistol': 1 },
      'c1-w0-o0': { meltagun: 2 },
      'c1-w0-o1': { 'relic banner': 1 }
    }
  };
}

describe('wargear resolution', () => {
  it('derives model-type counts from the selected unit size and applies PerXModels', () => {
    expect(resolveModelCompositions(unit, item()).map((composition) => [composition.label, composition.count])).toEqual([
      ['Sergeant', 1], ['Soldiers', 4]
    ]);
    expect(resolveModelCompositions(unit, item(1)).map((composition) => [composition.label, composition.count])).toEqual([
      ['Sergeant', 1], ['Soldiers', 9]
    ]);
    const rule = resolveWargear(unit, item()).rules.find((candidate) => candidate.id === 'c1-w0-o0')!;
    expect(ruleLimit(rule, 4, 5)).toBe(1);
    expect(ruleLimit(rule, 9, 10)).toBe(2);
  });

  it('keeps invalid structured selections visible as warnings and multiplies their cost', () => {
    const resolved = resolveWargear(unit, item());
    expect(resolved.warnings).toContainEqual(expect.stringContaining('2/1 choix autorisé'));
    expect(resolved.warnings).toContainEqual(expect.stringContaining('SPECIAL FORCE est requis'));
    expect(calculateItemCost(database, item(), [item()], []).wargear).toBe(20);
    expect(resolved.arsenal).toContainEqual(expect.objectContaining({ name: 'meltagun', count: 2, hasProfile: true }));
  });

  it('matches all firing modes for a selected weapon and accepts the required detachment', () => {
    const resolved = resolveWargear(unit, item(1), ['SPECIAL FORCE']);
    expect(resolved.warnings.some((warning) => warning.includes('choix autorisé') || warning.includes('requis'))).toBe(false);
    expect(resolved.profiles.map((entry) => entry.profile.Name)).toEqual(expect.arrayContaining([
      'Plasma pistol – standard', 'Plasma pistol – supercharge', 'Meltagun'
    ]));
  });

  it('upgrades the historic one-string selection into a quantitative selection', () => {
    expect(normalizedWargearSelections({ wargearSelections: { 'c0-w0-o0': 'plasma pistol' } })).toEqual({
      'c0-w0-o0': { 'plasma pistol': 1 }
    });
  });
});
