import { describe, expect, it } from 'vitest';
import { activeMissionPack, missionSourceFilename } from './mission-packs';

describe('mission pack access', () => {
  it('selects the active versioned pack', () => {
    const pack = activeMissionPack({
      schemaVersion: 'warforge-mission-packs/v1',
      activePackId: 'active',
      packs: [{
        id: 'active',
        title: 'Pack',
        language: 'fr',
        status: 'summary-only',
        source: { relativePath: 'references/pack.pdf', createdAt: '2026-07-10T06:49:55+01:00', pageCount: 93 },
        summary: { primary: ['A'], secondary: ['B'] },
        unavailableNotice: 'Source requise.'
      }]
    });

    expect(pack?.id).toBe('active');
    expect(missionSourceFilename('references/pack.pdf')).toBe('pack.pdf');
  });

  it('rejects an invalid mission catalog', () => {
    expect(activeMissionPack({ schemaVersion: 'warforge-mission-packs/v1', activePackId: 'missing', packs: [] })).toBeNull();
  });
});
