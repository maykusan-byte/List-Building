import { describe, expect, it } from 'vitest';
import type { NormalizedDatabase, RosterDraft } from '../../domain/types';
import { WarforgeRosterSimulationAdapter } from './roster-adapter';

const database: NormalizedDatabase = {
  fingerprint: 'fp', loadedAt: '', books: [], factions: [], alliesByFaction: {}, detachments: [], battleSizes: [],
  units: [{ id: 'u1', bookId: 'b', sourceKey: 's', factionName: 'Test', sourceIndex: 0, displayName: 'Training Unit',
    Points: [{ ModelCount: 2, Cost: 20 }],
    UnitComposition: { ModelCompositions: [{ ModelName: 'Trooper', Limit: { Min: 2, Max: 2 }, Wargear: [{ InitalWargear: ['Training rifle'] }] }] },
    Weapons: [{ Name: 'Ranged', Weapons: [{ Name: 'Training rifle', Range: '24"', Attacks: '1', ToHit: '3+', Strength: '4', AP: '0', Damage: '1' }] }],
    UnitAbilities: [{ Title: 'Training drill', Text: 'Test.' }] }]
};

const draft: RosterDraft = { id: 'roster', name: 'Roster', primaryFaction: 'Test', battleSizePoints: 100, scenario: '', detachmentIds: [], items: [{ id: 'item', unitId: 'u1', pointIndex: 0, wargearSelections: {} }] };

describe('Warforge roster compatibility adapter', () => {
  it('returns every missing coverage category without silently accepting the roster', () => {
    const result = new WarforgeRosterSimulationAdapter(database, { version: 'v1', coveredSubjectIds: new Set() }).adapt(draft);
    expect(result.modelIds).toEqual(['item:model:0', 'item:model:1']);
    expect(result.missingCoverage.map((entry) => entry.subjectType)).toEqual(['rule', 'physical-profile', 'unit', 'weapon']);
  });

  it('accepts only when every discovered subject is covered', () => {
    const ids = new Set(['unit:u1', 'physical-profile:u1', 'weapon:training-rifle', 'ability:u1:training-drill']);
    expect(new WarforgeRosterSimulationAdapter(database, { version: 'v1', coveredSubjectIds: ids }).adapt(draft).missingCoverage).toEqual([]);
  });
});
