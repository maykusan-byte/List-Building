import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogLocalization } from '../../domain/catalog-localization';
import type { NormalizedDatabase, NormalizedUnit } from '../../domain/types';
import { WEAPON_STAT_KEYS, WeaponsQuiz } from './WeaponsQuiz';

const profile = {
  Name: 'Test cannon',
  Range: '24"',
  Attacks: '2',
  ToHit: '3+',
  Strength: '7',
  AP: '-2',
  Damage: '3',
  Keywords: 'RAPID FIRE 1'
};

const unit = {
  id: 'unit-1',
  bookId: 'book-1',
  sourceKey: 'book-1',
  factionName: 'Test faction',
  sourceIndex: 0,
  displayName: 'Test unit',
  Weapons: [{ Name: 'Ranged weapons', Weapons: [profile] }]
} satisfies NormalizedUnit;

const database = {
  fingerprint: 'test', loadedAt: '', books: [], factions: [], alliesByFaction: {},
  units: [unit], detachments: [], battleSizes: []
} satisfies NormalizedDatabase;

const display = {
  locale: 'fr', status: 'not-needed',
  unitName: (value: NormalizedUnit) => value.displayName,
  detachmentName: () => '', factionName: (value?: string) => value ?? '', term: (value?: string) => value ?? '',
  searchTerms: () => [], isTranslated: () => true
} satisfies CatalogLocalization;

describe('weapons quiz interaction', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onScoreUpdate: ReturnType<typeof vi.fn>;
  let onAdvance: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    onScoreUpdate = vi.fn();
    onAdvance = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    act(() => root.render(<WeaponsQuiz database={database} display={display} isFrench eligibleUnits={[unit]}
      onAdvance={onAdvance as () => void} onScoreUpdate={onScoreUpdate as (isCorrect: boolean) => void} getUnitImgUrl={() => null} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('keeps the question stable while selecting and records validation once', () => {
    const heading = () => container.querySelector('h2')?.textContent;
    const expected = WEAPON_STAT_KEYS.map(({ key }) => String(profile[key]));
    const groups = Array.from(container.querySelectorAll('section.library-panel > div:nth-of-type(2) > div'));
    expect(groups).toHaveLength(WEAPON_STAT_KEYS.length);

    expected.forEach((value, index) => {
      const choice = Array.from(groups[index].querySelectorAll('button')).find((button) => button.textContent === value);
      expect(choice).toBeTruthy();
      act(() => choice!.click());
      expect(heading()).toBe('Test cannon');
    });

    const verify = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Vérifier'))!;
    act(() => {
      verify.click();
      verify.click();
    });

    expect(onScoreUpdate).toHaveBeenCalledTimes(1);
    expect(onScoreUpdate).toHaveBeenCalledWith(true);
  });

  it('skips without changing the score', () => {
    const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Suivant'))!;
    act(() => next.click());

    expect(onScoreUpdate).not.toHaveBeenCalled();
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
