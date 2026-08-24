import { describe, expect, it } from 'vitest';
import {
  CORE_DEVASTATING_WOUNDS_SOURCE,
  CORE_HAZARDOUS_SOURCE,
  CORE_IGNORES_COVER_SOURCE,
  CORE_MELTA_SOURCE,
  CORE_PISTOL_SOURCE,
  CORE_TORRENT_SOURCE,
  normalizeWeaponKeywords
} from './weapon-keywords';
import { CORE_ANTI_SOURCE, CORE_CRITICAL_HIT_SOURCE, CORE_CRITICAL_WOUND_SOURCE, CORE_LETHAL_HITS_SOURCE, CORE_SUSTAINED_HITS_SOURCE, CORE_TWIN_LINKED_SOURCE } from './m5-source-references';

describe('closed weapon keyword normalization', () => {
  it('normalizes the six approved catalogue labels in a stable canonical order with source provenance', () => {
    const result = normalizeWeaponKeywords([
      'pistol',
      '  MELTA\t2 ',
      'torrent',
      'ignores   cover',
      'devastating wounds',
      'hazardous'
    ]);

    expect(result).toEqual({
      accepted: true,
      keywords: [
        { kind: 'hazardous', source: CORE_HAZARDOUS_SOURCE },
        { kind: 'devastating-wounds', source: CORE_DEVASTATING_WOUNDS_SOURCE },
        { kind: 'melta', value: 2, source: CORE_MELTA_SOURCE },
        { kind: 'ignores-cover', source: CORE_IGNORES_COVER_SOURCE },
        { kind: 'torrent', source: CORE_TORRENT_SOURCE },
        { kind: 'pistol', source: CORE_PISTOL_SOURCE }
      ]
    });
  });

  it('keeps every mapped rule reference canonical', () => {
    const result = normalizeWeaponKeywords([
      'HAZARDOUS',
      'DEVASTATING WOUNDS',
      'MELTA 1',
      'IGNORES COVER',
      'TORRENT',
      'PISTOL'
    ]);

    expect(result).toMatchObject({
      accepted: true,
      keywords: [
        { kind: 'hazardous', source: { reference: '24.15', page: 79 } },
        { kind: 'devastating-wounds', source: { reference: '24.10', page: 80 } },
        { kind: 'melta', value: 1, source: { reference: '24.25', page: 82 } },
        { kind: 'ignores-cover', source: { reference: '24.18', page: 82 } },
        { kind: 'torrent', source: { reference: '24.37', page: 85 } },
        { kind: 'pistol', source: { reference: '24.27', page: 84 } }
      ]
    });
  });

  it('compiles the closed critical-trigger vocabulary with exact source references', () => {
    expect(normalizeWeaponKeywords(['[ANTI-INFANTRY 4+]', 'TOUCHES SOUTENUES 2', 'LETHAL HITS'])).toEqual({
      accepted: true,
      keywords: [
        { kind: 'anti', targetKeyword: 'INFANTRY', criticalWound: 4, source: CORE_ANTI_SOURCE },
        { kind: 'sustained-hits', value: 2, source: CORE_SUSTAINED_HITS_SOURCE },
        { kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }
      ]
    });
  });

  it('normalizes only the exact locally sourced French [JUMELÉ] label', () => {
    expect(normalizeWeaponKeywords([' [jumelé] '])).toEqual({
      accepted: true,
      keywords: [{ kind: 'twin-linked', source: CORE_TWIN_LINKED_SOURCE }]
    });
    expect(normalizeWeaponKeywords(['TWIN-LINKED'])).toMatchObject({ accepted: false, code: 'unsupported-weapon-keyword' });
  });

  it('keeps the critical hit/wound and triggered-ability provenance on the exact printed rules', () => {
    expect([CORE_CRITICAL_HIT_SOURCE, CORE_CRITICAL_WOUND_SOURCE, CORE_ANTI_SOURCE, CORE_LETHAL_HITS_SOURCE, CORE_SUSTAINED_HITS_SOURCE]).toEqual([
      expect.objectContaining({ reference: '05.01', page: 18 }),
      expect.objectContaining({ reference: '05.02', page: 18 }),
      expect.objectContaining({ reference: '24.03', page: 79 }),
      expect.objectContaining({ reference: '24.23', page: 85 }),
      expect.objectContaining({ reference: '24.36', page: 85 })
    ]);
  });

  it.each([
    ['MELTA', 0],
    ['MELTA 0', 0],
    ['MELTA -1', 0],
    ['MELTA 01', 0],
    ['MELTA 1.5', 0],
    ['MELTA 2 extra', 0]
  ])('rejects an invalid MELTA value: %s', (label, inputIndex) => {
    expect(normalizeWeaponKeywords([label])).toMatchObject({
      accepted: false,
      code: 'invalid-melta-value',
      inputIndex
    });
  });

  it.each([
    ['HAZARDOUS EXTRA', 'unsupported-weapon-keyword'],
    ['DEVASTATING WOUND', 'unsupported-weapon-keyword'],
    ['MELTAFOO', 'unsupported-weapon-keyword'],
    ['TWIN-LINKED', 'unsupported-weapon-keyword'],
    ['', 'unsupported-weapon-keyword']
  ] as const)('rejects unsupported or free-text labels: %s', (label, code) => {
    expect(normalizeWeaponKeywords([label])).toMatchObject({ accepted: false, code, inputIndex: 0 });
  });

  it('rejects duplicate abilities after case and spacing normalization', () => {
    expect(normalizeWeaponKeywords(['PISTOL', ' pistol '])).toMatchObject({
      accepted: false,
      code: 'duplicate-weapon-keyword',
      inputIndex: 1
    });
    expect(normalizeWeaponKeywords(['MELTA 1', 'melta 2'])).toMatchObject({
      accepted: false,
      code: 'duplicate-weapon-keyword',
      inputIndex: 1
    });
    expect(normalizeWeaponKeywords(['ANTI-INFANTRY 4+', 'ANTI-VEHICLE 2+'])).toMatchObject({
      accepted: false,
      code: 'duplicate-weapon-keyword',
      inputIndex: 1
    });
    expect(normalizeWeaponKeywords(['TOUCHES SOUTENUES 1', 'SUSTAINED HITS 2'])).toMatchObject({
      accepted: false,
      code: 'duplicate-weapon-keyword',
      inputIndex: 1
    });
  });

  it.each([
    'ANTI-INFANTRY 1+',
    'ANTI-INFANTRY 7+',
    'ANTI 4+',
    'TOUCHES SOUTENUES 0',
    'SUSTAINED HITS 1.5'
  ])('rejects malformed critical-trigger values: %s', (label) => {
    expect(normalizeWeaponKeywords([label])).toMatchObject({ accepted: false, inputIndex: 0 });
  });

  it('rejects malformed input explicitly', () => {
    expect(normalizeWeaponKeywords('PISTOL')).toMatchObject({ accepted: false, code: 'invalid-weapon-keyword-input' });
    expect(normalizeWeaponKeywords(['PISTOL', 1])).toMatchObject({ accepted: false, code: 'invalid-weapon-keyword-input' });
  });
});
