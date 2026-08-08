import { describe, expect, it } from 'vitest';
import { loadValidatedMissionCatalog, validateMissionCatalog } from './mission-data.mjs';

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
    expect(catalog.activePackId).toBe('chapter-approved-play-2026-27');
    expect(catalog.packs[0].status).toBe('summary-only');
  });

  it('forbids detailed cards in a summary-only pack', () => {
    const invalid = structuredClone(validSummaryPack);
    invalid.packs[0].cards = { primary: [], secondary: [] };

    expect(validateMissionCatalog(invalid)).toContain('packs[0] ne peut pas contenir de cartes tant que son statut est summary-only.');
  });
});
