import { describe, expect, it } from 'vitest';
import { createUserProfile, parseUserProfile, USER_PROFILE_SCHEMA } from './user-profile';

const savedDraft = {
  id: 'list-1',
  name: 'Strike force',
  updatedAt: '2026-08-08T12:00:00.000Z',
  databaseFingerprint: 'catalog-test',
  draft: {
    id: 'list-1',
    name: 'Strike force',
    primaryFaction: 'Aeldari',
    battleSizePoints: 2000,
    scenario: 'TAKE AND HOLD',
    detachmentIds: [],
    items: []
  }
};

describe('user profile backup', () => {
  it('exports the complete device-local profile shape', () => {
    const profile = createUserProfile({
      locale: 'fr',
      favorites: ['unit-1', 'unit-1', ' unit-2 '],
      savedDrafts: [savedDraft],
      activeDraftId: 'list-1',
      localInventory: {
        databaseFingerprint: 'catalog-test',
        sourceLabel: 'Mon inventaire',
        sourceKind: 'local',
        entries: [{ databaseFingerprint: 'catalog-test', unitId: 'unit-1', figureId: 1, type: 'real' }]
      }
    });

    expect(profile.schemaVersion).toBe(USER_PROFILE_SCHEMA);
    expect(profile.favorites).toEqual(['unit-1', 'unit-2']);
    expect(parseUserProfile(profile)).toEqual(profile);
  });

  it('does not include the bundled inventory in a personal backup', () => {
    const profile = createUserProfile({
      locale: 'en',
      favorites: [],
      savedDrafts: [],
      activeDraftId: null,
      localInventory: {
        databaseFingerprint: 'catalog-test',
        sourceLabel: 'Inventaire intégré',
        sourceKind: 'bundled',
        entries: []
      }
    });

    expect(profile.localInventory).toBeUndefined();
  });

  it('rejects malformed and unsupported backups', () => {
    expect(parseUserProfile({ schemaVersion: USER_PROFILE_SCHEMA, locale: 'fr' })).toBeNull();
    expect(parseUserProfile({
      schemaVersion: USER_PROFILE_SCHEMA,
      exportedAt: '2026-08-08T12:00:00.000Z',
      locale: 'fr',
      favorites: ['unit-1'],
      savedDrafts: [{ ...savedDraft, draft: { ...savedDraft.draft, items: [{ id: 'item', unitId: 'unit-1', pointIndex: -1, wargearSelections: {} }] } }],
      activeDraftId: null
    })).toBeNull();
  });
});
