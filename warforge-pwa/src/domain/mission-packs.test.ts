import { describe, expect, it } from 'vitest';
import { activeMissionPack, missionAssetUrl, missionSourceFilename } from './mission-packs';

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
        source: { kind: 'official-pdf', relativePath: 'references/pack.pdf', createdAt: '2026-07-10T06:49:55+01:00', pageCount: 93 },
        summary: { primary: ['A'], secondary: ['B'] },
        unavailableNotice: 'Source requise.'
      }]
    });

    expect(pack?.id).toBe('active');
    expect(pack && missionSourceFilename(pack.source)).toBe('pack.pdf');
  });

  it('accepts a locally archived trusted web pack', () => {
    const pack = activeMissionPack({
      schemaVersion: 'warforge-mission-packs/v1',
      activePackId: 'gdm',
      packs: [{
        id: 'gdm',
        title: 'GDM',
        language: 'en',
        status: 'trusted-web-cards',
        source: {
          kind: 'trusted-web',
          url: 'https://gdmissions.app/11th',
          archivePath: 'warforge-pwa/data/missions/gdmissions-11th/archive.json',
          scope: 'all pages',
          title: 'GDM 2026',
          retrievedAt: '2026-08-08T12:00:00.000Z',
          pageCount: 93,
          assetCount: 149
        },
        summary: { primary: ['A'], secondary: ['B'] },
        unavailableNotice: 'Imported.',
        cards: { primary: [], secondary: [], layouts: [], forceDispositions: [], matrix: null }
      }]
    });

    expect(pack?.source.kind).toBe('trusted-web');
    expect(pack && missionSourceFilename(pack.source)).toBe('GDM 2026');
    expect(missionAssetUrl('/assets/11th/primary-missions/example.png')).toBe('/assets/gdm-11th/primary-missions/example.png');
  });

  it('rejects an invalid mission catalog', () => {
    expect(activeMissionPack({ schemaVersion: 'warforge-mission-packs/v1', activePackId: 'missing', packs: [] })).toBeNull();
  });
});
