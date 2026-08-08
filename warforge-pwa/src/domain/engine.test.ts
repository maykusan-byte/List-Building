import { describe, expect, it } from 'vitest';
import { calculateItemCost, enhancementIsEligible, getDetachmentCost, getPointSizes, getSelectedDetachments, resolvePointOption } from './calculations';
import { isUnitAvailableToFaction } from './catalog';
import { normalizeDatabase } from './normalize';
import type { RosterDraft } from './types';
import { validateDraft } from './validation';

const rawDatabase = JSON.stringify([
  {
    Name: 'Test Faction',
    BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
    Units: [{
      Name: 'TEST WARRIORS',
      Keywords: ['Infantry', 'Character'],
      Points: [{ ModelCount: 5, Cost: 100 }],
      UnitComposition: { WargearDefinitions: [{ Key: 'Plasma lance', Cost: 15 }] }
    }],
    Dettachments: [{
      Name: 'TEST FORCE',
      Cost: 2,
      ForceDispositions: ['TAKE AND HOLD'],
      Enhancements: [{ Name: 'Veteran', Cost: 10, RequiredKeywords: ['Character'] }],
      Effects: [{ AffectedUnits: ['TEST WARRIORS'], PointsOverride: [{ ModelCount: 5, Cost: 120 }] }]
    }]
  },
  {
    Name: 'Test Faction',
    Units: [{ Name: 'TEST WARRIORS', Points: [{ ModelCount: 5, Cost: 110 }] }],
    Dettachments: [{
      Name: 'WRATH OF THE ROCK',
      Cost: 1,
      ForceDispositions: ['PURGE THE FOE']
    }]
  }
]);

function makeDraft(): { database: ReturnType<typeof normalizeDatabase>; draft: RosterDraft } {
  const database = normalizeDatabase(rawDatabase);
  const unit = database.units[0];
  const detachment = database.detachments[0];
  return {
    database,
    draft: {
      id: 'draft',
      name: 'Test',
      primaryFaction: 'Test Faction',
      battleSizePoints: 1000,
      scenario: 'TAKE AND HOLD',
      detachmentIds: [detachment.id],
      items: [{
        id: 'item',
        unitId: unit.id,
        pointIndex: 0,
        wargearSelections: { weapon: 'Plasma lance' },
        enhancement: { detachmentId: detachment.id, enhancementIndex: 0 }
      }]
    }
  };
}

describe('Warforge data engine', () => {
  it('creates collision-free identifiers while merging faction labels', () => {
    const database = normalizeDatabase(rawDatabase);
    expect(new Set(database.units.map((unit) => unit.id)).size).toBe(2);
    expect(database.factions).toHaveLength(1);
    expect(database.factions[0]).toMatchObject({ name: 'Test Faction', unitCount: 2 });
  });

  it('repairs Windows-1252 mojibake while importing database text', () => {
    const encodedDatabase = rawDatabase.replace('TEST FORCE', 'LIONâ€™S BLADE TASK FORCE');
    expect(normalizeDatabase(encodedDatabase).detachments[0].displayName).toBe('LION’S BLADE TASK FORCE');
  });

  it('uses a matching detachment override before paid wargear and enhancement', () => {
    const { database, draft } = makeDraft();
    const calculation = calculateItemCost(database, draft.items[0], draft.items, draft.detachmentIds);
    expect(calculation).toMatchObject({ base: 100, pointOverride: 120, wargear: 15, enhancement: 10, total: 145 });
  });

  it('treats a missing detachment cost as the standard 1 DP', () => {
    const { database, draft } = makeDraft();
    const onePointDetachment = database.detachments[1];
    const withBothDetachments = { ...draft, detachmentIds: database.detachments.map((detachment) => detachment.id) };

    expect(getDetachmentCost(onePointDetachment)).toBe(1);
    expect(validateDraft(database, withBothDetachments)).toContainEqual(expect.objectContaining({
      id: 'detachment-budget',
      message: 'Budget de détachements dépassé : 3/2 DP.'
    }));
  });

  it('keeps WRATH OF THE ROCK in the selected detachment list', () => {
    const { database } = makeDraft();
    const wrathOfTheRock = database.detachments[1];

    expect(getSelectedDetachments(database, [wrathOfTheRock.id])).toEqual([wrathOfTheRock]);
  });

  it('allows any scenario linked to one of the selected detachments', () => {
    const { database, draft } = makeDraft();
    expect(enhancementIsEligible(database.units[0], database.detachments[0].Enhancements![0])).toBe(true);
    const selectedDetachments = [...draft.detachmentIds, database.detachments[1].id];
    const compatible = { ...draft, detachmentIds: selectedDetachments, scenario: 'PURGE THE FOE' };
    expect(validateDraft(database, compatible).some((issue) => issue.id === 'scenario-detachments' && issue.level === 'error')).toBe(false);

    const incompatible = { ...draft, scenario: 'PURGE THE FOE' };
    expect(validateDraft(database, incompatible).some((issue) => issue.id === 'scenario-detachments' && issue.level === 'error')).toBe(true);
  });

  it('keeps allied sources distinct and resolves UnitCount as an occurrence threshold', () => {
    const database = normalizeDatabase(JSON.stringify({
      SchemaVersion: 'warforge-catalog/v2',
      BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
      FactionInfo: { Factions: [{ Name: 'Main', FactionKeyword: 'Main', Allies: [{ FactionKeyword: 'Allies' }] }, { Name: 'Allies', FactionKeyword: 'Allies' }] },
      Books: [
        { Name: 'Main', SourceKey: 'Main', Units: [{ Name: 'THRESHOLD UNIT', Points: [{ ModelCount: 5, UnitCount: 2, Cost: 75 }, { ModelCount: 5, UnitCount: 3, Cost: 85 }, { ModelCount: 10, UnitCount: 2, Cost: 150 }, { ModelCount: 10, UnitCount: 3, Cost: 170 }] }], Dettachments: [{ Name: 'MAIN FORCE', ForceDispositions: ['TAKE AND HOLD'], Effects: [{ AffectedUnits: ['THRESHOLD UNIT'], PointsOverride: [{ ModelCount: 5, UnitCount: 2, Cost: 95 }, { ModelCount: 5, UnitCount: 3, Cost: 105 }] }] }] },
        { Name: 'Allies', SourceKey: 'Allies', Units: [{ Name: 'ALLY UNIT', Points: [{ ModelCount: 1, Cost: 50 }] }], Dettachments: [{ Name: 'ALLY FORCE' }] }
      ]
    }));
    const main = database.units.find((unit) => unit.displayName === 'THRESHOLD UNIT')!;
    const ally = database.units.find((unit) => unit.displayName === 'ALLY UNIT')!;
    const items = [0, 1, 2, 3].map((index) => ({ id: `copy-${index}`, unitId: main.id, pointIndex: index === 1 ? 1 : 0, wargearSelections: {} }));

    expect(database.detachments.filter((detachment) => detachment.sourceKey === 'Main')).toHaveLength(1);
    expect(isUnitAvailableToFaction(database, 'Main', ally)).toBe(true);
    expect(getPointSizes(main)).toHaveLength(2);
    expect(resolvePointOption(main, 0, 1)?.cost).toBe(75);
    expect(resolvePointOption(main, 0, 2)?.cost).toBe(75);
    expect(resolvePointOption(main, 0, 3)?.cost).toBe(85);
    expect(resolvePointOption(main, 0, 4)?.cost).toBe(85);
    expect(calculateItemCost(database, items[1], items, []).base).toBe(150);
    expect(calculateItemCost(database, items[2], items, []).base).toBe(85);
    expect(calculateItemCost(database, items[2], items, [database.detachments[0].id])).toMatchObject({ pointOverride: 105, total: 105 });
  });

  it('includes subfaction units and detachments in primary roster when IsIncludedInPrimaryRoster is true', () => {
    const database = normalizeDatabase(JSON.stringify({
      SchemaVersion: 'warforge-catalog/v2',
      BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
      FactionInfo: {
        Factions: [
          { Name: 'Space Marines', FactionKeyword: 'Adeptus Astartes', Allies: [{ FactionKeyword: 'Salamanders', IsIncludedInPrimaryRoster: true }] },
          { Name: 'Salamanders', FactionKeyword: 'Salamanders', Allies: [{ FactionKeyword: 'Adeptus Astartes', IsIncludedInPrimaryRoster: true }] }
        ]
      },
      Books: [
        { Name: 'Space Marines', SourceKey: 'Space Marines', Units: [{ Name: 'INTERCESSOR SQUAD', Points: [{ ModelCount: 5, Cost: 80 }] }], Dettachments: [{ Name: 'GLADIUS TASK FORCE' }] },
        { Name: 'Salamanders', SourceKey: 'Salamanders', Units: [{ Name: 'ADRAX AGATONE', FactionKeywords: ['Salamanders'], Points: [{ ModelCount: 1, Cost: 85 }] }], Dettachments: [{ Name: 'FORGEFATHER’S SEEKERS' }] }
      ]
    }));

    const adrax = database.units.find((u) => u.displayName === 'ADRAX AGATONE')!;
    expect(isUnitAvailableToFaction(database, 'Space Marines', adrax)).toBe(true);

    const smDetachments = database.detachments.filter((d) => database.primaryRostersByFaction?.['Space Marines']?.includes(d.sourceKey));
    expect(smDetachments.map((d) => d.displayName)).toEqual(['GLADIUS TASK FORCE', 'FORGEFATHER’S SEEKERS']);
  });
});
