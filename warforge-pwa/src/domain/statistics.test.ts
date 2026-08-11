import { describe, expect, it } from 'vitest';
import { allocateDamageMass, attachBenchmarks, calculateUnitStatisticalProfile, convolve, defaultUnitConfiguration, enumerateUnitConfigurations, normalizeMass, parseDiceMass, percentile, repeatMass, summarizeMass, weaponDamageMass, type StatisticsTarget } from './statistics';
import type { NormalizedDatabase, NormalizedUnit } from './types';

const infantry: StatisticsTarget = {
  id: 'test-infantry', label: 'Infanterie', toughness: 4, save: 3,
  woundsPerModel: 2, models: 5, keywords: ['infantry']
};

describe('statistics probability engine', () => {
  it('builds exact and normalized dice distributions', () => {
    const d6 = summarizeMass(parseDiceMass('D6'));
    expect(d6.mean).toBeCloseTo(3.5, 10);
    expect(d6.variance).toBeCloseTo(35 / 12, 10);
    expect(d6.median).toBe(3);
    expect(d6.p90).toBe(6);
    expect(d6.mass.reduce((sum, [, probability]) => sum + probability, 0)).toBeCloseTo(1, 12);
  });

  it('convolves without sampling noise', () => {
    const twoDice = summarizeMass(convolve(parseDiceMass('D6'), parseDiceMass('D6')));
    const repeated = summarizeMass(repeatMass(parseDiceMass('D6'), 2));
    expect(twoDice.mean).toBeCloseTo(7, 12);
    expect(repeated.mass.map(([value]) => value)).toEqual(twoDice.mass.map(([value]) => value));
    repeated.mass.forEach(([, probability], index) => expect(probability).toBeCloseTo(twoDice.mass[index][1], 12));
    expect(twoDice.mass.find(([value]) => value === 7)?.[1]).toBeCloseTo(1 / 6, 12);
  });

  it('renormalizes after negligible tails are removed', () => {
    const mass = normalizeMass(new Map([[0, 1e-20], [1, 0.4], [2, 0.6]]));
    expect(mass.reduce((sum, [, probability]) => sum + probability, 0)).toBeCloseTo(1, 14);
  });

  it('does not spill excess damage from one attack to another model', () => {
    const allocation = allocateDamageMass([[3, 1]], [[1, 1]], 2, 2);
    expect(summarizeMass(allocation.usefulDamage).mean).toBe(2);
    expect(summarizeMass(allocation.modelsDestroyed).mean).toBe(1);
    expect(allocation.destroyProbability).toBe(0);
  });

  it('models a deterministic torrent weapon against armour', () => {
    const damage = summarizeMass(weaponDamageMass({
      Name: 'Flamer', Range: '12', Attacks: '6', ToHit: 'N/A', Strength: '4', AP: '0', Damage: '1', Keywords: 'TORRENT'
    }, infantry));
    expect(damage.mean).toBeCloseTo(1, 10);
    expect(damage.minimum).toBe(0);
    expect(damage.maximum).toBe(6);
  });

  it('preserves miss, hit and critical branch probabilities', () => {
    const damage = summarizeMass(weaponDamageMass({
      Name: 'Rifle', Range: '24', Attacks: '1', ToHit: '4+', Strength: '4', AP: '0', Damage: '1'
    }, infantry));
    expect(damage.mean).toBeCloseTo(1 / 12, 10);
    expect(damage.mass.reduce((sum, [, probability]) => sum + probability, 0)).toBeCloseTo(1, 12);
  });

  it('rerolls critical wounds correctly for twin-linked devastating attacks', () => {
    const damage = summarizeMass(weaponDamageMass({ Attacks: '1', ToHit: 'N/A', Strength: '1', AP: '0', Damage: '1', Keywords: 'TORRENT TWIN-LINKED DEVASTATING WOUNDS ANTI-INFANTRY 4+' }, infantry));
    expect(damage.mean).toBeCloseTo(0.75, 10);
  });

  it('uses midpoint ranks for percentile ties', () => {
    expect(percentile([1, 2, 2, 4], 2)).toMatchObject({ percentile: 50, rank: 3, median: 2 });
  });

  it('enumerates and identifies legal default and replacement configurations', () => {
    const unit: NormalizedUnit = {
      id: 'book:test:unit:0', bookId: 'book:test', sourceKey: 'test', sourceIndex: 0,
      factionName: 'Test', displayName: 'Test squad', Name: 'Test squad',
      Points: [{ ModelCount: 1, Cost: 100 }],
      UnitComposition: { ModelCompositions: [{ ModelName: 'Tester', Wargear: [{ InitalWargear: ['Rifle'], Options: [{ Replaces: ['Rifle'], Options: ['Cannon'] }] }] }] },
      Weapons: [{ Name: 'Ranged', Weapons: [
        { Name: 'Rifle', Range: '24', Attacks: '1', ToHit: '3+', Strength: '4', AP: '0', Damage: '1' },
        { Name: 'Cannon', Range: '36', Attacks: '1', ToHit: '3+', Strength: '9', AP: '-2', Damage: '3' }
      ] }]
    };
    const configurations = enumerateUnitConfigurations(unit);
    expect(configurations).toHaveLength(2);
    expect(new Set(configurations.map((configuration) => configuration.configurationHash)).size).toBe(2);
    expect(configurations.every((configuration) => configuration.warnings.length === 0)).toBe(true);
  });

  it('includes paid and detachment-gated wargear in exact configurations', () => {
    const unit: NormalizedUnit = {
      id: 'book:test:unit:1', bookId: 'book:test', sourceKey: 'test', sourceIndex: 1,
      factionName: 'Test', displayName: 'Paid squad', Name: 'Paid squad', Points: [{ ModelCount: 1, Cost: 100 }],
      UnitComposition: {
        WargearDefinitions: [{ Key: 'Cannon', Cost: 10 }],
        ModelCompositions: [{ ModelName: 'Tester', Wargear: [{ InitalWargear: ['Rifle'], Options: [{ Replaces: ['Rifle'], Options: ['Cannon'], RequiredDettachment: 'TEST FORCE' }] }] }]
      },
      Weapons: [{ Name: 'Ranged', Weapons: [
        { Name: 'Rifle', Range: '24', Attacks: '1', ToHit: '3+', Strength: '4', AP: '0', Damage: '1' },
        { Name: 'Cannon', Range: '36', Attacks: '1', ToHit: '3+', Strength: '9', AP: '-2', Damage: '3' }
      ] }]
    };
    const configurations = enumerateUnitConfigurations(unit);
    expect(configurations.map((configuration) => configuration.points).sort()).toEqual([100, 110]);
    expect(configurations.find((configuration) => configuration.points === 110)?.requiredDetachments).toEqual(['TEST FORCE']);
  });

  it('aggregates heterogeneous model profiles and separates one-shot risk metrics', () => {
    const unit: NormalizedUnit = {
      id: 'book:test:unit:2', bookId: 'book:test', sourceKey: 'test', sourceIndex: 2,
      factionName: 'Test', displayName: 'Mixed squad', Name: 'Mixed squad', Points: [{ ModelCount: 2, Cost: 100 }],
      CoreAbilities: ['Deadly Demise 1'],
      UnitComposition: { ModelCompositions: [
        { ModelName: 'Leader', Limit: { Min: 1, Max: 1 }, Wargear: [{ InitalWargear: ['Missile'] }] },
        { ModelName: 'Companion', Limit: { Min: 1, Max: 1 }, Wargear: [{ InitalWargear: [] }] }
      ] },
      StatLines: [
        { Movement: '6', Toughness: '4', Save: '3+', Wounds: '4', Leadership: '6+', OC: '2' },
        { Movement: '6', Toughness: '4', Save: '3+', Wounds: '3', Leadership: '7+', OC: '1' }
      ],
      Weapons: [{ Name: 'Ranged', Weapons: [{ Name: 'Missile', Range: '24', Attacks: '1', ToHit: '2+', Strength: '12', AP: '-3', Damage: '6', Keywords: 'ONE SHOT HAZARDOUS' }] }]
    };
    const database: NormalizedDatabase = { fingerprint: 'test', loadedAt: '', books: [], factions: [], alliesByFaction: {}, units: [unit], detachments: [], battleSizes: [] };
    const configuration = defaultUnitConfiguration(unit)!;
    const profile = calculateUnitStatisticalProfile(database, unit, configuration);
    expect(profile.characteristics.totalWounds).toBe(7);
    expect(profile.characteristics.totalObjectiveControl).toBe(3);
    expect(profile.offense.ranged.mean).toBe(0);
    expect(profile.offense.oneShotDamage.mean).toBeGreaterThan(0);
    expect(profile.offense.hazardousFailures.mean).toBeCloseTo(1 / 6, 10);
    expect(profile.unsupportedEffects).toContain('Deadly Demise 1');
  });

  it('selects one alternative mode per weapon while preserving weapons carried by different compositions', () => {
    const unit: NormalizedUnit = {
      id: 'book:test:unit:3', bookId: 'book:test', sourceKey: 'test', sourceIndex: 3, factionName: 'Test', displayName: 'Modes', Name: 'Modes',
      Points: [{ ModelCount: 2, Cost: 100 }], StatLines: [{ Movement: '6', Toughness: '4', Save: '3+', Wounds: '2', Leadership: '7+', OC: '1' }],
      UnitComposition: { ModelCompositions: [
        { ModelName: 'Gunner', Limit: { Min: 1, Max: 1 }, Wargear: [{ InitalWargear: ['Plasma'] }] },
        { ModelName: 'Fighter', Limit: { Min: 1, Max: 1 }, Wargear: [{ InitalWargear: ['Power fist'] }] }
      ] },
      Weapons: [
        { Name: 'Ranged', Weapons: [
          { Name: 'Plasma – standard', Range: '24', Attacks: '1', ToHit: '2+', Strength: '8', AP: '-3', Damage: '2' },
          { Name: 'Plasma – supercharge', Range: '24', Attacks: '1', ToHit: '2+', Strength: '9', AP: '-3', Damage: '3' }
        ] },
        { Name: 'Melee', IsMelee: true, Weapons: [{ Name: 'Power fist', Range: 'Melee', Attacks: '2', ToHit: '2+', Strength: '8', AP: '-2', Damage: '2' }] }
      ]
    };
    const database: NormalizedDatabase = { fingerprint: 'test', loadedAt: '', books: [], factions: [], alliesByFaction: {}, units: [unit], detachments: [], battleSizes: [] };
    const profile = calculateUnitStatisticalProfile(database, unit, defaultUnitConfiguration(unit)!);
    const standard = summarizeMass(weaponDamageMass(unit.Weapons![0].Weapons![0], infantry)).mean;
    const supercharge = summarizeMass(weaponDamageMass(unit.Weapons![0].Weapons![1], infantry)).mean;
    expect(profile.offense.ranged.mean).toBeCloseTo(Math.max(standard, supercharge), 10);
    expect(profile.offense.melee.mean).toBeGreaterThan(0);
  });

  it('builds playable-faction cohorts from canonical roster relationships', () => {
    const makeUnit = (id: string, sourceKey: string, factionName: string): NormalizedUnit => ({
      id, bookId: `book:${sourceKey}`, sourceKey, sourceIndex: 0, factionName, displayName: id, Name: id,
      Points: [{ ModelCount: 1, Cost: 100 }], StatLines: [{ Movement: '6', Toughness: '4', Save: '3+', Wounds: '2', Leadership: '7+', OC: '1' }],
      UnitComposition: { ModelCompositions: [{ ModelName: id, Wargear: [{ InitalWargear: [] }] }] }
    });
    const generic = makeUnit('generic', 'Space Marines', 'Space Marines'); const chapter = makeUnit('chapter', 'Ultramarines', 'Ultramarines');
    const database: NormalizedDatabase = {
      fingerprint: 'test', loadedAt: '', books: [], alliesByFaction: {}, units: [generic, chapter], detachments: [], battleSizes: [],
      factions: [
        { id: 'sm', name: 'Space Marines', sourceKey: 'Space Marines', bookIds: [], unitCount: 1, detachmentCount: 0 },
        { id: 'ultra', name: 'Ultramarines', sourceKey: 'Ultramarines', bookIds: [], unitCount: 1, detachmentCount: 0 }
      ], primaryRostersByFaction: { sm: ['Space Marines'], ultra: ['Space Marines', 'Ultramarines'] }
    };
    const profiles = attachBenchmarks([generic, chapter].map((unit) => calculateUnitStatisticalProfile(database, unit, defaultUnitConfiguration(unit)!)), new Set(['ultra']), database);
    const chapterFaction = profiles.find((profile) => profile.unitId === 'chapter')!.benchmarks.find((benchmark) => benchmark.cohort === 'faction' && benchmark.metric === 'damageEfficiency');
    const chapterPlaygroup = profiles.find((profile) => profile.unitId === 'chapter')!.benchmarks.find((benchmark) => benchmark.cohort === 'playgroup' && benchmark.metric === 'damageEfficiency');
    expect(chapterFaction).toMatchObject({ cohortId: 'ultra', sampleSize: 2 });
    expect(chapterPlaygroup?.sampleSize).toBe(2);
  });
});
