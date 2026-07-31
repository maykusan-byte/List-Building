import { describe, expect, it } from 'vitest';
import { createCatalogLocalization, isCatalogLocaleOverlay } from './catalog-localization';
import { normalizeDatabase } from './normalize';

const database = normalizeDatabase(JSON.stringify({
  SchemaVersion: 'warforge-catalog/v2',
  BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
  Books: [{ SourceKey: 'Example faction', Name: 'Imperial Agents', Units: [{ Name: 'TEST SQUAD', Keywords: ['Infantry', 'Deep Strike'], Points: [{ ModelCount: 5, Cost: 100 }] }], Dettachments: [{ Name: 'TEST FORCE' }] }]
}));

describe('catalog localization', () => {
  it('renders official overlay values without changing canonical unit data', () => {
    const unit = database.units[0];
    const overlay = {
      schemaVersion: 'warforge-catalog-locale/v1' as const,
      locale: 'fr' as const,
      catalogFingerprint: database.fingerprint,
      provenance: { kind: 'official-terminology' as const, source: 'https://mfm.warhammer-community.com/fr', version: 'test', retrievedAt: '2026-07-31', scope: 'test' },
      factions: { 'Imperial Agents': 'Agents Impériaux' },
      terms: { Infantry: 'Infanterie', 'Deep Strike': 'Frappe en profondeur' },
      units: { 'Example faction::0': { name: 'ESCOUADE TEST' } },
      detachments: {}
    };
    const display = createCatalogLocalization('fr', overlay, 'ready');

    expect(display.unitName(unit)).toBe('ESCOUADE TEST');
    expect(display.factionName(unit.factionName)).toBe('Agents Impériaux');
    expect(display.term('Deep Strike')).toBe('Frappe en profondeur');
    expect(display.searchTerms(unit)).toEqual(expect.arrayContaining(['TEST SQUAD', 'ESCOUADE TEST', 'Infantry', 'Infanterie']));
    expect(unit.Name).toBe('TEST SQUAD');
    expect(unit.Points?.[0].Cost).toBe(100);
  });

  it('rejects a localized catalog with a different fingerprint and falls back to raw English', () => {
    const overlay = {
      schemaVersion: 'warforge-catalog-locale/v1', locale: 'fr', catalogFingerprint: 'wrong', provenance: { kind: 'official-terminology', source: 'source', version: 'test', retrievedAt: 'today', scope: 'test' }
    };
    expect(isCatalogLocaleOverlay(overlay, database)).toBe(false);
    expect(createCatalogLocalization('fr', null, 'incompatible').unitName(database.units[0])).toBe('TEST SQUAD');
  });
});
