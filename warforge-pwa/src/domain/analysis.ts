import type { NormalizedDatabase, NormalizedUnit, RawWeaponProfile, RosterDraft, RosterItem } from './types';
import { calculateItemCost } from './calculations';
import { resolveWargear, weaponProfiles } from './wargear';
import type { SelectedWeaponProfile } from './wargear';

export type CoverageBand = 'absent' | 'fragile' | 'couvert' | 'redondant';

export interface AnalysisTarget {
  id: string;
  /** User-entered label for a custom target. Built-in targets use their stable id. */
  label?: string;
  toughness: number;
  save: number;
  monster?: boolean;
  vehicle?: boolean;
}

export interface TargetDamageAnalysis extends AnalysisTarget {
  rangedDamage: number;
  meleeDamage: number;
  totalDamage: number;
  sourceUnits: number;
  sourcesPerThousand: number;
  coverage: CoverageBand;
}

export interface UnitTargetDamageAnalysis {
  targetId: AnalysisTarget['id'];
  rangedDamage: number;
  meleeDamage: number;
  totalDamage: number;
}

export interface UnitDamageAnalysis {
  itemId: string;
  unitId: string;
  unitName: string;
  modelCount: number;
  points: number;
  targets: UnitTargetDamageAnalysis[];
}

export interface MobilityAnalysis {
  maximumMove: number | null;
  longestRange: number | null;
  fastUnits: number;
  flyUnits: number;
  deepStrikeUnits: number;
  scoutUnits: number;
  infiltratorUnits: number;
}

export interface ResilienceAnalysis {
  totalWounds: number;
  toughWounds: number;
  saveTwoWounds: number;
  saveThreeWounds: number;
  resolvedModels: number;
  unresolvedUnits: number;
}

export interface ControlAnalysis {
  totalObjectiveControl: number;
  battlelineUnits: number;
  modelCount: number;
}

export interface UtilityAnalysis {
  stealthUnits: number;
  loneOperativeUnits: number;
  feelNoPainUnits: number;
  indirectFireUnits: number;
  torrentUnits: number;
}

export interface ListAnalysis {
  targets: TargetDamageAnalysis[];
  unitDamages: UnitDamageAnalysis[];
  mobility: MobilityAnalysis;
  resilience: ResilienceAnalysis;
  control: ControlAnalysis;
  utility: UtilityAnalysis;
  assumptions: string[];
}

export const ANALYSIS_TARGETS: readonly AnalysisTarget[] = [
  { id: 'horde', toughness: 3, save: 5 },
  { id: 'infantry', toughness: 4, save: 3 },
  { id: 'elite', toughness: 6, save: 2 },
  { id: 'vehicle', toughness: 10, save: 3, monster: true, vehicle: true },
  { id: 'heavy', toughness: 12, save: 2, vehicle: true }
];

function normalized(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function expectedNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const source = value.trim().replace(',', '.');
  if (!source) return null;
  let hasDice = false;
  let total = 0;
  const remainder = source.replace(/([+-]?)(\d*)d(\d+)/giu, (_match, sign: string, count: string, faces: string) => {
    hasDice = true;
    const dice = Number(count || 1) * ((Number(faces) + 1) / 2);
    total += sign === '-' ? -dice : dice;
    return ' ';
  });
  if (hasDice) {
    const modifiers = remainder.match(/[+-]\d+(?:\.\d+)?/g) ?? [];
    return total + modifiers.reduce((sum, modifier) => sum + Number(modifier), 0);
  }
  const match = source.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function requiredRoll(value: unknown): number | null {
  const number = expectedNumber(value);
  return number === null || number < 2 || number > 6 ? null : Math.floor(number);
}

function successChance(required: number): number {
  return Math.max(0, Math.min(1, (7 - required) / 6));
}

function woundRequired(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

function keywordText(profile: RawWeaponProfile): string {
  return normalized(profile.Keywords);
}

function hasKeyword(text: string, ...needles: string[]): boolean {
  return needles.some((needle) => text.includes(normalized(needle)));
}

function sustainedHits(text: string): number {
  const match = text.match(/(?:sustained hits|touches soutenues)\s*(\d+)?/u);
  return match ? Number(match[1] || 1) : 0;
}

function antiWoundRequired(text: string, target: AnalysisTarget): number | null {
  if (!target.vehicle && !target.monster) return null;
  const names = [
    ...(target.vehicle ? ['vehicle', 'vehicule'] : []),
    ...(target.monster ? ['monster', 'monstre'] : [])
  ].join('|');
  const match = text.match(new RegExp(`anti (?:${names})\\s*(\\d)`, 'u'));
  const result = match ? Number(match[1]) : null;
  return result && result >= 2 && result <= 6 ? result : null;
}

function modeKey(entry: SelectedWeaponProfile): string {
  const name = normalized(entry.profile.Name).replace(/\b(?:standard|supercharge|overcharge)\b/gu, '').trim();
  return `${entry.melee ? 'melee' : 'ranged'}\u0000${name || normalized(entry.group)}`;
}

function expectedProfileDamage(entry: SelectedWeaponProfile, target: AnalysisTarget): number {
  const attacks = expectedNumber(entry.profile.Attacks);
  const strength = expectedNumber(entry.profile.Strength);
  const damage = expectedNumber(entry.profile.Damage);
  const armourPenetration = expectedNumber(entry.profile.AP);
  const text = keywordText(entry.profile);
  if (attacks === null || strength === null || damage === null || armourPenetration === null) return 0;

  const torrent = hasKeyword(text, 'torrent');
  const toHit = torrent ? 2 : requiredRoll(entry.profile.ToHit);
  if (toHit === null) return 0;
  const hitChance = torrent ? 1 : successChance(toHit);
  const criticalHitChance = torrent ? 0 : 1 / 6;
  const hasLethalHits = hasKeyword(text, 'lethal hits', 'coups letaux');
  const nonAutomaticHits = hitChance - (hasLethalHits ? criticalHitChance : 0) + criticalHitChance * sustainedHits(text);
  const automaticWounds = hasLethalHits ? criticalHitChance : 0;

  const anti = antiWoundRequired(text, target);
  const requiredWound = Math.min(woundRequired(strength, target.toughness), anti ?? 7);
  const baseWoundChance = successChance(requiredWound);
  const twinLinked = hasKeyword(text, 'twin linked', 'jumele');
  const woundChance = twinLinked ? baseWoundChance + (1 - baseWoundChance) * baseWoundChance : baseWoundChance;
  const criticalWoundChance = (1 / 6) + (twinLinked ? (1 - baseWoundChance) / 6 : 0);

  const requiredSave = Math.max(2, target.save - armourPenetration);
  const saveFailureChance = requiredSave > 6 ? 1 : 1 - successChance(requiredSave);
  const devastatingWounds = hasKeyword(text, 'devastating wounds', 'blessures devastatrices');
  const normalWoundDamage = devastatingWounds
    ? (woundChance - criticalWoundChance) * saveFailureChance + criticalWoundChance
    : woundChance * saveFailureChance;
  return Math.max(0, attacks * entry.count * (nonAutomaticHits * normalWoundDamage + automaticWounds * saveFailureChance) * damage);
}

function selectedProfiles(unit: NormalizedUnit, item: RosterItem, detachmentNames: readonly string[]): { profiles: SelectedWeaponProfile[]; totalModels: number } {
  const wargear = resolveWargear(unit, item, detachmentNames);
  if (wargear.profiles.length > 0) return { profiles: wargear.profiles, totalModels: wargear.totalModels };
  const fallbackCount = Math.max(1, wargear.totalModels);
  return {
    profiles: weaponProfiles(unit).map((profile) => ({ ...profile, count: fallbackCount })),
    totalModels: wargear.totalModels
  };
}

function bestProfilesForTarget(profiles: readonly SelectedWeaponProfile[], target: AnalysisTarget, melee: boolean): SelectedWeaponProfile[] {
  const alternatives = new Map<string, SelectedWeaponProfile>();
  profiles.filter((profile) => profile.melee === melee).forEach((profile) => {
    const key = modeKey(profile);
    const current = alternatives.get(key);
    if (!current || expectedProfileDamage(profile, target) > expectedProfileDamage(current, target)) alternatives.set(key, profile);
  });
  return [...alternatives.values()];
}

interface ResolvedStats {
  count: number;
  line: Record<string, unknown>;
  estimated: boolean;
}

function resolvedStats(unit: NormalizedUnit, item: RosterItem, totalModels: number): ResolvedStats[] {
  const lines = unit.StatLines ?? [];
  if (lines.length === 0 || totalModels === 0) return [];
  if (lines.length === 1) return [{ count: totalModels, line: lines[0], estimated: false }];
  const compositions = resolveWargear(unit, item).compositions;
  const pairs = compositions.map((composition) => {
    const match = lines.find((line) => normalized(String(line.StatName ?? '')) === normalized(composition.label));
    return match ? { count: composition.count, line: match, estimated: false } : null;
  });
  if (pairs.every((pair) => pair !== null)) return pairs as ResolvedStats[];
  return [{ count: totalModels, line: lines[0], estimated: true }];
}

function unitText(unit: NormalizedUnit): string {
  return normalized([
    ...(unit.Keywords ?? []),
    ...(unit.FactionKeywords ?? []),
    ...(unit.CoreAbilities ?? []),
    ...(unit.UnitAbilities ?? []).map((ability) => ability.Title ?? '')
  ].join(' '));
}

function hasUnitTrait(text: string, ...traits: string[]): boolean {
  return traits.some((trait) => text.includes(normalized(trait)));
}

function coverageBand(sourceUnits: number, battleSizePoints: number): CoverageBand {
  const sourcesPerThousand = sourceUnits * 1000 / Math.max(1, battleSizePoints);
  if (sourcesPerThousand === 0) return 'absent';
  if (sourcesPerThousand < 1) return 'fragile';
  if (sourcesPerThousand < 2) return 'couvert';
  return 'redondant';
}

/** Calculates an at-a-glance roster profile without reading unstructured rule text. */
export function analyzeRoster(database: NormalizedDatabase, draft: RosterDraft, customTarget?: AnalysisTarget): ListAnalysis {
  const unitsById = new Map(database.units.map((unit) => [unit.id, unit]));
  const detachmentNames = database.detachments.filter((detachment) => draft.detachmentIds.includes(detachment.id)).map((detachment) => detachment.displayName);
  const targets = customTarget ? [...ANALYSIS_TARGETS, customTarget] : ANALYSIS_TARGETS;
  const targetState = targets.map((target) => ({ target, rangedDamage: 0, meleeDamage: 0, sourceUnits: 0 }));
  const unitDamages: UnitDamageAnalysis[] = [];
  const mobility: MobilityAnalysis = { maximumMove: null, longestRange: null, fastUnits: 0, flyUnits: 0, deepStrikeUnits: 0, scoutUnits: 0, infiltratorUnits: 0 };
  const resilience: ResilienceAnalysis = { totalWounds: 0, toughWounds: 0, saveTwoWounds: 0, saveThreeWounds: 0, resolvedModels: 0, unresolvedUnits: 0 };
  const control: ControlAnalysis = { totalObjectiveControl: 0, battlelineUnits: 0, modelCount: 0 };
  const utility: UtilityAnalysis = { stealthUnits: 0, loneOperativeUnits: 0, feelNoPainUnits: 0, indirectFireUnits: 0, torrentUnits: 0 };

  draft.items.forEach((item) => {
    const unit = unitsById.get(item.unitId);
    if (!unit) return;
    const { profiles, totalModels } = selectedProfiles(unit, item, detachmentNames);
    const stats = resolvedStats(unit, item, totalModels);
    const text = unitText(unit);
    control.modelCount += totalModels;
    if (hasUnitTrait(text, 'battleline')) control.battlelineUnits += 1;
    if (hasUnitTrait(text, 'fly', 'vol')) mobility.flyUnits += 1;
    if (hasUnitTrait(text, 'deep strike', 'frappe en profondeur')) mobility.deepStrikeUnits += 1;
    if (hasUnitTrait(text, 'scouts', 'eclaireurs')) mobility.scoutUnits += 1;
    if (hasUnitTrait(text, 'infiltrators', 'infiltrateurs')) mobility.infiltratorUnits += 1;
    if (hasUnitTrait(text, 'stealth', 'furtivete')) utility.stealthUnits += 1;
    if (hasUnitTrait(text, 'lone operative', 'operateur solitaire')) utility.loneOperativeUnits += 1;
    if (hasUnitTrait(text, 'feel no pain', 'insensible a la douleur')) utility.feelNoPainUnits += 1;
    if (profiles.some((entry) => hasKeyword(keywordText(entry.profile), 'indirect fire', 'tir indirect'))) utility.indirectFireUnits += 1;
    if (profiles.some((entry) => hasKeyword(keywordText(entry.profile), 'torrent'))) utility.torrentUnits += 1;

    stats.forEach(({ count, line, estimated }) => {
      const wounds = expectedNumber(line.Wounds) ?? 0;
      const toughness = expectedNumber(line.Toughness) ?? 0;
      const save = expectedNumber(line.Save) ?? 7;
      const objectiveControl = expectedNumber(line.OC) ?? 0;
      const movement = expectedNumber(line.Movement);
      resilience.totalWounds += count * wounds;
      resilience.resolvedModels += count;
      control.totalObjectiveControl += count * objectiveControl;
      if (toughness >= 10) resilience.toughWounds += count * wounds;
      if (save <= 2) resilience.saveTwoWounds += count * wounds;
      if (save <= 3) resilience.saveThreeWounds += count * wounds;
      if (movement !== null) mobility.maximumMove = Math.max(mobility.maximumMove ?? 0, movement);
      if (estimated) resilience.unresolvedUnits += 1;
    });
    if (stats.some(({ line }) => (expectedNumber(line.Movement) ?? 0) >= 10)) mobility.fastUnits += 1;
    profiles.filter((profile) => !profile.melee).forEach((profile) => {
      const range = expectedNumber(profile.profile.Range);
      if (range !== null) mobility.longestRange = Math.max(mobility.longestRange ?? 0, range);
    });

    const damagesForUnit = targetState.map((state) => {
      const ranged = bestProfilesForTarget(profiles, state.target, false).reduce((sum, profile) => sum + expectedProfileDamage(profile, state.target), 0);
      const melee = bestProfilesForTarget(profiles, state.target, true).reduce((sum, profile) => sum + expectedProfileDamage(profile, state.target), 0);
      state.rangedDamage += ranged;
      state.meleeDamage += melee;
      if (ranged + melee >= 0.5) state.sourceUnits += 1;
      return { targetId: state.target.id, rangedDamage: ranged, meleeDamage: melee, totalDamage: ranged + melee };
    });
    unitDamages.push({
      itemId: item.id,
      unitId: unit.id,
      unitName: unit.Name ?? 'Unité sans nom',
      modelCount: totalModels,
      points: calculateItemCost(database, item, draft.items, draft.detachmentIds).total,
      targets: damagesForUnit
    });
  });

  return {
    targets: targetState.map(({ target, rangedDamage, meleeDamage, sourceUnits }) => ({
      ...target,
      rangedDamage,
      meleeDamage,
      totalDamage: rangedDamage + meleeDamage,
      sourceUnits,
      sourcesPerThousand: sourceUnits * 1000 / Math.max(1, draft.battleSizePoints),
      coverage: coverageBand(sourceUnits, draft.battleSizePoints)
    })),
    unitDamages,
    mobility,
    resilience,
    control,
    utility,
    assumptions: ['statisticalAverage', 'situationalRules', 'textAbilities']
  };
}
