import { describe, expect, it } from 'vitest';
import { EMPTY_ADVANCED_CATALOG_FILTERS, advancedCatalogFilterCount, matchesAdvancedCatalogFilters } from './advanced-filters';
import { normalizeDatabase } from './normalize';

const unit = normalizeDatabase(JSON.stringify([{
  Name: 'Test faction',
  BattleSizeDefinitions: [{ PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 }],
  Units: [{
    Name: 'FILTER TEST UNIT',
    StatLines: [
      { Movement: '6\"', Toughness: '4', Save: '3+', Wounds: '2', Leadership: '6+', OC: '2' },
      { StatName: 'Vehicle', Movement: '10\"', Toughness: '12', Save: '2+', Wounds: '14', Leadership: '8+', OC: '5' }
    ],
    Weapons: [{ Name: 'Ranged weapons', Weapons: [
      { Name: 'Boltgun', Range: '24\"', Attacks: '2', ToHit: '3+', Strength: '4', AP: '0', Damage: '1' },
      { Name: 'Meltagun', Range: '12\"', Attacks: '1', ToHit: '3+', Strength: '9', AP: '-4', Damage: 'D6' }
    ] }]
  }]
}])).units[0];

describe('advanced catalog filters', () => {
  it('requires one profile to satisfy every requested unit stat', () => {
    expect(matchesAdvancedCatalogFilters(unit, {
      ...EMPTY_ADVANCED_CATALOG_FILTERS,
      minimumMovement: '8',
      minimumToughness: '10',
      maximumSave: '2',
      minimumWounds: '10',
      minimumObjectiveControl: '4'
    })).toBe(true);
    expect(matchesAdvancedCatalogFilters(unit, {
      ...EMPTY_ADVANCED_CATALOG_FILTERS,
      minimumMovement: '11'
    })).toBe(false);
  });

  it('filters on one weapon profile and uses the maximum result for dice', () => {
    expect(matchesAdvancedCatalogFilters(unit, {
      ...EMPTY_ADVANCED_CATALOG_FILTERS,
      minimumWeaponRange: '12',
      minimumWeaponStrength: '8',
      maximumWeaponAP: '-3',
      minimumWeaponDamage: '4'
    })).toBe(true);
    expect(matchesAdvancedCatalogFilters(unit, {
      ...EMPTY_ADVANCED_CATALOG_FILTERS,
      minimumWeaponRange: '18',
      minimumWeaponStrength: '8'
    })).toBe(false);
  });

  it('counts only active criteria', () => {
    expect(advancedCatalogFilterCount(EMPTY_ADVANCED_CATALOG_FILTERS)).toBe(0);
    expect(advancedCatalogFilterCount({
      ...EMPTY_ADVANCED_CATALOG_FILTERS,
      minimumToughness: '8',
      maximumWeaponAP: '-2'
    })).toBe(2);
  });
});
