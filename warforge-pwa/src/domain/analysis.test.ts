import { describe, expect, it } from 'vitest';
import { ANALYSIS_TARGETS, analyzeRoster, estimateWeaponProfileDamage } from './analysis';
import { normalizeDatabase } from './normalize';
import type { RosterDraft } from './types';

const database = normalizeDatabase(JSON.stringify([{
  Name: 'Analysis faction',
  BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
  Units: [
    {
      Name: 'ANTI TANK SQUAD',
      Keywords: ['Infantry', 'Battleline'],
      Points: [{ ModelCount: 5, Cost: 100 }],
      StatLines: [{ Movement: '6"', Toughness: '5', Save: '3+', Wounds: '2', Leadership: '6+', OC: '2' }],
      UnitComposition: { ModelCompositions: [{ ModelName: 'Tank hunter', Wargear: [{ InitalWargear: ['anti-tank rifle'] }] }] },
      Weapons: [{ Name: 'Ranged weapons', Weapons: [{ Name: 'Anti-tank rifle', Range: '36"', Attacks: '2', ToHit: '3+', Strength: '4', AP: '-3', Damage: 'D6', Keywords: 'ANTI-VEHICLE 4+' }] }]
    },
    {
      Name: 'SCOUT VETERANS',
      Keywords: ['Infantry', 'Fly'],
      CoreAbilities: ['Scouts 6"', 'Infiltrators'],
      UnitAbilities: [{ Title: 'Feel No Pain 6+' }],
      Points: [{ ModelCount: 5, Cost: 100 }],
      StatLines: [{ Movement: '12"', Toughness: '4', Save: '3+', Wounds: '2', Leadership: '6+', OC: '2' }],
      UnitComposition: { ModelCompositions: [{ ModelName: 'Scout veteran', Wargear: [{ InitalWargear: ['scout blade'] }] }] },
      Weapons: [{ Name: 'Melee weapons', IsMelee: true, Weapons: [{ Name: 'Scout blade', Range: 'Melee', Attacks: '3', ToHit: '3+', Strength: '3', AP: '0', Damage: '1' }] }]
    }
  ]
}]));

const draft: RosterDraft = {
  id: 'analysis-draft',
  name: 'Analysis test',
  primaryFaction: database.factions[0].id,
  battleSizePoints: 1000,
  scenario: 'TAKE AND HOLD',
  detachmentIds: [],
  items: database.units.map((unit, index) => ({ id: `item-${index}`, unitId: unit.id, pointIndex: 0, wargearSelections: {} }))
};

describe('list analysis', () => {
  it('uses the selected weapon quantity and ANTI keyword against vehicles', () => {
    const analysis = analyzeRoster(database, draft);
    const heavy = analysis.targets.find((target) => target.id === 'heavy')!;
    expect(heavy.rangedDamage).toBeCloseTo(7.8, 1);
    expect(heavy.sourceUnits).toBe(1);
    expect(heavy.coverage).toBe('couvert');
    const antiTank = analysis.unitDamages.find((unit) => unit.unitName === 'ANTI TANK SQUAD')!;
    expect(antiTank.modelCount).toBe(5);
    expect(antiTank.targets.find((target) => target.targetId === 'heavy')?.totalDamage).toBeCloseTo(7.8, 1);
    expect(analysis.unitDamages).toHaveLength(2);
  });

  it('exposes the same per-profile estimate for the weapon catalogue', () => {
    const rifle = database.units.find((unit) => unit.displayName === 'ANTI TANK SQUAD')!.Weapons![0].Weapons![0];
    const heavy = ANALYSIS_TARGETS.find((target) => target.id === 'heavy')!;
    expect(estimateWeaponProfileDamage(rifle, heavy)).toBeCloseTo(1.56, 2);
  });

  it('separates melee, mobility, durability, control and structured tools', () => {
    const analysis = analyzeRoster(database, draft);
    const horde = analysis.targets.find((target) => target.id === 'horde')!;
    expect(horde.meleeDamage).toBeGreaterThan(0);
    expect(analysis.mobility).toMatchObject({ maximumMove: 12, longestRange: 36, fastUnits: 1, flyUnits: 1, scoutUnits: 1, infiltratorUnits: 1 });
    expect(analysis.resilience.totalWounds).toBe(20);
    expect(analysis.control).toMatchObject({ totalObjectiveControl: 20, modelCount: 10, battlelineUnits: 1 });
    expect(analysis.utility.feelNoPainUnits).toBe(1);
  });

  it('adds an optional custom target column to each unit analysis', () => {
    const analysis = analyzeRoster(database, draft, { id: 'custom-target', label: 'Bête E8', toughness: 8, save: 3, monster: true });
    expect(analysis.targets.at(-1)).toMatchObject({ id: 'custom-target', label: 'Bête E8', toughness: 8, save: 3 });
    const antiTank = analysis.unitDamages.find((unit) => unit.unitName === 'ANTI TANK SQUAD')!;
    expect(antiTank.points).toBe(100);
    expect(antiTank.targets.find((target) => target.targetId === 'custom-target')?.totalDamage).toBeGreaterThan(0);
  });
});
