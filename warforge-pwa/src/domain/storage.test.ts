import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readActiveDraftId, readLocale, readSavedDrafts, writeActiveDraftId, writeLocale, writeSavedDrafts } from './storage';
import type { SavedDraft } from './types';

function savedDraft(id = 'saved-list'): SavedDraft {
  return {
    id,
    name: 'Liste test',
    updatedAt: '2026-07-31T10:00:00.000Z',
    databaseFingerprint: 'catalog-test',
    draft: {
      id,
      name: 'Liste test',
      primaryFaction: 'test-faction',
      battleSizePoints: 2000,
      scenario: 'TAKE AND HOLD',
      detachmentIds: [],
      items: []
    }
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); }
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('saved list storage', () => {
  it('keeps the locale independent from saved lists and defaults to French', () => {
    expect(readLocale()).toBe('fr');
    expect(writeLocale('en')).toBe(true);
    expect(readLocale()).toBe('en');
    expect(writeSavedDrafts([savedDraft()])).toBe(true);
    expect(readLocale()).toBe('en');
    localStorage.setItem('warforge.locale.v1', 'de');
    expect(readLocale()).toBe('fr');
  });

  it('keeps several saved lists and the active list identifier', () => {
    const drafts = [savedDraft('first'), savedDraft('second')];
    expect(writeSavedDrafts(drafts)).toBe(true);
    expect(writeActiveDraftId('second')).toBe(true);
    expect(readSavedDrafts()).toEqual(drafts);
    expect(readActiveDraftId()).toBe('second');
  });

  it('ignores malformed saved-list data and reports unavailable storage', () => {
    localStorage.setItem('warforge.saved-drafts.v2', '{not-json');
    expect(readSavedDrafts()).toEqual([]);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('blocked'); } });
    expect(writeSavedDrafts([savedDraft()])).toBe(false);
    expect(writeActiveDraftId('saved-list')).toBe(false);
  });
});
