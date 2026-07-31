import { describe, expect, it } from 'vitest';
import { isUnitImageManifest, unitImageMap, unitImageUrl } from './unit-images';
import type { NormalizedDatabase } from './types';

const database = {
  fingerprint: 'catalog-test',
  units: [{ id: 'book-space-marines:unit:0' }, { id: 'book-space-marines:unit:1' }]
} as unknown as NormalizedDatabase;

const entry = {
  unitId: 'book-space-marines:unit:0',
  asset: 'img/units/captain-gravis.webp',
  productName: 'Captain in Gravis Armour',
  sourceUrl: 'https://www.warhammer.com/example',
  sourceLabel: 'Warhammer.com product media',
  licenseReference: 'Approved project licence',
  retrievedAt: '2026-07-31'
};

describe('unit image manifest', () => {
  it('accepts a fingerprinted manifest with catalog unit ids', () => {
    const manifest = { schemaVersion: 'warforge-unit-images/v1' as const, databaseFingerprint: 'catalog-test', generatedAt: '2026-07-31T00:00:00.000Z', entries: [entry] };
    expect(isUnitImageManifest(manifest, database)).toBe(true);
    expect(unitImageMap(manifest).get(entry.unitId)).toEqual(entry);
    expect(unitImageUrl(entry, 'https://example.test/List-Building/data/')).toBe('https://example.test/List-Building/data/img/units/captain-gravis.webp');
  });

  it('rejects mismatched catalogs, duplicate ids, unsafe assets and unknown units', () => {
    expect(isUnitImageManifest({ schemaVersion: 'warforge-unit-images/v1', databaseFingerprint: 'other', generatedAt: 'today', entries: [entry] }, database)).toBe(false);
    expect(isUnitImageManifest({ schemaVersion: 'warforge-unit-images/v1', databaseFingerprint: 'catalog-test', generatedAt: 'today', entries: [entry, entry] }, database)).toBe(false);
    expect(isUnitImageManifest({ schemaVersion: 'warforge-unit-images/v1', databaseFingerprint: 'catalog-test', generatedAt: 'today', entries: [{ ...entry, asset: '../captain.webp' }] }, database)).toBe(false);
    expect(isUnitImageManifest({ schemaVersion: 'warforge-unit-images/v1', databaseFingerprint: 'catalog-test', generatedAt: 'today', entries: [{ ...entry, unitId: 'unknown' }] }, database)).toBe(false);
  });
});
