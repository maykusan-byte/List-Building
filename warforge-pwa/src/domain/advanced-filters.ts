import type { NormalizedUnit, RawWeaponProfile } from './types';
import { weaponProfiles } from './wargear';

export interface AdvancedCatalogFilters {
  minimumMovement: string;
  minimumToughness: string;
  maximumSave: string;
  minimumWounds: string;
  maximumLeadership: string;
  minimumObjectiveControl: string;
  minimumWeaponRange: string;
  minimumWeaponAttacks: string;
  maximumWeaponSkill: string;
  minimumWeaponStrength: string;
  maximumWeaponAP: string;
  minimumWeaponDamage: string;
}

export const EMPTY_ADVANCED_CATALOG_FILTERS: AdvancedCatalogFilters = {
  minimumMovement: '',
  minimumToughness: '',
  maximumSave: '',
  minimumWounds: '',
  maximumLeadership: '',
  minimumObjectiveControl: '',
  minimumWeaponRange: '',
  minimumWeaponAttacks: '',
  maximumWeaponSkill: '',
  minimumWeaponStrength: '',
  maximumWeaponAP: '',
  minimumWeaponDamage: ''
};

function hasFilter(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value));
}

function comparableStatValue(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const source = String(value).trim().replaceAll(',', '.').replaceAll('–', '-');
  if (!source) return null;

  let hasDice = false;
  let diceMaximum = 0;
  const remainder = source.replace(/([+-]?)(\d*)d(\d+)/giu, (_match, sign: string, count: string, faces: string) => {
    hasDice = true;
    const diceCount = Number(count || 1);
    const result = diceCount * Number(faces);
    diceMaximum += sign === '-' ? -result : result;
    return ' ';
  });
  if (hasDice) {
    const modifiers = remainder.match(/[+-]\d+(?:\.\d+)?/g) ?? [];
    return diceMaximum + modifiers.reduce((total, modifier) => total + Number(modifier), 0);
  }

  const match = source.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function meetsMinimum(value: unknown, filter: string): boolean {
  if (!hasFilter(filter)) return true;
  const actual = comparableStatValue(value);
  return actual !== null && actual >= Number(filter);
}

function meetsMaximum(value: unknown, filter: string): boolean {
  if (!hasFilter(filter)) return true;
  const actual = comparableStatValue(value);
  return actual !== null && actual <= Number(filter);
}

function hasUnitStatFilter(filters: AdvancedCatalogFilters): boolean {
  return [
    filters.minimumMovement,
    filters.minimumToughness,
    filters.maximumSave,
    filters.minimumWounds,
    filters.maximumLeadership,
    filters.minimumObjectiveControl
  ].some(hasFilter);
}

function hasWeaponStatFilter(filters: AdvancedCatalogFilters): boolean {
  return [
    filters.minimumWeaponRange,
    filters.minimumWeaponAttacks,
    filters.maximumWeaponSkill,
    filters.minimumWeaponStrength,
    filters.maximumWeaponAP,
    filters.minimumWeaponDamage
  ].some(hasFilter);
}

function matchesUnitProfile(profile: Record<string, unknown>, filters: AdvancedCatalogFilters): boolean {
  return meetsMinimum(profile.Movement, filters.minimumMovement)
    && meetsMinimum(profile.Toughness, filters.minimumToughness)
    && meetsMaximum(profile.Save, filters.maximumSave)
    && meetsMinimum(profile.Wounds, filters.minimumWounds)
    && meetsMaximum(profile.Leadership, filters.maximumLeadership)
    && meetsMinimum(profile.OC, filters.minimumObjectiveControl);
}

function matchesWeaponProfile(profile: RawWeaponProfile, filters: AdvancedCatalogFilters): boolean {
  return meetsMinimum(profile.Range, filters.minimumWeaponRange)
    && meetsMinimum(profile.Attacks, filters.minimumWeaponAttacks)
    && meetsMaximum(profile.ToHit, filters.maximumWeaponSkill)
    && meetsMinimum(profile.Strength, filters.minimumWeaponStrength)
    && meetsMaximum(profile.AP, filters.maximumWeaponAP)
    && meetsMinimum(profile.Damage, filters.minimumWeaponDamage);
}

/** A stat block and a weapon profile must each satisfy every criterion set in their group. */
export function matchesAdvancedCatalogFilters(unit: NormalizedUnit, filters: AdvancedCatalogFilters): boolean {
  if (hasUnitStatFilter(filters) && !(unit.StatLines ?? []).some((profile) => matchesUnitProfile(profile, filters))) return false;
  if (hasWeaponStatFilter(filters) && !weaponProfiles(unit).some(({ profile }) => matchesWeaponProfile(profile, filters))) return false;
  return true;
}

export function advancedCatalogFilterCount(filters: AdvancedCatalogFilters): number {
  return Object.values(filters).filter(hasFilter).length;
}
