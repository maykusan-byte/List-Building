import { describe, expect, it } from 'vitest';
import { buildStatisticsReportSnapshot } from './statistics-report';
import type { NormalizedDatabase, NormalizedUnit } from './types';

const unit: NormalizedUnit = {
  id: 'book:test:unit:report', bookId: 'book:test', sourceKey: 'Test', sourceIndex: 0,
  factionName: 'Test', displayName: 'Escouade test', Name: 'Escouade test', Keywords: ['Infantry'],
  Points: [{ ModelCount: 1, Cost: 100 }],
  StatLines: [{ Movement: '6', Toughness: '4', Save: '3+', Wounds: '3', Leadership: '7+', OC: '2' }],
  UnitComposition: { ModelCompositions: [{ ModelName: 'Testeur', Wargear: [{ InitalWargear: ['Fusil fusion', 'Pistolet', 'Lame'] }] }] },
  Weapons: [
    { Name: 'Tir', Weapons: [
      { Name: 'Fusil fusion', Range: '24', Attacks: '1', ToHit: 'N/A', Strength: '12', AP: '-4', Damage: '1', Keywords: 'TORRENT RAPID FIRE 1 MELTA 2' },
      { Name: 'Pistolet', Range: '12', Attacks: '1', ToHit: 'N/A', Strength: '12', AP: '-4', Damage: '1', Keywords: 'TORRENT PISTOL' }
    ] },
    { Name: 'Mêlée', IsMelee: true, Weapons: [{ Name: 'Lame', Range: 'Melee', Attacks: '2', ToHit: 'N/A', Strength: '12', AP: '-4', Damage: '1', Keywords: 'TORRENT' }] }
  ]
};

const database: NormalizedDatabase = {
  fingerprint: 'catalog-test', loadedAt: '2026-08-11T00:00:00Z', books: [], alliesByFaction: {},
  factions: [{ id: 'test', name: 'Test', sourceKey: 'Test', bookIds: [], unitCount: 1, detachmentCount: 0 }],
  primaryRostersByFaction: { test: ['Test'] }, units: [unit], detachments: [], battleSizes: [],
  dataInfo: { Version: '1.0.0', PublishDate: '2026-08-10' }
};

describe('statistics report snapshot', () => {
  it('freezes exact configurations and distance-aware exclusive attack modes', () => {
    const snapshot = buildStatisticsReportSnapshot(database, {
      snapshotDate: '2026-08-11', cohortNames: ['Test'], distances: [0, 12, 18, 24, 36]
    });
    expect(snapshot.totals).toMatchObject({ factions: 1, units: 1, configurations: 1 });
    expect(snapshot.catalogDate).toBe('2026-08-10');
    expect(snapshot.units[0].configurations[0]).toMatchObject({ points: 100, models: 1 });

    const scenarios = snapshot.units[0].offenseScenarios.filter((scenario) => scenario.targetId === 'vehicle');
    const at = (distance: number, mode: string) => scenarios.find((scenario) => scenario.distance === distance && scenario.mode === mode)!;
    expect(at(0, 'pistol').usefulDamage!.mean).toBeGreaterThan(0);
    expect(at(0, 'melee').usefulDamage!.mean).toBeGreaterThan(at(0, 'pistol').usefulDamage!.mean);
    expect(at(12, 'standard-ranged').usefulDamage!.mean).toBeGreaterThan(at(18, 'standard-ranged').usefulDamage!.mean);
    expect(at(24, 'standard-ranged').usefulDamage!.mean).toBeGreaterThan(0);
    expect(at(36, 'standard-ranged').usefulDamage!.mean).toBe(0);
    expect(snapshot.assumptions).toContain('rapid-fire-and-melta-active-at-inclusive-half-range');
  });
});
