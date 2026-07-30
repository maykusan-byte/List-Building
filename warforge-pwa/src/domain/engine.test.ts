import { describe, expect, it } from 'vitest';
import { calculateItemCost, enhancementIsEligible, getDetachmentCost } from './calculations';
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
      Name: 'TEST RAID',
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
    const calculation = calculateItemCost(database, draft.items[0], draft.detachmentIds);
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

  it('allows any scenario linked to one of the selected detachments', () => {
    const { database, draft } = makeDraft();
    expect(enhancementIsEligible(database.units[0], database.detachments[0].Enhancements![0])).toBe(true);
    const selectedDetachments = [...draft.detachmentIds, database.detachments[1].id];
    const compatible = { ...draft, detachmentIds: selectedDetachments, scenario: 'PURGE THE FOE' };
    expect(validateDraft(database, compatible).some((issue) => issue.id === 'scenario-detachments' && issue.level === 'error')).toBe(false);

    const incompatible = { ...draft, scenario: 'PURGE THE FOE' };
    expect(validateDraft(database, incompatible).some((issue) => issue.id === 'scenario-detachments' && issue.level === 'error')).toBe(true);
  });
});
