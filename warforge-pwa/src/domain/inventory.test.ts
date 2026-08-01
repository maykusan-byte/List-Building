import { describe, expect, it } from 'vitest';
import { allocateInventory, getInventoryAvailability, hasFreeInventory, parseInventoryCsv } from './inventory';
import type { NormalizedDatabase, RosterItem } from './types';

const unitA = 'book-0-test:unit:0';
const unitB = 'book-0-test:unit:1';
const unitC = 'book-0-test:unit:2';

const database: NormalizedDatabase = {
  fingerprint: 'fnv1a-test-1',
  loadedAt: '2026-07-30T00:00:00.000Z',
  books: [],
  factions: [],
  alliesByFaction: {},
  detachments: [],
  battleSizes: [],
  units: [
    { id: unitA, bookId: 'book-0-test', sourceKey: 'Test', factionName: 'Test', sourceIndex: 0, displayName: 'Alpha', Points: [{ ModelCount: 2, Cost: 100 }] },
    { id: unitB, bookId: 'book-0-test', sourceKey: 'Test', factionName: 'Test', sourceIndex: 1, displayName: 'Beta', Points: [{ ModelCount: 1, Cost: 50 }] },
    { id: unitC, bookId: 'book-0-test', sourceKey: 'Test', factionName: 'Test', sourceIndex: 2, displayName: 'Gamma', Points: [{ ModelCount: 1, Cost: 50 }] }
  ]
};

function csv(lines: string[]): string {
  return [
    'DatabaseFingerprint,UnitId,ID_figurine,Type,Nom_datasheet,Commentaire',
    ...lines
  ].join('\n');
}

function item(id: string, unitId: string): RosterItem {
  return { id, unitId, pointIndex: 0, wargearSelections: {} };
}

describe('inventory CSV', () => {
  it('ignores Nom_datasheet and every non-contractual column', () => {
    const first = parseInventoryCsv(csv([`${database.fingerprint},${unitA},1,real,Nom historique,alpha`]), database, 'test');
    const renamed = parseInventoryCsv(csv([`${database.fingerprint},${unitA},1,real,Texte totalement différent,beta`]), database, 'test');

    expect(renamed.entries).toEqual(first.entries);
  });

  it('rejects incompatible fingerprints, invalid UnitId and duplicate physical associations', () => {
    expect(() => parseInventoryCsv(csv([`other,${unitA},1,real,x`]), database, 'test')).toThrow('DatabaseFingerprint incompatible');
    expect(() => parseInventoryCsv(csv([`${database.fingerprint},unknown,1,real,x`]), database, 'test')).toThrow('UnitId inconnu');
    expect(() => parseInventoryCsv(csv([
      `${database.fingerprint},${unitA},1,real,x`,
      `${database.fingerprint},${unitA},1,proxy,y`
    ]), database, 'test')).toThrow('doublon ID_figurine + UnitId');
  });

  it('allows the same real miniature for distinct UnitId then reserves it only once', () => {
    const inventory = parseInventoryCsv(csv([
      `${database.fingerprint},${unitA},1,real,Alpha`,
      `${database.fingerprint},${unitA},2,proxy,Alpha`,
      `${database.fingerprint},${unitB},1,real,Beta`,
      `${database.fingerprint},${unitB},3,real,Beta`
    ]), database, 'test');
    const allocation = allocateInventory(database, [item('alpha', unitA), item('beta', unitB)], inventory);

    expect(allocation.reservationsByItemId.get('alpha')).toMatchObject({ realFigureIds: [1], proxyFigureIds: [2], missing: 0 });
    expect(allocation.reservationsByItemId.get('beta')).toMatchObject({ realFigureIds: [3], proxyFigureIds: [], missing: 0 });
    expect(getInventoryAvailability(inventory, allocation, unitA)).toEqual({ hasCatalogEntry: true, real: 0, proxy: 0, used: 2, total: 2 });
    expect(getInventoryAvailability(inventory, allocation, unitC)).toEqual({ hasCatalogEntry: false, real: 0, proxy: 0, used: 0, total: 0 });
  });

  it('allocates every real association before any proxy association globally', () => {
    const inventory = parseInventoryCsv(csv([
      `${database.fingerprint},${unitA},1,proxy,Alpha`,
      `${database.fingerprint},${unitA},2,proxy,Alpha`,
      `${database.fingerprint},${unitB},1,real,Beta`
    ]), database, 'test');
    const allocation = allocateInventory(database, [item('alpha', unitA), item('beta', unitB)], inventory);

    expect(allocation.reservationsByItemId.get('beta')).toMatchObject({ realFigureIds: [1], missing: 0 });
    expect(allocation.reservationsByItemId.get('alpha')).toMatchObject({ proxyFigureIds: [2], missing: 1 });
  });

  it('reports a non-blocking stock shortfall for a variable unit size', () => {
    const inventory = parseInventoryCsv(csv([`${database.fingerprint},${unitA},2,proxy,Alpha`]), database, 'test');
    const allocation = allocateInventory(database, [item('alpha', unitA)], inventory);

    expect(allocation.reservationsByItemId.get('alpha')).toMatchObject({ realFigureIds: [], proxyFigureIds: [2], missing: 1 });
  });

  it('identifies units with at least one free real or proxy miniature', () => {
    const inventory = parseInventoryCsv(csv([
      `${database.fingerprint},${unitA},1,real,Alpha`,
      `${database.fingerprint},${unitA},2,proxy,Alpha`,
      `${database.fingerprint},${unitB},3,proxy,Beta`
    ]), database, 'test');
    const emptyAllocation = allocateInventory(database, [], inventory);
    const reservedAllocation = allocateInventory(database, [item('alpha', unitA)], inventory);

    expect(hasFreeInventory(inventory, emptyAllocation, unitA)).toBe(true);
    expect(hasFreeInventory(inventory, emptyAllocation, unitB)).toBe(true);
    expect(hasFreeInventory(inventory, emptyAllocation, unitC)).toBe(false);
    expect(hasFreeInventory(inventory, reservedAllocation, unitA)).toBe(false);
    expect(hasFreeInventory(null, emptyAllocation, unitA)).toBe(false);
  });
});
