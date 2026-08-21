import { describe, expect, it } from 'vitest';
import type { NormalizedDatabase, RosterDraft } from '../../domain/types';
import { normalizeDatabase } from '../../domain/normalize';
import catalogRaw from '../../../public/data/catalog.json?raw';
import { approvedM4RosterPilotProposal, M4ApprovedRosterSimulationAdapter, WarforgeRosterSimulationAdapter } from './roster-adapter';

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

const m4Database = normalizeDatabase(catalogRaw);
const m4Pilots = approvedM4RosterPilotProposal.rosters.map((roster) => structuredClone(roster.draft));
const expectedModelIds: Readonly<Record<string, readonly string[]>> = {
  'real-roster-salamanders-pilot-v1': [
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-assault-intercessors-v1:c0:model:0',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-assault-intercessors-v1:c1:model:0',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-assault-intercessors-v1:c1:model:1',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-assault-intercessors-v1:c1:model:2',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-assault-intercessors-v1:c1:model:3',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-bladeguard-veterans-v1:c0:model:0',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-bladeguard-veterans-v1:c1:model:0',
    'm4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-bladeguard-veterans-v1:c1:model:1'
  ],
  'real-roster-blood-angels-pilot-v1': [
    'm4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-assault-intercessors-v1:c0:model:0',
    'm4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-assault-intercessors-v1:c1:model:0',
    'm4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-assault-intercessors-v1:c1:model:1',
    'm4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-assault-intercessors-v1:c1:model:2',
    'm4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-assault-intercessors-v1:c1:model:3',
    'm4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-captain-v1:c0:model:0'
  ]
};

function m4Adapter(database: NormalizedDatabase = m4Database): M4ApprovedRosterSimulationAdapter {
  return new M4ApprovedRosterSimulationAdapter(database);
}

function refusalCodes(draft: RosterDraft, database: NormalizedDatabase = m4Database): string[] {
  return m4Adapter(database).adapt(draft).refusals?.map((refusal) => refusal.code) ?? [];
}

describe('M4 approved roster compiler', () => {
  it('accepts exactly both approved pilots and derives globally stable model identities from roster, item and composition identity', () => {
    for (const pilot of m4Pilots) {
      const result = m4Adapter().adapt(pilot);
      expect(result).toMatchObject({ rosterId: pilot.id, missingCoverage: [], coverageStatus: 'not-assessed', refusals: [] });
      expect(result.modelIds).toEqual(expectedModelIds[pilot.id]);
      expect(new Set(result.modelIds).size).toBe(result.modelIds.length);

      const reordered = structuredClone(pilot);
      reordered.items.reverse();
      expect(m4Adapter().adapt(reordered).modelIds).toEqual(result.modelIds);
    }
  });

  it('refuses a changed or unknown unit and never emits partial model identifiers', () => {
    const changed = structuredClone(m4Pilots[0]);
    changed.items[0].unitId = 'book-space-marines:unit:999';
    const result = m4Adapter().adapt(changed);
    expect(result.modelIds).toEqual([]);
    expect(result.refusals).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'unit-mismatch' })]));
  });

  it('refuses point-size and composition-count divergence', () => {
    const changed = structuredClone(m4Pilots[0]);
    changed.items[0].pointIndex = 1;
    changed.items[0].modelCounts = { ...changed.items[0].modelCounts, c1: 3 };
    expect(refusalCodes(changed)).toEqual(expect.arrayContaining(['point-index-mismatch', 'model-count-mismatch']));
  });

  it('refuses any additional or missing roster and item field', () => {
    const additionalRosterField = structuredClone(m4Pilots[0]) as unknown as Record<string, unknown>;
    additionalRosterField.unapprovedContext = 'ignored fields are forbidden';
    expect(m4Adapter().adapt(additionalRosterField as unknown as RosterDraft)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'roster-shape-mismatch' })]) });

    const additionalItemField = structuredClone(m4Pilots[0]);
    (additionalItemField.items[0] as unknown as Record<string, unknown>).figurePreference = 'proxy';
    (additionalItemField.items[0] as unknown as Record<string, unknown>).preferredProxySourceId = 'unapproved-proxy';
    expect(m4Adapter().adapt(additionalItemField)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'roster-item-shape-mismatch' })]) });
  });

  it('uses only the immutable, built-in approved proposal', () => {
    expect(Object.isFrozen(approvedM4RosterPilotProposal)).toBe(true);
    expect(Object.isFrozen(approvedM4RosterPilotProposal.rosters)).toBe(true);
    expect(Object.isFrozen(approvedM4RosterPilotProposal.rosters[0].draft)).toBe(true);

    const substituted = structuredClone(approvedM4RosterPilotProposal);
    substituted.rosters[0].draft.id = 'substituted-pilot';
    type ConstructorWithIgnoredProposal = new (database: NormalizedDatabase, proposal: unknown) => M4ApprovedRosterSimulationAdapter;
    const adapter = new (M4ApprovedRosterSimulationAdapter as unknown as ConstructorWithIgnoredProposal)(m4Database, substituted);
    expect(adapter.adapt(substituted.rosters[0].draft)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'roster-identity' })]) });
  });

  it('refuses elected and malformed wargear maps instead of treating them as a default loadout', () => {
    const elected = structuredClone(m4Pilots[0]);
    elected.items[0].wargearSelectionCounts = { 'c0:0': { 'Plasma pistol': 1 } };
    expect(refusalCodes(elected)).toContain('elected-wargear');

    const malformed = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    (malformed.items[0] as unknown as Record<string, unknown>).wargearSelections = 'not-a-map';
    expect(refusalCodes(malformed)).toContain('malformed-wargear');

    const mapBacked = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    (mapBacked.items[0] as unknown as Record<string, unknown>).wargearSelections = new Map([['selected', 'Plasma pistol']]);
    expect(m4Adapter().adapt(mapBacked)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-wargear' })]) });

    const inherited = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    (inherited.items[0] as unknown as Record<string, unknown>).wargearSelections = Object.create({ selected: 'Plasma pistol' });
    expect(m4Adapter().adapt(inherited)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-wargear' })]) });

    const countMap = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    (countMap.items[0] as unknown as Record<string, unknown>).wargearSelectionCounts = new Map([['selected', 1]]);
    expect(m4Adapter().adapt(countMap)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-wargear' })]) });
  });

  it('refuses behaviour-bearing item containers without invoking their methods or accessors', () => {
    const serialized = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    Object.assign(serialized.items, { toJSON: () => { throw new Error('must not be called'); } });
    expect(m4Adapter().adapt(serialized)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-roster' })]) });

    const accessor = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    const approvedItem = accessor.items[0];
    Object.defineProperty(accessor.items, '0', { configurable: true, enumerable: true, get: () => approvedItem });
    expect(m4Adapter().adapt(accessor)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-roster' })]) });

    const callback = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    callback.items.length = 0;
    Object.assign(callback.items, { forEach: (visit: (item: RosterDraft['items'][number]) => void) => m4Pilots[0].items.forEach(visit) });
    expect(m4Adapter().adapt(callback)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-roster' })]) });
  });

  it('compares default equipment to the approved frozen loadout rather than inventing one from empty maps', () => {
    const staleLoadoutDatabase = structuredClone(m4Database);
    const unit = staleLoadoutDatabase.units.find((candidate) => candidate.id === m4Pilots[0].items[0].unitId);
    if (!unit?.UnitComposition?.ModelCompositions?.[0]?.Wargear?.[0]?.InitalWargear) throw new Error('Fixture catalog unexpectedly lacks default wargear.');
    unit.UnitComposition.ModelCompositions[0].Wargear[0].InitalWargear[0] = 'Invented boltgun';
    staleLoadoutDatabase.fingerprint = 'fnv1a-stale-loadout';

    const result = m4Adapter(staleLoadoutDatabase).adapt(m4Pilots[0]);
    expect(result.modelIds).toEqual([]);
    expect(result.refusals).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'catalog-stale' }),
      expect.objectContaining({ code: 'default-equipment-mismatch' })
    ]));
  });

  it('refuses faction, scenario and detachment divergence exhaustively', () => {
    const changed = structuredClone(m4Pilots[1]);
    changed.primaryFaction = 'Salamanders';
    changed.scenario = 'OTHER';
    changed.detachmentIds = [];
    expect(refusalCodes(changed)).toEqual(expect.arrayContaining(['faction-mismatch', 'scenario-mismatch', 'detachment-mismatch']));

    const serializedDetachment = structuredClone(m4Pilots[1]) as unknown as RosterDraft;
    (serializedDetachment as unknown as Record<string, unknown>).detachmentIds = Object.assign([], { toJSON: () => m4Pilots[1].detachmentIds });
    expect(m4Adapter().adapt(serializedDetachment)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'detachment-mismatch' })]) });

    const inheritedSerializer = structuredClone(m4Pilots[1]) as unknown as RosterDraft;
    Object.setPrototypeOf(inheritedSerializer.detachmentIds, { toJSON: () => m4Pilots[1].detachmentIds });
    expect(m4Adapter().adapt(inheritedSerializer)).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'detachment-mismatch' })]) });
  });

  it('fails closed if global prototype pollution makes imported maps ambiguous', () => {
    Object.defineProperty(Object.prototype, 'selected', { configurable: true, get: () => 'Plasma pistol' });
    try {
      expect(m4Adapter().adapt(structuredClone(m4Pilots[0]))).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-roster' })]) });
    } finally {
      delete (Object.prototype as Record<string, unknown>).selected;
    }
  });

  it('fails closed when native prototypes are modified after the compiler is loaded', () => {
    const originalArrayToJSON = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');
    Object.defineProperty(Array.prototype, 'toJSON', { configurable: true, value: () => [] });
    let arrayPollutedResult;
    try {
      arrayPollutedResult = m4Adapter().adapt(structuredClone(m4Pilots[0]));
    } finally {
      if (originalArrayToJSON) Object.defineProperty(Array.prototype, 'toJSON', originalArrayToJSON);
      else delete (Array.prototype as unknown as Record<string, unknown>).toJSON;
    }
    expect(arrayPollutedResult).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'detachment-mismatch' })]) });

    const originalHasOwnProperty = Object.getOwnPropertyDescriptor(Object.prototype, 'hasOwnProperty');
    Object.defineProperty(Object.prototype, 'hasOwnProperty', { configurable: true, value: () => false });
    let objectPollutedResult;
    try {
      const forged = structuredClone(m4Pilots[0]) as unknown as Record<string, unknown>;
      forged.toJSON = () => m4Pilots[0];
      objectPollutedResult = m4Adapter().adapt(forged as unknown as RosterDraft);
    } finally {
      if (!originalHasOwnProperty) throw new Error('Object.prototype.hasOwnProperty must exist.');
      Object.defineProperty(Object.prototype, 'hasOwnProperty', originalHasOwnProperty);
    }
    expect(objectPollutedResult).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'malformed-roster' })]) });

    const originalIterator = Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator);
    Object.defineProperty(Array.prototype, Symbol.iterator, { configurable: true, value: function* repeatFirst<T>(this: readonly T[]): Generator<T> {
      if (this.length > 0) yield this[0];
      for (let index = 0; index < this.length; index += 1) yield this[index];
    } });
    let iteratorPollutedResult;
    try {
      iteratorPollutedResult = m4Adapter().adapt(structuredClone(m4Pilots[0]));
    } finally {
      if (!originalIterator) throw new Error('Array.prototype[Symbol.iterator] must exist.');
      Object.defineProperty(Array.prototype, Symbol.iterator, originalIterator);
    }
    expect(iteratorPollutedResult).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'detachment-mismatch' })]) });

    const originalStringify = JSON.stringify;
    JSON.stringify = () => 'same';
    let stringifierPollutedResult;
    try {
      const divergent = structuredClone(m4Pilots[0]);
      divergent.detachmentIds = ['foreign-detachment'];
      stringifierPollutedResult = m4Adapter().adapt(divergent);
    } finally {
      JSON.stringify = originalStringify;
    }
    expect(stringifierPollutedResult).toMatchObject({ modelIds: [], refusals: expect.arrayContaining([expect.objectContaining({ code: 'detachment-mismatch' })]) });
  });

  it('refuses missing, extra, duplicate and malformed roster items', () => {
    const missing = structuredClone(m4Pilots[0]);
    missing.items.pop();
    expect(refusalCodes(missing)).toContain('roster-item-missing');

    const extra = structuredClone(m4Pilots[0]);
    extra.items.push({ ...structuredClone(extra.items[0]), id: 'foreign-item' });
    expect(refusalCodes(extra)).toContain('roster-item-extra');

    const duplicate = structuredClone(m4Pilots[0]);
    duplicate.items.push(structuredClone(duplicate.items[0]));
    expect(refusalCodes(duplicate)).toContain('roster-item-duplicate');

    const malformed = structuredClone(m4Pilots[0]) as unknown as RosterDraft;
    (malformed as unknown as Record<string, unknown>).items = [null];
    expect(refusalCodes(malformed)).toEqual(expect.arrayContaining(['malformed-roster-item', 'roster-item-missing']));
  });

  it('refuses stale catalog identity and a roster outside the approved pilot pair without throwing', () => {
    const stale = { ...m4Database, fingerprint: 'fnv1a-stale' };
    expect(refusalCodes(m4Pilots[0], stale)).toContain('catalog-stale');

    const unknown = structuredClone(m4Pilots[0]);
    unknown.id = 'not-an-m4-pilot';
    const result = m4Adapter().adapt(unknown);
    expect(result).toMatchObject({ modelIds: [], missingCoverage: [] });
    expect(result.refusals).toEqual([expect.objectContaining({ code: 'roster-identity' })]);
  });
});
