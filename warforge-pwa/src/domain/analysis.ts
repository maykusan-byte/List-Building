import type { NormalizedDatabase, NormalizedUnit, RawWeaponProfile, RosterDraft, RosterItem } from './types';
import { calculateItemCost } from './calculations';
import { resolveWargear, weaponProfiles } from './wargear';
import type { SelectedWeaponProfile } from './wargear';

export type CoverageBand = 'absent' | 'fragile' | 'couvert' | 'redondant';

export interface AnalysisTarget {
  infantry?: boolean;
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
  { id: 'horde', toughness: 3, save: 5, infantry: true },
  { id: 'infantry', toughness: 4, save: 3, infantry: true },
  { id: 'elite', toughness: 6, save: 2, infantry: true },
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
  if (!target.vehicle && !target.monster && !target.infantry) return null;
  const names = [
    ...(target.vehicle ? ['vehicle', 'vehicule'] : []),
    ...(target.monster ? ['monster', 'monstre'] : []),
    ...(target.infantry ? ['infantry', 'infanterie'] : [])
  ].join('|');
  const match = text.match(new RegExp(`anti (?:${names})\\s*(\\d)`, 'u'));
  const result = match ? Number(match[1]) : null;
  return result && result >= 2 && result <= 6 ? result : null;
}

function blast(text: string, target: AnalysisTarget): number {
  const match = text.match(/(?:blast|deflagration|abattage)\s*(\d+)?/u);
  if (!match) return 0;
  const multiplier = match[1] ? Number(match[1]) : 1;
  if (target.id === 'horde') return 4 * multiplier;
  if (target.id === 'infantry') return 1 * multiplier;
  return 0;
}

function melta(text: string): number {
  const match = text.match(/(?:melta|fusion)\s*(\d+)?/u);
  return match ? Number(match[1] || 1) : 0;
}

function rapidFire(text: string): number {
  const match = text.match(/(?:rapid fire|tirs rapides?)\s*(\d+)?/u);
  return match ? Number(match[1] || 1) : 0;
}

export function modeKey(entry: SelectedWeaponProfile): string {
  const name = normalized(entry.profile.Name).replace(/\b(?:standard|supercharge|overcharge)\b/gu, '').trim();
  return `${entry.melee ? 'melee' : 'ranged'}\u0000${name || normalized(entry.group)}`;
}

/**
 * Expected unsaved damage for one weapon profile, against one target.
 * This is shared by the list analysis and the public weapon catalogue so
 * that their target columns always use the same assumptions.
 */
export function estimateWeaponProfileDamage(profile: RawWeaponProfile, target: AnalysisTarget, count = 1, evaluationRange?: number): number {
  let attacks = expectedNumber(profile.Attacks);
  const strength = expectedNumber(profile.Strength);
  let damage = expectedNumber(profile.Damage);
  const armourPenetration = expectedNumber(profile.AP);
  const text = keywordText(profile);
  if (attacks !== null) attacks += blast(text, target);
  if (attacks === null || strength === null || damage === null || armourPenetration === null) return 0;

  if (evaluationRange !== undefined && profile.Range) {
    if (profile.Range.toLowerCase() === 'melee') {
       if (evaluationRange > 0) return 0;
    } else {
       const rangeVal = expectedNumber(profile.Range);
       if (rangeVal !== null) {
         if (evaluationRange > rangeVal) return 0;
         if (evaluationRange === 0 && !hasKeyword(text, 'pistol', 'pistolet')) return 0;
         if (evaluationRange > 0 && evaluationRange <= rangeVal / 2) {
           attacks += rapidFire(text);
           damage += melta(text);
         }
       }
    }
  }

  const torrent = hasKeyword(text, 'torrent');
  let toHitMod = 0;
  if (hasKeyword(text, 'heavy', 'lourd')) toHitMod += 1;
  const toHit = torrent ? 2 : requiredRoll(profile.ToHit);
  if (toHit === null) return 0;
  const actualToHit = Math.max(2, toHit - toHitMod);

  const hitChance = torrent ? 1 : successChance(actualToHit);
  const criticalHitChance = torrent ? 0 : 1 / 6;

  let woundMod = 0;
  if (hasKeyword(text, 'lance') && (!profile.Range || profile.Range.toLowerCase() === 'melee')) woundMod += 1;
  
  const anti = antiWoundRequired(text, target);
  const rawRequiredWound = Math.max(2, woundRequired(strength, target.toughness) - woundMod);
  const requiredWound = Math.min(rawRequiredWound, anti ?? 7);

  const baseWoundChance = successChance(requiredWound);
  const twinLinked = hasKeyword(text, 'twin linked', 'jumele');
  const woundChance = twinLinked ? baseWoundChance + (1 - baseWoundChance) * baseWoundChance : baseWoundChance;

  const baseCriticalWoundChance = anti ? successChance(anti) : (1 / 6);
  const criticalWoundChance = baseCriticalWoundChance + (twinLinked ? (1 - baseWoundChance) * baseCriticalWoundChance : 0);

  const requiredSave = Math.max(2, target.save - armourPenetration);
  const saveFailureChance = requiredSave > 6 ? 1 : 1 - successChance(requiredSave);

  const devastatingWounds = hasKeyword(text, 'devastating wounds', 'blessures devastatrices');
  const normalWoundDamage = devastatingWounds
    ? (woundChance - criticalWoundChance) * saveFailureChance + criticalWoundChance
    : woundChance * saveFailureChance;

  const hasLethalHits = hasKeyword(text, 'lethal hits', 'coups letaux', 'touches fatales');
  const takeLethal = hasLethalHits && saveFailureChance >= normalWoundDamage;
  const nonAutomaticHits = hitChance - (takeLethal ? criticalHitChance : 0) + criticalHitChance * sustainedHits(text);
  const automaticWounds = takeLethal ? criticalHitChance : 0;

  return Math.max(0, attacks * count * (nonAutomaticHits * normalWoundDamage + automaticWounds * saveFailureChance) * damage);
}

function expectedProfileDamage(entry: SelectedWeaponProfile, target: AnalysisTarget): number {
  return estimateWeaponProfileDamage(entry.profile, target, entry.count);
}

function selectedProfiles(unit: NormalizedUnit, item: RosterItem, detachmentNames: readonly string[]): { profiles: SelectedWeaponProfile[]; totalModels: number } {
  const resolved = resolveWargear(unit, item, detachmentNames);
  if (resolved.profiles.length > 0) {
    return { profiles: resolved.profiles, totalModels: resolved.totalModels };
  }
  const count = Math.max(1, resolved.totalModels);
  return { profiles: weaponProfiles(unit).map(p => ({ ...p, count })), totalModels: resolved.totalModels };
}

function coverageLevel(sourceUnits: number, points: number): CoverageBand {
  const scaled = (sourceUnits * 1000) / Math.max(1, points);
  if (scaled === 0) return 'absent';
  if (scaled < 1) return 'fragile';
  if (scaled < 2) return 'couvert';
  return 'redondant';
}

function getBestProfiles(profiles: SelectedWeaponProfile[], target: AnalysisTarget, isMelee: boolean): SelectedWeaponProfile[] {
  const map = new Map<string, SelectedWeaponProfile>();
  for (const profile of profiles.filter(p => p.melee === isMelee)) {
    const key = modeKey(profile);
    const existing = map.get(key);
    if (!existing || expectedProfileDamage(profile, target) > expectedProfileDamage(existing, target)) {
      map.set(key, profile);
    }
  }
  return [...map.values()];
}

function getEstimatedStatlines(unit: NormalizedUnit, item: RosterItem, totalModels: number): Array<{ count: number, line: Record<string, unknown>, estimated: boolean }> {
  const lines = unit.StatLines ?? [];
  if (lines.length === 0 || totalModels === 0) return [];
  if (lines.length === 1) return [{ count: totalModels, line: lines[0], estimated: false }];
  
  const resolved = resolveWargear(unit, item);
  const matched = resolved.compositions.map(comp => {
    const statLine = lines.find(line => normalized(String(line.StatName ?? '')) === normalized(comp.label));
    return statLine ? { count: comp.count, line: statLine, estimated: false } : null;
  });
  
  if (matched.every(m => m !== null)) return matched as Array<{ count: number, line: Record<string, unknown>, estimated: boolean }>;
  return [{ count: totalModels, line: lines[0], estimated: true }];
}

export interface AnalysisTargetResult extends AnalysisTarget {
  meleeDamage: number;
  rangedDamage: number;
  totalDamage: number;
  sourceUnits: number;
  sourcesPerThousand: number;
  coverage: CoverageBand;
}

export interface UnitDamageAnalysis {
  itemId: string;
  unitId: string;
  unitName: string;
  modelCount: number;
  points: number;
  targets: Array<{ targetId: string; rangedDamage: number; meleeDamage: number; totalDamage: number }>;
}

export interface RosterAnalysis {
  targets: AnalysisTargetResult[];
  unitDamages: UnitDamageAnalysis[];
  mobility: { maximumMove: number | null; longestRange: number | null; fastUnits: number; flyUnits: number; deepStrikeUnits: number; scoutUnits: number; infiltratorUnits: number };
  resilience: { totalWounds: number; toughWounds: number; saveTwoWounds: number; saveThreeWounds: number; resolvedModels: number; unresolvedUnits: number };
  control: { totalObjectiveControl: number; modelCount: number; battlelineUnits: number };
  utility: { stealthUnits: number; loneOperativeUnits: number; feelNoPainUnits: number; indirectFireUnits: number; torrentUnits: number };
  assumptions: string[];
}

export function analyzeRoster(database: NormalizedDatabase, draft: RosterDraft, customTarget?: AnalysisTarget): RosterAnalysis {
  const unitMap = new Map(database.units.map(u => [u.id, u]));
  const detachmentNames = database.detachments.filter(d => draft.detachmentIds.includes(d.id)).map(d => d.displayName);
  const targets = (customTarget ? [...ANALYSIS_TARGETS, customTarget] : ANALYSIS_TARGETS).map(t => ({
    target: t,
    rangedDamage: 0,
    meleeDamage: 0,
    sourceUnits: 0
  }));

  const unitDamages: UnitDamageAnalysis[] = [];
  const mobility = { maximumMove: null as number | null, longestRange: null as number | null, fastUnits: 0, flyUnits: 0, deepStrikeUnits: 0, scoutUnits: 0, infiltratorUnits: 0 };
  const resilience = { totalWounds: 0, toughWounds: 0, saveTwoWounds: 0, saveThreeWounds: 0, resolvedModels: 0, unresolvedUnits: 0 };
  const control = { totalObjectiveControl: 0, battlelineUnits: 0, modelCount: 0 };
  const utility = { stealthUnits: 0, loneOperativeUnits: 0, feelNoPainUnits: 0, indirectFireUnits: 0, torrentUnits: 0 };

  for (const item of draft.items) {
    const unit = unitMap.get(item.unitId);
    if (!unit) continue;

    const { profiles, totalModels } = selectedProfiles(unit, item, detachmentNames);
    const keywords = normalized([...(unit.Keywords || []), ...(unit.FactionKeywords || []), ...(unit.CoreAbilities || []), ...(unit.UnitAbilities?.map(a => a.Title || '') || [])].join(' '));

    control.modelCount += totalModels;
    if (hasKeyword(keywords, 'battleline')) control.battlelineUnits += 1;
    if (hasKeyword(keywords, 'fly', 'vol')) mobility.flyUnits += 1;
    if (hasKeyword(keywords, 'deep strike', 'frappe en profondeur')) mobility.deepStrikeUnits += 1;
    if (hasKeyword(keywords, 'scouts', 'eclaireurs')) mobility.scoutUnits += 1;
    if (hasKeyword(keywords, 'infiltrators', 'infiltrateurs')) mobility.infiltratorUnits += 1;
    if (hasKeyword(keywords, 'stealth', 'furtivete')) utility.stealthUnits += 1;
    if (hasKeyword(keywords, 'lone operative', 'operateur solitaire')) utility.loneOperativeUnits += 1;
    if (hasKeyword(keywords, 'feel no pain', 'insensible a la douleur')) utility.feelNoPainUnits += 1;
    if (profiles.some(p => hasKeyword(keywordText(p.profile), 'indirect fire', 'tir indirect'))) utility.indirectFireUnits += 1;
    if (profiles.some(p => hasKeyword(keywordText(p.profile), 'torrent'))) utility.torrentUnits += 1;

    const statlines = getEstimatedStatlines(unit, item, totalModels);
    for (const { count, line, estimated } of statlines) {
      const w = expectedNumber(line.Wounds) ?? 0;
      const t = expectedNumber(line.Toughness) ?? 0;
      const sv = expectedNumber(line.Save) ?? 7;
      const oc = expectedNumber(line.OC) ?? 0;
      const m = expectedNumber(line.Movement);
      
      resilience.totalWounds += count * w;
      resilience.resolvedModels += count;
      control.totalObjectiveControl += count * oc;
      if (t >= 10) resilience.toughWounds += count * w;
      if (sv <= 2) resilience.saveTwoWounds += count * w;
      if (sv <= 3) resilience.saveThreeWounds += count * w;
      if (m !== null) {
        mobility.maximumMove = Math.max(mobility.maximumMove ?? 0, m);
      }
      if (estimated) resilience.unresolvedUnits += 1;
    }
    
    if (statlines.some(({ line }) => (expectedNumber(line.Movement) ?? 0) >= 10)) {
      mobility.fastUnits += 1;
    }

    for (const p of profiles.filter(x => !x.melee)) {
      const rng = expectedNumber(p.profile.Range);
      if (rng !== null) mobility.longestRange = Math.max(mobility.longestRange ?? 0, rng);
    }

    const unitDamageTargets = targets.map(tData => {
      const rangedDamage = getBestProfiles(profiles, tData.target, false).reduce((sum, p) => sum + expectedProfileDamage(p, tData.target), 0);
      const meleeDamage = getBestProfiles(profiles, tData.target, true).reduce((sum, p) => sum + expectedProfileDamage(p, tData.target), 0);
      tData.rangedDamage += rangedDamage;
      tData.meleeDamage += meleeDamage;
      if (rangedDamage + meleeDamage >= 0.5) tData.sourceUnits += 1;
      return { targetId: tData.target.id, rangedDamage, meleeDamage, totalDamage: rangedDamage + meleeDamage };
    });

    unitDamages.push({
      itemId: item.id,
      unitId: unit.id,
      unitName: unit.Name || 'Unite sans nom',
      modelCount: totalModels,
      points: calculateItemCost(database, item, draft.items, draft.detachmentIds).total,
      targets: unitDamageTargets
    });
  }

  return {
    targets: targets.map(({ target, rangedDamage, meleeDamage, sourceUnits }) => ({
      ...target,
      rangedDamage,
      meleeDamage,
      totalDamage: rangedDamage + meleeDamage,
      sourceUnits,
      sourcesPerThousand: (sourceUnits * 1000) / Math.max(1, draft.battleSizePoints),
      coverage: coverageLevel(sourceUnits, draft.battleSizePoints)
    })),
    unitDamages,
    mobility,
    resilience,
    control,
    utility,
    assumptions: ['statisticalAverage', 'situationalRules', 'textAbilities']
  };
}
