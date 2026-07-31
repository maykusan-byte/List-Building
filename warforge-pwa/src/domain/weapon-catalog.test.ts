import { describe, expect, it } from 'vitest';
import { buildWeaponCatalog, filterWeaponCatalog, sortWeaponCatalog, weaponKeywordList, weaponStatValue } from './weapon-catalog';
import type { NormalizedUnit } from './types';

function unit(id: string, factionName: string, displayName: string, weapons: NormalizedUnit['Weapons']): NormalizedUnit {
  return { id, factionName, displayName, bookId: 'book', sourceKey: 'source', sourceIndex: 0, Weapons: weapons };
}

describe('weapon catalog', () => {
  const boltgun = { Name: 'Boltgun', Range: '24"', Attacks: '2', ToHit: '3+', Strength: '4', AP: '0', Damage: '1', Keywords: 'ASSAULT, HEAVY' };
  const units = [
    unit('a', 'Space Marines', 'Intercessors', [{ Weapons: [boltgun] }]),
    unit('b', 'Space Marines', 'Tactical Squad', [{ Weapons: [boltgun] }]),
    unit('c', 'Adeptus Custodes', 'Custodian Guard', [{ Weapons: [{ ...boltgun, Damage: '2' }] }])
  ];

  it('groups identical profiles and keeps their datasheet carriers unique', () => {
    const catalog = buildWeaponCatalog({ units: [...units, units[0]] });
    expect(catalog).toHaveLength(2);
    expect(catalog.find((entry) => entry.profile.Damage === '1')?.carriers.map((carrier) => carrier.id)).toEqual(['a', 'b']);
  });

  it('filters carrier lists by faction without hiding an otherwise matching profile', () => {
    const filtered = filterWeaponCatalog(buildWeaponCatalog({ units }), { faction: 'Space Marines', keyword: 'heavy' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].carriers.map((carrier) => carrier.id)).toEqual(['a', 'b']);
    expect(filtered[0].factionNames).toEqual(['Space Marines']);
  });

  it('splits source keywords and sorts dice values by their average', () => {
    expect(weaponKeywordList('[TORRENT], MELTA 2; ASSAULT')).toEqual(['ASSAULT', 'MELTA 2', 'TORRENT']);
    expect(weaponStatValue('D6+2')).toBe(5.5);
    const sorted = sortWeaponCatalog(buildWeaponCatalog({ units }), 'damage', 'desc');
    expect(sorted[0].profile.Damage).toBe('2');
  });
});
