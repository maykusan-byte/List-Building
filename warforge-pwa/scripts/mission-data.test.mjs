import { describe, expect, it } from 'vitest';
import { loadValidatedMissionCatalog, validateGdMissionsArchive, validateMissionCatalog } from './mission-data.mjs';

const validSummaryPack = {
  schemaVersion: 'warforge-mission-packs/v1',
  activePackId: 'pack',
  packs: [{
    id: 'pack',
    title: 'Pack',
    language: 'fr',
    status: 'summary-only',
    source: {
      kind: 'official-pdf',
      relativePath: 'references/source.pdf',
      sha256: 'a'.repeat(64),
      createdAt: '2026-01-01T00:00:00+01:00',
      pageCount: 1
    },
    summary: { primary: ['Primary'], secondary: ['Secondary'] },
    unavailableNotice: 'Source détaillée requise.'
  }]
};

describe('mission data contract', () => {
  it('loads the active pack and verifies its archived source', async () => {
    const catalog = await loadValidatedMissionCatalog();
    const gdm = catalog.packs.find((pack) => pack.id === 'gdm-2026-11th');
    expect(catalog.activePackId).toBe('gdm-2026-11th');
    expect(gdm?.status).toBe('trusted-web-cards');
    expect(gdm?.cards?.primary).toHaveLength(25);
    expect(gdm?.cards?.secondary).toHaveLength(18);
  }, 15_000);

  it('forbids detailed cards in a summary-only pack', () => {
    const invalid = structuredClone(validSummaryPack);
    invalid.packs[0].cards = { primary: [], secondary: [] };

    expect(validateMissionCatalog(invalid)).toContain('packs[0] ne peut pas contenir de cartes tant que son statut est summary-only.');
  });

  it('requires the complete local GDM archive shape', () => {
    expect(validateGdMissionsArchive({ schemaVersion: 'warforge-gdmissions-11th/v1', source: {}, pages: [], assets: [], cards: {} })).not.toHaveLength(0);
  });
});
