import { describe, expect, it } from 'vitest';
import { loadValidatedFactionPackManifest, validateFactionPackManifest } from './faction-pack-audit.mjs';

const validManifest = {
  schemaVersion: 'warforge-faction-pack-audit/v1',
  catalog: {
    dataInfoPath: 'data/units/DataInfo.json',
    version: '1.0.0',
    publishedAt: '2026-01-01T00:00:00Z'
  },
  packs: [{
    id: 'test-v1.0-2026-01-02',
    faction: 'Test',
    catalogFile: 'data/units/Test.json',
    source: {
      relativePath: 'references/warhammer-40k/faction-packs/test.pdf',
      language: 'fr',
      version: '1.0',
      effectiveAt: '2026-01-02',
      pageCount: 1,
      sha256: 'a'.repeat(64)
    },
    audit: {
      status: 'catalog-audited',
      auditedAt: '2026-01-02'
    }
  }]
};

describe('faction pack audit contract', () => {
  it('verifies every archived French pack and its catalog source', async () => {
    const manifest = await loadValidatedFactionPackManifest();
    expect(manifest.packs).toHaveLength(28);
    expect(manifest.packs.find((pack) => pack.id === 'aeldari-v1.2-2026-08-05')?.audit.status).toBe('catalog-audited-with-known-gaps');
  });

  it('blocks a newer pack that has not been audited', () => {
    const pending = structuredClone(validManifest);
    pending.packs[0].audit.status = 'pending';

    expect(validateFactionPackManifest(pending)).toContain('packs[0] est plus récent que le catalogue et doit être audité avant publication.');
  });

  it('requires known gaps to be explicit', () => {
    const incomplete = structuredClone(validManifest);
    incomplete.packs[0].audit.status = 'catalog-audited-with-known-gaps';

    expect(validateFactionPackManifest(incomplete)).toContain('packs[0].audit.knownGaps est requis pour un audit avec écarts connus.');
  });
});
