import { getPointSizes, resolvePointOption } from './calculations';
import { parseInvulSave } from './catalog';
import { modeKey } from './analysis';
import { sourceKeysForFaction } from './catalog';
import type { NormalizedDatabase, NormalizedUnit, RawWeaponProfile, RosterItem, WargearSelectionCounts } from './types';
import { getWargearRules, resolveModelCompositions, resolveWargear, ruleLimit, wargearCost, type SelectedWeaponProfile, type WargearResolution } from './wargear';

export const STATISTICS_ENGINE_VERSION = 'warforge-statistics/v1.1.0';
export const STATISTICS_GUIDE_VERSION = 'warforge-statistics-guide/v1.1.0';
export const STATISTICS_ANNOTATION_VERSION = 'warforge-statistics-annotations/v1.0.0';
export const STATISTICS_METRIC_DEFINITIONS = {
  mean: { unit: 'unité de la métrique', formula: 'Σ résultat × probabilité du résultat.' },
  median: { unit: 'unité de la métrique', formula: 'Premier résultat dont la probabilité cumulée atteint 50 %.' },
  quantiles: { unit: 'unité de la métrique', formula: 'Px = premier résultat dont la probabilité cumulée atteint x %.' },
  variance: { unit: 'unité²', formula: 'Variance = Σ (résultat − moyenne)² × probabilité ; écart-type = √variance.' },
  cv: { unit: 'ratio sans unité', formula: 'Coefficient de variation = écart-type ÷ moyenne.' },
  pmf: { unit: 'probabilité', formula: 'Convolution des événements indépendants, puis normalisation de la masse à 1.' },
  'useful-damage': { unit: 'PV', formula: 'Allocation attaque par attaque ; chaque attaque est plafonnée aux PV restants de la figurine blessée et son excédent est perdu.' },
  destroy: { unit: 'probabilité', formula: 'Somme des états d’allocation dans lesquels toutes les figurines de la cible sont détruites.' },
  losses: { unit: 'figurines', formula: 'Σ nombre de figurines détruites × probabilité de l’état final.' },
  'effective-wounds': { unit: 'PV équivalents', formula: 'PV bruts × dégâts bruts moyens de la menace ÷ dégâts utiles moyens reçus.' },
  efficiency: { unit: 'métrique/100 points', formula: 'Métrique × 100 ÷ coût exact de la configuration, équipement compris.' },
  percentile: { unit: 'percentile', formula: '(valeurs inférieures + moitié des égalités) ÷ effectif de la cohorte.' },
  breakpoint: { unit: 'seuil', formula: 'Comparer les distributions immédiatement avant et après un seuil de Force, PA, Dégâts, portée ou effectif.' },
  hazardous: { unit: 'échecs et PV propres', formula: 'Nombre de tests indépendants de Bernoulli avec P(échec)=1/6, puis conversion en dégâts propres selon le profil.' },
  'one-shot': { unit: 'PV', formula: 'Distribution séparée des armes One Shot ; elle n’entre pas dans la production répétable.' },
  mobility: { unit: 'pouces', formula: 'Projection au tir = Mouvement + portée maximale ; Advance=D6 et charge=2D6 sous baseline neutre.' },
  control: { unit: 'OC', formula: 'Somme de OC × effectif pour chaque profil de figurine résolu.' },
  survival: { unit: 'probabilité', formula: '1 − probabilité que l’allocation de la menace détruise toutes les figurines.' },
  coverage: { unit: 'niveau', formula: 'Complète seulement si aucun effet, condition ou équipement non structuré n’est susceptible de modifier la métrique.' },
  roles: { unit: 'score 0–1', formula: 'Critères versionnés évalués sur des cibles fixes, indépendamment de la cible active du dashboard.' }
} as const;

export type ProbabilityMass = ReadonlyArray<readonly [value: number, probability: number]>;

export interface ProbabilityDistribution {
  mass: ProbabilityMass;
  mean: number;
  variance: number;
  standardDeviation: number;
  coefficientOfVariation: number | null;
  minimum: number;
  maximum: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  zeroProbability: number;
}

export interface StatisticsTarget {
  id: string;
  label: string;
  toughness: number;
  save: number;
  invulnerableSave?: number;
  woundsPerModel: number;
  models: number;
  keywords: Array<'infantry' | 'monster' | 'vehicle'>;
}

export interface DefensiveThreat {
  id: string;
  label: string;
  attacks: string;
  skill: string;
  strength: string;
  ap: string;
  damage: string;
  keywords?: string;
}

export interface UnitAnalysisContext {
  target: StatisticsTarget;
  threat: DefensiveThreat;
  baseline: 'neutral';
}

export const STATISTICS_DISTANCE_BANDS = [0, 9, 12, 18, 24, 36] as const;

export type StatisticsAttackMode = 'melee' | 'pistol' | 'standard-ranged' | 'vehicle-combined';

export interface StatisticsDistanceContext {
  distance: number;
  mode: StatisticsAttackMode;
}

export interface StatisticsDistanceOffenseResult {
  distance: number;
  mode: StatisticsAttackMode;
  rawDamage: ProbabilityDistribution;
  usefulDamage: ProbabilityDistribution;
  destroyProbability: number;
  expectedModelsDestroyed: number;
  oneShotDamage: ProbabilityDistribution;
  hazardousTests: number;
  activeProfiles: string[];
  assumptions: string[];
}

export interface UnitConfiguration {
  id: string;
  unitId: string;
  pointIndex: number;
  modelCount: number;
  points: number;
  modelCounts: Record<string, number>;
  wargearSelectionCounts: WargearSelectionCounts;
  configurationHash: string;
  label: string;
  warnings: string[];
  requiredDetachments: string[];
  aggregate?: boolean;
}

export interface ResolvedModelProfile {
  compositionId: string;
  label: string;
  count: number;
  movement: number;
  toughness: number;
  save: number;
  invulnerableSave?: number;
  invulnerableDescription?: string;
  wounds: number;
  leadership: number;
  objectiveControl: number;
}

export type TacticalRole =
  | 'screen' | 'objective-holder' | 'scorer' | 'fast-projection' | 'ranged-damage'
  | 'melee-damage' | 'anti-horde' | 'anti-elite' | 'anti-vehicle' | 'anvil'
  | 'support' | 'transport' | 'reserve-pressure' | 'indirect-fire';

export interface TacticalRoleScore {
  role: TacticalRole;
  score: number;
  origin: 'computed';
  confidence: 'low' | 'medium' | 'high';
  criteriaVersion: string;
  rationale: string;
}

export interface MetricBenchmark {
  cohort: 'faction' | 'role' | 'playgroup';
  metric: BenchmarkMetric;
  sampleSize: number;
  percentile: number;
  rank: number;
  median: number;
  differenceFromMedian: number;
  cohortId: string;
}

export type BenchmarkMetric = 'damageEfficiency' | 'effectiveWoundsPerHundred' | 'objectiveControlPerHundred' | 'threatRange';

export interface UnitStatisticalProfile {
  id: string;
  engineVersion: string;
  catalogFingerprint: string;
  unitId: string;
  unitName: string;
  faction: string;
  sourceKey: string;
  keywords: string[];
  structuredAbilities: string[];
  configuration: UnitConfiguration;
  characteristics: {
    movement: number;
    toughness: number;
    save: number;
    invulnerableSave?: number;
    woundsPerModel: number;
    totalWounds: number;
    leadership: number;
    battleShockPassProbability: number;
    objectiveControlPerModel: number;
    totalObjectiveControl: number;
    profiles: ResolvedModelProfile[];
  };
  offense: {
    ranged: ProbabilityDistribution;
    melee: ProbabilityDistribution;
    total: ProbabilityDistribution;
    usefulDamage: ProbabilityDistribution;
    destroyProbability: number;
    expectedModelsDestroyed: number;
    hazardousTests: number;
    oneShotProfiles: number;
    oneShotDamage: ProbabilityDistribution;
    hazardousFailures: ProbabilityDistribution;
    hazardousSelfDamage: ProbabilityDistribution;
  };
  defense: {
    incomingDamage: ProbabilityDistribution;
    survivalProbability: number;
    effectiveWounds: number;
  };
  mobility: {
    move: number;
    advance: ProbabilityDistribution;
    charge: ProbabilityDistribution;
    chargeNineProbability: number;
    maximumRange: number;
    threatRange: number;
    fly: boolean;
    scouts: boolean;
    infiltrators: boolean;
    deepStrike: boolean;
  };
  control: {
    objectiveControlPerHundred: number;
    woundsPerHundred: number;
    models: number;
  };
  efficiency: {
    rangedDamagePerHundred: number;
    meleeDamagePerHundred: number;
    damagePerHundred: number;
    effectiveWoundsPerHundred: number;
    objectiveControlPerHundred: number;
    pointsPerUsefulDamage: number | null;
  };
  reliability: {
    coefficientOfVariation: number | null;
    zeroDamageProbability: number;
    interquartileRange: number;
  };
  roles: TacticalRoleScore[];
  unsupportedEffects: string[];
  coverage: 'complete' | 'partial';
  benchmarks: MetricBenchmark[];
  assumptions: string[];
  configurationSummary?: {
    count: number;
    points: { minimum: number; median: number; maximum: number };
    usefulDamage: { minimum: number; median: number; maximum: number };
    effectiveWounds: { minimum: number; median: number; maximum: number };
    objectiveControl: { minimum: number; median: number; maximum: number };
  };
}

export interface StatisticsDashboardState {
  granularity: 'units' | 'configurations';
  targetId: string;
  threatId: string;
  benchmark: 'faction' | 'role' | 'playgroup';
  search: string;
  factionIds: string[];
  roles: TacticalRole[];
  minimumPoints?: number;
  maximumPoints?: number;
  minimumDamage?: number;
  coverage?: UnitStatisticalProfile['coverage'];
  sort: Array<{ key: StatisticsSortKey; direction: 'asc' | 'desc' }>;
  selectedProfileIds: string[];
}

export type StatisticsSortKey = 'name' | 'faction' | 'points' | 'movement' | 'toughness' | 'wounds' | 'objectiveControl' | 'damage' | 'p10' | 'p90' | 'destroyProbability' | 'survivalProbability' | 'damageEfficiency' | 'durabilityEfficiency' | 'reliability' | 'threatRange';

export const STATISTICS_TARGETS: readonly StatisticsTarget[] = [
  { id: 'horde', label: 'Horde', toughness: 3, save: 5, woundsPerModel: 1, models: 20, keywords: ['infantry'] },
  { id: 'infantry', label: 'Infanterie', toughness: 4, save: 3, woundsPerModel: 2, models: 5, keywords: ['infantry'] },
  { id: 'elite', label: 'Élite', toughness: 6, save: 2, invulnerableSave: 4, woundsPerModel: 3, models: 5, keywords: ['infantry'] },
  { id: 'monster', label: 'Monstre', toughness: 10, save: 3, invulnerableSave: 5, woundsPerModel: 12, models: 1, keywords: ['monster'] },
  { id: 'vehicle', label: 'Véhicule', toughness: 10, save: 3, woundsPerModel: 12, models: 1, keywords: ['vehicle'] },
  { id: 'heavy', label: 'Blindé lourd', toughness: 12, save: 2, invulnerableSave: 5, woundsPerModel: 24, models: 1, keywords: ['vehicle'] }
];

export const DEFENSIVE_THREATS: readonly DefensiveThreat[] = [
  { id: 'small-arms', label: 'Armes légères', attacks: '20', skill: '3+', strength: '4', ap: '0', damage: '1' },
  { id: 'anti-infantry', label: 'Anti-infanterie', attacks: '10', skill: '3+', strength: '5', ap: '-1', damage: '2' },
  { id: 'anti-elite', label: 'Anti-élite', attacks: '6', skill: '3+', strength: '8', ap: '-2', damage: '3' },
  { id: 'anti-tank', label: 'Antichar', attacks: '4', skill: '3+', strength: '12', ap: '-3', damage: 'D6+1' },
  { id: 'heavy-damage', label: 'Dégâts lourds', attacks: '2', skill: '3+', strength: '16', ap: '-4', damage: 'D6+4' }
];

export const DEFAULT_STATISTICS_CONTEXT: UnitAnalysisContext = {
  target: STATISTICS_TARGETS[1],
  threat: DEFENSIVE_THREATS[2],
  baseline: 'neutral'
};

const EPSILON = 1e-12;

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function numeric(value: unknown, fallback = 0): number {
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function asMap(mass: ProbabilityMass): Map<number, number> {
  return new Map(mass);
}

export function normalizeMass(values: Map<number, number>): ProbabilityMass {
  const total = [...values.values()].reduce((sum, probability) => sum + probability, 0);
  if (total <= 0) return [[0, 1]];
  const retained = [...values.entries()].filter(([, probability]) => probability / total > EPSILON);
  const retainedTotal = retained.reduce((sum, [, probability]) => sum + probability, 0);
  return retained
    .map(([value, probability]) => [value, probability / retainedTotal] as const)
    .sort((left, right) => left[0] - right[0]);
}

export function convolve(left: ProbabilityMass, right: ProbabilityMass): ProbabilityMass {
  const result = new Map<number, number>();
  for (const [leftValue, leftProbability] of left) {
    for (const [rightValue, rightProbability] of right) {
      const value = leftValue + rightValue;
      result.set(value, (result.get(value) ?? 0) + leftProbability * rightProbability);
    }
  }
  return normalizeMass(result);
}

export function repeatMass(mass: ProbabilityMass, count: number): ProbabilityMass {
  let result: ProbabilityMass = [[0, 1]];
  let base = mass;
  let remaining = Math.max(0, Math.floor(count));
  while (remaining > 0) {
    if (remaining % 2 === 1) result = convolve(result, base);
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) base = convolve(base, base);
  }
  return result;
}

export function parseDiceMass(source: unknown): ProbabilityMass {
  if (typeof source === 'number' && Number.isFinite(source)) return [[source, 1]];
  const text = String(source ?? '').trim().replace(/\s+/g, '').toUpperCase();
  if (!text) return [[0, 1]];
  const dice = text.match(/^(\d*)D(\d+)([+-]\d+)?$/);
  if (!dice) return [[numeric(text), 1]];
  const count = Number(dice[1] || 1);
  const faces = Number(dice[2]);
  const modifier = Number(dice[3] || 0);
  let result: ProbabilityMass = [[0, 1]];
  const die: ProbabilityMass = Array.from({ length: faces }, (_, index) => [index + 1, 1 / faces] as const);
  result = repeatMass(die, count);
  if (modifier !== 0) result = result.map(([value, probability]) => [value + modifier, probability] as const);
  return result;
}

function quantile(mass: ProbabilityMass, threshold: number): number {
  let cumulative = 0;
  for (const [value, probability] of mass) {
    cumulative += probability;
    if (cumulative + EPSILON >= threshold) return value;
  }
  return mass.at(-1)?.[0] ?? 0;
}

export function summarizeMass(source: ProbabilityMass): ProbabilityDistribution {
  const mass = normalizeMass(asMap(source));
  const mean = mass.reduce((sum, [value, probability]) => sum + value * probability, 0);
  const variance = mass.reduce((sum, [value, probability]) => sum + ((value - mean) ** 2) * probability, 0);
  const standardDeviation = Math.sqrt(Math.max(0, variance));
  return {
    mass,
    mean,
    variance,
    standardDeviation,
    coefficientOfVariation: mean > 0 ? standardDeviation / mean : null,
    minimum: mass[0]?.[0] ?? 0,
    maximum: mass.at(-1)?.[0] ?? 0,
    median: quantile(mass, 0.5),
    p10: quantile(mass, 0.1),
    p25: quantile(mass, 0.25),
    p75: quantile(mass, 0.75),
    p90: quantile(mass, 0.9),
    zeroProbability: mass.find(([value]) => value === 0)?.[1] ?? 0
  };
}

function successChance(required: number): number {
  return Math.max(0, Math.min(1, (7 - required) / 6));
}

function woundRoll(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2;
  if (strength > toughness) return 3;
  if (strength === toughness) return 4;
  if (strength * 2 <= toughness) return 6;
  return 5;
}

function antiRequired(keywords: string, target: StatisticsTarget): number | null {
  for (const keyword of target.keywords) {
    const match = keywords.match(new RegExp(`anti[- ]${keyword}\\s*(\\d)\\+?`, 'i'));
    if (match) return Number(match[1]);
  }
  return null;
}

function sustainedHits(keywords: string): number {
  const match = keywords.match(/sustained hits\s*(\d+)?/i);
  return match ? Number(match[1] || 1) : 0;
}

function saveFailureChance(target: Pick<StatisticsTarget, 'save' | 'invulnerableSave'>, ap: number): number {
  const armour = Math.max(2, target.save - ap);
  const required = target.invulnerableSave ? Math.min(armour, target.invulnerableSave) : armour;
  return required > 6 ? 1 : 1 - successChance(required);
}

function shiftedMass(mass: ProbabilityMass, bonus: number): ProbabilityMass {
  return bonus === 0 ? mass : mass.map(([value, probability]) => [value + bonus, probability] as const);
}

function keywordBonus(keywords: string, pattern: RegExp): number {
  const match = keywords.match(pattern);
  return match ? Number(match[1] || 1) : 0;
}

function rapidFireBonus(keywords: string): number {
  return keywordBonus(keywords, /(?:rapid fire|tirs rapides?)\s*(\d+)?/i);
}

function meltaBonus(keywords: string): number {
  return keywordBonus(keywords, /(?:melta|fusion)\s*(\d+)?/i);
}

function profileRange(profile: RawWeaponProfile): number | null {
  if (normalized(profile.Range) === 'melee') return 0;
  const value = numeric(profile.Range, Number.NaN);
  return Number.isFinite(value) ? value : null;
}

function profileAvailableAtDistance(profile: RawWeaponProfile, distance?: number): boolean {
  if (distance === undefined) return true;
  const range = profileRange(profile);
  if (range === 0) return distance === 0;
  if (range === null || distance > range) return false;
  if (distance === 0) return normalized(profile.Keywords).includes('pistol');
  return true;
}

function halfRangeActive(profile: RawWeaponProfile, distance?: number): boolean {
  if (distance === undefined || distance <= 0) return false;
  const range = profileRange(profile);
  return range !== null && range > 0 && distance <= range / 2;
}

function damageAfterSave(profile: RawWeaponProfile, target: StatisticsTarget, automaticWound = false, damageBonus = 0): ProbabilityMass {
  const keywords = normalized(profile.Keywords);
  const strength = numeric(profile.Strength);
  const anti = antiRequired(keywords, target);
  const required = Math.min(woundRoll(strength, target.toughness), anti ?? 7);
  const baseWoundChance = automaticWound ? 1 : successChance(required);
  const baseCriticalChance = automaticWound ? 0 : (anti ? successChance(anti) : 1 / 6);
  const twinLinked = !automaticWound && keywords.includes('twin-linked');
  const woundChance = twinLinked ? baseWoundChance + (1 - baseWoundChance) * baseWoundChance : baseWoundChance;
  const criticalChance = twinLinked ? baseCriticalChance + (1 - baseWoundChance) * baseCriticalChance : baseCriticalChance;
  const saveFailure = saveFailureChance(target, numeric(profile.AP));
  const damagingChance = keywords.includes('devastating wounds')
    ? Math.min(1, Math.max(0, woundChance - criticalChance) * saveFailure + criticalChance)
    : woundChance * saveFailure;
  const damageMass = shiftedMass(parseDiceMass(profile.Damage), damageBonus);
  const result = new Map<number, number>([[0, 1 - damagingChance]]);
  for (const [damage, probability] of damageMass) result.set(damage, (result.get(damage) ?? 0) + damagingChance * probability);
  return normalizeMass(result);
}

function singleAttackDamage(profile: RawWeaponProfile, target: StatisticsTarget, damageBonus = 0): ProbabilityMass {
  const keywords = normalized(profile.Keywords);
  if (keywords.includes('torrent')) return damageAfterSave(profile, target, false, damageBonus);
  const hitRequired = Math.min(6, Math.max(2, numeric(profile.ToHit, 7)));
  const hitChance = successChance(hitRequired);
  const criticalHitChance = 1 / 6;
  const sustained = sustainedHits(keywords);
  const lethal = keywords.includes('lethal hits');
  const normalHitChance = Math.max(0, hitChance - criticalHitChance);
  const result = new Map<number, number>([[0, Math.max(0, 1 - hitChance)]]);
  const addBranch = (mass: ProbabilityMass, branchProbability: number): void => {
    for (const [value, probability] of mass) result.set(value, (result.get(value) ?? 0) + probability * branchProbability);
  };
  addBranch(damageAfterSave(profile, target, false, damageBonus), normalHitChance);
  let criticalMass: ProbabilityMass = lethal ? damageAfterSave(profile, target, true, damageBonus) : damageAfterSave(profile, target, false, damageBonus);
  if (sustained > 0) criticalMass = convolve(criticalMass, repeatMass(damageAfterSave(profile, target, false, damageBonus), sustained));
  addBranch(criticalMass, criticalHitChance);
  return normalizeMass(result);
}

export function weaponDamageMass(profile: RawWeaponProfile, target: StatisticsTarget, instances = 1, distance?: number): ProbabilityMass {
  if (!profileAvailableAtDistance(profile, distance)) return [[0, 1]];
  let attacks = parseDiceMass(profile.Attacks);
  const keywords = normalized(profile.Keywords);
  const halfRange = halfRangeActive(profile, distance);
  if (halfRange) {
    const bonus = rapidFireBonus(keywords);
    if (bonus > 0) attacks = attacks.map(([value, probability]) => [value + bonus, probability] as const);
  }
  if (keywords.includes('blast')) {
    const bonus = Math.floor(target.models / 5);
    attacks = attacks.map(([value, probability]) => [value + bonus, probability] as const);
  }
  const perAttack = singleAttackDamage(profile, target, halfRange ? meltaBonus(keywords) : 0);
  let oneWeapon = new Map<number, number>();
  for (const [attackCount, attackProbability] of attacks) {
    for (const [damage, damageProbability] of repeatMass(perAttack, attackCount)) {
      oneWeapon.set(damage, (oneWeapon.get(damage) ?? 0) + attackProbability * damageProbability);
    }
  }
  return repeatMass(normalizeMass(oneWeapon), instances);
}

function statisticalModeKey(entry: SelectedWeaponProfile): string {
  const name = String(entry.profile.Name ?? '').split(/\s+[–—-]\s+/u)[0];
  return `${entry.melee ? 'melee' : 'ranged'}\u0000${normalized(name || modeKey(entry))}`;
}

function bestModes(profiles: SelectedWeaponProfile[], target: StatisticsTarget, distance?: number): SelectedWeaponProfile[] {
  const modes = new Map<string, SelectedWeaponProfile>();
  for (const entry of profiles) {
    const key = statisticalModeKey(entry);
    const current = modes.get(key);
    if (!current || summarizeMass(weaponDamageMass(entry.profile, target, entry.count, distance)).mean > summarizeMass(weaponDamageMass(current.profile, target, current.count, distance)).mean) modes.set(key, entry);
  }
  return [...modes.values()];
}

function combineWeapons(profiles: SelectedWeaponProfile[], target: StatisticsTarget, distance?: number): ProbabilityMass {
  return profiles.reduce((mass, entry) => convolve(mass, weaponDamageMass(entry.profile, target, entry.count, distance)), [[0, 1]] as ProbabilityMass);
}

function compositionSelectedProfiles(profiles: SelectedWeaponProfile[], modelCount: number, target: StatisticsTarget, melee: boolean, oneShot: boolean): SelectedWeaponProfile[] {
  const candidates = bestModes(profiles.filter((profile) => profile.melee === melee && normalized(profile.profile.Keywords).includes('one shot') === oneShot), target);
  if (!melee) {
    const pistols = candidates.filter((entry) => normalized(entry.profile.Keywords).includes('pistol'));
    const otherWeapons = candidates.filter((entry) => !normalized(entry.profile.Keywords).includes('pistol'));
    const pistolMass = combineWeapons(pistols, target);
    const otherMass = combineWeapons(otherWeapons, target);
    return summarizeMass(pistolMass).mean > summarizeMass(otherMass).mean ? pistols : otherWeapons;
  }
  const extraAttacks = candidates.filter((entry) => normalized(entry.profile.Keywords).includes('extra attacks'));
  const primary = candidates.filter((entry) => !normalized(entry.profile.Keywords).includes('extra attacks'))
    .sort((left, right) => summarizeMass(weaponDamageMass(right.profile, target)).mean - summarizeMass(weaponDamageMass(left.profile, target)).mean);
  const selected: SelectedWeaponProfile[] = [];
  let remainingModels = modelCount;
  for (const entry of primary) {
    if (remainingModels <= 0) break;
    const count = Math.min(entry.count, remainingModels);
    if (count > 0) selected.push({ ...entry, count });
    remainingModels -= count;
  }
  return [...selected, ...extraAttacks];
}

function selectedSalvoProfiles(resolved: WargearResolution, target: StatisticsTarget, melee: boolean, oneShot = false): SelectedWeaponProfile[] {
  return resolved.byComposition.flatMap((composition) => compositionSelectedProfiles(composition.profiles, composition.composition.count, target, melee, oneShot));
}

function selectedProfilesForDistance(
  resolved: WargearResolution,
  target: StatisticsTarget,
  context: StatisticsDistanceContext,
  oneShot: boolean
): SelectedWeaponProfile[] {
  if (context.mode === 'melee') return selectedSalvoProfiles(resolved, target, true, oneShot);
  return resolved.byComposition.flatMap((composition) => {
    const candidates = bestModes(composition.profiles.filter((entry) => {
      if (entry.melee || normalized(entry.profile.Keywords).includes('one shot') !== oneShot) return false;
      const pistol = normalized(entry.profile.Keywords).includes('pistol');
      if (context.mode === 'pistol') return pistol;
      if (context.mode === 'standard-ranged') return !pistol;
      return true;
    }), target, context.distance);
    return candidates.filter((entry) => profileAvailableAtDistance(entry.profile, context.distance));
  });
}

export function calculateConfigurationOffenseAtDistance(
  unit: NormalizedUnit,
  configuration: UnitConfiguration,
  target: StatisticsTarget,
  context: StatisticsDistanceContext
): StatisticsDistanceOffenseResult {
  const item: RosterItem = {
    id: configuration.id,
    unitId: unit.id,
    pointIndex: configuration.pointIndex,
    modelCounts: configuration.modelCounts,
    wargearSelections: {},
    wargearSelectionCounts: configuration.wargearSelectionCounts
  };
  const resolved = resolveWargear(unit, item, configuration.requiredDetachments);
  const unitKeywords = normalized([...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].join(' '));
  const combinedAllowed = unitKeywords.includes('monster') || unitKeywords.includes('vehicle');
  const profiles = context.mode === 'vehicle-combined' && !combinedAllowed
    ? []
    : selectedProfilesForDistance(resolved, target, context, false);
  const oneShotProfiles = context.mode === 'vehicle-combined' && !combinedAllowed
    ? []
    : selectedProfilesForDistance(resolved, target, context, true);
  const rawMass = combineWeapons(profiles, target, context.distance);
  const allocation = allocateSelectedProfiles(profiles, target, context.distance);
  const oneShotAllocation = allocateSelectedProfiles(oneShotProfiles, target, context.distance);
  const activeProfiles = profiles.filter((entry) => summarizeMass(weaponDamageMass(entry.profile, target, entry.count, context.distance)).mean > 0);
  return {
    distance: context.distance,
    mode: context.mode,
    rawDamage: summarizeMass(rawMass),
    usefulDamage: summarizeMass(allocation.usefulDamage),
    destroyProbability: allocation.destroyProbability,
    expectedModelsDestroyed: summarizeMass(allocation.modelsDestroyed).mean,
    oneShotDamage: summarizeMass(oneShotAllocation.usefulDamage),
    hazardousTests: activeProfiles.filter((entry) => normalized(entry.profile.Keywords).includes('hazardous')).reduce((sum, entry) => sum + entry.count, 0),
    activeProfiles: activeProfiles.map((entry) => `${entry.count}x ${entry.profile.Name ?? entry.group}`),
    assumptions: [
      `distance-${context.distance}`,
      `attack-mode-${context.mode}`,
      'rapid-fire-and-melta-active-at-or-below-half-range',
      'melee-and-shooting-separated',
      ...(context.mode === 'vehicle-combined' && !combinedAllowed ? ['vehicle-combined-mode-not-legal'] : [])
    ]
  };
}

function capMass(mass: ProbabilityMass, maximum: number): ProbabilityMass {
  const result = new Map<number, number>();
  for (const [value, probability] of mass) {
    const capped = Math.min(maximum, value);
    result.set(capped, (result.get(capped) ?? 0) + probability);
  }
  return normalizeMass(result);
}

function probabilityAtLeast(mass: ProbabilityMass, threshold: number): number {
  return mass.reduce((sum, [value, probability]) => sum + (value >= threshold ? probability : 0), 0);
}

interface AllocationState {
  modelIndex: number;
  remainingWounds: number;
  probability: number;
}

export interface DamageAllocationResult {
  usefulDamage: ProbabilityMass;
  modelsDestroyed: ProbabilityMass;
  destroyProbability: number;
}

function allocationKey(modelIndex: number, remainingWounds: number): string {
  return `${modelIndex}:${remainingWounds}`;
}

function mergeAllocation(target: Map<string, AllocationState>, state: AllocationState): void {
  const key = allocationKey(state.modelIndex, state.remainingWounds);
  const current = target.get(key);
  if (current) current.probability += state.probability;
  else target.set(key, state);
}

function applyAllocatedAttack(
  states: Map<string, AllocationState>,
  modelWounds: readonly number[],
  damageForState: (state: AllocationState) => ProbabilityMass
): Map<string, AllocationState> {
  const next = new Map<string, AllocationState>();
  for (const state of states.values()) {
    if (state.modelIndex >= modelWounds.length) {
      mergeAllocation(next, { ...state });
      continue;
    }
    for (const [damage, probability] of damageForState(state)) {
      if (damage < state.remainingWounds) {
        mergeAllocation(next, { modelIndex: state.modelIndex, remainingWounds: state.remainingWounds - damage, probability: state.probability * probability });
      } else {
        const modelIndex = state.modelIndex + 1;
        mergeAllocation(next, { modelIndex, remainingWounds: modelIndex < modelWounds.length ? modelWounds[modelIndex] : 0, probability: state.probability * probability });
      }
    }
  }
  return next;
}

function applyVariableAttacks(
  states: Map<string, AllocationState>,
  attackCounts: ProbabilityMass,
  modelWounds: readonly number[],
  damageForState: (state: AllocationState) => ProbabilityMass
): Map<string, AllocationState> {
  const result = new Map<string, AllocationState>();
  for (const [attackCount, attackProbability] of attackCounts) {
    let branch = new Map([...states].map(([key, state]) => [key, { ...state, probability: state.probability * attackProbability }]));
    for (let attack = 0; attack < attackCount; attack += 1) branch = applyAllocatedAttack(branch, modelWounds, damageForState);
    for (const state of branch.values()) mergeAllocation(result, state);
  }
  return result;
}

function summarizeAllocation(states: Map<string, AllocationState>, modelWounds: readonly number[]): DamageAllocationResult {
  const useful = new Map<number, number>();
  const destroyed = new Map<number, number>();
  const prefixWounds = [0];
  modelWounds.forEach((wounds) => prefixWounds.push(prefixWounds.at(-1)! + wounds));
  for (const state of states.values()) {
    const usefulDamage = prefixWounds[state.modelIndex] + (state.modelIndex < modelWounds.length ? modelWounds[state.modelIndex] - state.remainingWounds : 0);
    useful.set(usefulDamage, (useful.get(usefulDamage) ?? 0) + state.probability);
    destroyed.set(state.modelIndex, (destroyed.get(state.modelIndex) ?? 0) + state.probability);
  }
  return {
    usefulDamage: normalizeMass(useful),
    modelsDestroyed: normalizeMass(destroyed),
    destroyProbability: [...states.values()].filter((state) => state.modelIndex >= modelWounds.length).reduce((sum, state) => sum + state.probability, 0)
  };
}

/** Applies each attack independently; excess damage from one attack never spills to the next model. */
export function allocateDamageMass(perAttack: ProbabilityMass, attackCounts: ProbabilityMass, woundsPerModel: number, models: number): DamageAllocationResult {
  const modelWounds = Array.from({ length: Math.max(0, models) }, () => Math.max(1, woundsPerModel));
  if (modelWounds.length === 0) return { usefulDamage: [[0, 1]], modelsDestroyed: [[0, 1]], destroyProbability: 1 };
  const initial = new Map<string, AllocationState>([[allocationKey(0, modelWounds[0]), { modelIndex: 0, remainingWounds: modelWounds[0], probability: 1 }]]);
  return summarizeAllocation(applyVariableAttacks(initial, attackCounts, modelWounds, () => perAttack), modelWounds);
}

function weaponAttackCounts(profile: RawWeaponProfile, targetModels: number, distance?: number): ProbabilityMass {
  if (!profileAvailableAtDistance(profile, distance)) return [[0, 1]];
  let attacks = parseDiceMass(profile.Attacks);
  const keywords = normalized(profile.Keywords);
  if (halfRangeActive(profile, distance)) {
    const bonus = rapidFireBonus(keywords);
    if (bonus > 0) attacks = attacks.map(([value, probability]) => [value + bonus, probability] as const);
  }
  if (keywords.includes('blast')) {
    const bonus = Math.floor(targetModels / 5);
    attacks = attacks.map(([value, probability]) => [value + bonus, probability] as const);
  }
  return attacks;
}

function allocateSelectedProfiles(profiles: SelectedWeaponProfile[], target: StatisticsTarget, distance?: number): DamageAllocationResult {
  const modelWounds = Array.from({ length: target.models }, () => target.woundsPerModel);
  if (modelWounds.length === 0) return { usefulDamage: [[0, 1]], modelsDestroyed: [[0, 1]], destroyProbability: 1 };
  let states = new Map<string, AllocationState>([[allocationKey(0, modelWounds[0]), { modelIndex: 0, remainingWounds: modelWounds[0], probability: 1 }]]);
  for (const entry of profiles) {
    for (let instance = 0; instance < entry.count; instance += 1) {
      const damageBonus = halfRangeActive(entry.profile, distance) ? meltaBonus(normalized(entry.profile.Keywords)) : 0;
      states = applyVariableAttacks(states, weaponAttackCounts(entry.profile, target.models, distance), modelWounds, () => singleAttackDamage(entry.profile, target, damageBonus));
    }
  }
  return summarizeAllocation(states, modelWounds);
}

function enumerateCounts(options: readonly string[], maximum: number, index = 0, used = 0, current: Record<string, number> = {}): Record<string, number>[] {
  if (index >= options.length) return [{ ...current }];
  const results: Record<string, number>[] = [];
  for (let count = 0; count <= maximum - used; count += 1) {
    if (count > 0) current[options[index]] = count;
    else delete current[options[index]];
    results.push(...enumerateCounts(options, maximum, index + 1, used + count, current));
  }
  delete current[options[index]];
  return results;
}

function enumerateCompositions(unit: NormalizedUnit, pointIndex: number): Array<Record<string, number>> {
  const base = resolveModelCompositions(unit, { pointIndex });
  const total = resolvePointOption(unit, pointIndex)?.modelCount ?? 0;
  const results: Array<Record<string, number>> = [];
  const visit = (index: number, remaining: number, current: Record<string, number>): void => {
    if (index === base.length) {
      if (remaining === 0) results.push({ ...current });
      return;
    }
    const composition = base[index];
    for (let count = composition.min; count <= Math.min(composition.max, remaining); count += 1) {
      current[composition.id] = count;
      visit(index + 1, remaining - count, current);
    }
    delete current[composition.id];
  };
  visit(0, total, {});
  return results.length > 0 ? results : [Object.fromEntries(base.map((entry) => [entry.id, entry.count]))];
}

function equipmentPieces(value: string): Array<{ name: string; count: number }> {
  return value
    .replace(/[–—]/g, '-')
    .split(/\s*(?:,|\band\b)\s*/iu)
    .flatMap((part) => {
      const match = part.trim().match(/^(\d+)\s+(.+)$/u);
      const name = normalized(match?.[2] ?? part);
      return name ? [{ name, count: Number(match?.[1] ?? 1) }] : [];
    });
}

function replacementSelectionIsPossible(
  unit: NormalizedUnit,
  compositions: ReturnType<typeof resolveModelCompositions>,
  rules: ReturnType<typeof getWargearRules>,
  selections: WargearSelectionCounts
): boolean {
  const available = new Map<string, number>();
  unit.UnitComposition?.ModelCompositions?.forEach((composition, compositionIndex) => {
    const compositionId = `c${compositionIndex}`;
    const count = compositions.find((entry) => entry.id === compositionId)?.count ?? 0;
    composition.Wargear?.forEach((wargear) => wargear.InitalWargear?.forEach((entry) => {
      equipmentPieces(entry).forEach((piece) => {
        const key = `${compositionId}:${piece.name}`;
        available.set(key, (available.get(key) ?? 0) + piece.count * count);
      });
    }));
  });
  const used = new Map<string, number>();
  for (const rule of rules) {
    const selectedTotal = Object.values(selections[rule.id] ?? {}).reduce((sum, count) => sum + count, 0);
    if (selectedTotal === 0) continue;
    for (const replaced of rule.replaces) {
      for (const piece of equipmentPieces(replaced)) {
        const key = `${rule.compositionId}:${piece.name}`;
        const next = (used.get(key) ?? 0) + piece.count * selectedTotal;
        if (next > (available.get(key) ?? 0)) return false;
        used.set(key, next);
      }
    }
  }
  return true;
}

function partialSelectionSignature(
  rules: ReturnType<typeof getWargearRules>,
  selections: WargearSelectionCounts
): string {
  const additions = new Map<string, number>();
  const replacements = new Map<string, number>();
  const detachments = new Set<string>();
  const add = (target: Map<string, number>, key: string, count: number) => target.set(key, (target.get(key) ?? 0) + count);
  for (const rule of rules) {
    const selected = selections[rule.id] ?? {};
    const selectedTotal = Object.values(selected).reduce((sum, count) => sum + count, 0);
    if (selectedTotal === 0) continue;
    if (rule.requiredDetachment) detachments.add(normalized(rule.requiredDetachment));
    for (const [option, count] of Object.entries(selected)) {
      // The public configuration identity is an aggregate statistical arsenal.
      // Equipment assigned to two compositions is interchangeable when its
      // global profile/count is identical; legality still remains separated
      // below through composition-scoped replacement consumption.
      for (const piece of equipmentPieces(option)) add(additions, piece.name, piece.count * count);
    }
    for (const replaced of rule.replaces) {
      for (const piece of equipmentPieces(replaced)) add(replacements, `${rule.compositionId}:${piece.name}`, piece.count * selectedTotal);
    }
  }
  const sorted = (values: Map<string, number>) => [...values].sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify({ additions: sorted(additions), replacements: sorted(replacements), detachments: [...detachments].sort() });
}

export function enumerateUnitConfigurations(unit: NormalizedUnit): UnitConfiguration[] {
  const configurations: UnitConfiguration[] = [];
  const seen = new Set<string>();
  getPointSizes(unit).forEach((point, pointIndex) => {
    for (const modelCounts of enumerateCompositions(unit, pointIndex)) {
      const baseItem: RosterItem = { id: 'statistics', unitId: unit.id, pointIndex, modelCounts, wargearSelections: {} };
      const compositions = resolveModelCompositions(unit, baseItem);
      const rules = getWargearRules(unit);
      let selections: WargearSelectionCounts[] = [{}];
      for (const [ruleIndex, rule] of rules.entries()) {
        const compositionCount = compositions.find((entry) => entry.id === rule.compositionId)?.count ?? 0;
        const variants = enumerateCounts(rule.options, ruleLimit(rule, compositionCount, point.modelCount));
        const appliedRules = rules.slice(0, ruleIndex + 1);
        const candidates = selections.flatMap((existing) => variants.flatMap((variant) => {
          const candidate = Object.keys(variant).length > 0 ? { ...existing, [rule.id]: variant } : existing;
          // Over-replacing initial equipment cannot be repaired by a later
          // rule. Pruning this exact constraint avoids huge illegal products.
          return replacementSelectionIsPossible(unit, compositions, appliedRules, candidate) ? [candidate] : [];
        }));
        selections = [...new Map(candidates.map((candidate) => [partialSelectionSignature(appliedRules, candidate), candidate])).values()];
      }
      for (const wargearSelectionCounts of selections) {
        const item: RosterItem = { ...baseItem, wargearSelectionCounts };
        const requiredDetachments = [...new Set(rules.filter((rule) => rule.requiredDetachment && Object.values(wargearSelectionCounts[rule.id] ?? {}).some((count) => count > 0)).map((rule) => rule.requiredDetachment!))].sort();
        const resolved = resolveWargear(unit, item, requiredDetachments);
        if (resolved.warnings.length > 0) continue;
        const signature = JSON.stringify({ pointIndex, modelCounts, requiredDetachments, arsenal: resolved.arsenal.map((entry) => [entry.name, entry.count]).sort() });
        if (seen.has(signature)) continue;
        seen.add(signature);
        const hash = fnv1a(`${unit.id}:${signature}`);
        const choices = resolved.arsenal.map((entry) => `${entry.count}× ${entry.name}`).join(', ');
        configurations.push({
          id: `${unit.id}:${hash}`,
          unitId: unit.id,
          pointIndex,
          modelCount: point.modelCount,
          points: (resolvePointOption(unit, pointIndex)?.cost ?? 0) + wargearCost(unit, item),
          modelCounts,
          wargearSelectionCounts,
          configurationHash: hash,
          label: `${point.modelCount} fig. · ${choices || 'équipement non résolu'}`,
          warnings: resolved.nonProfileEquipment.filter((entry) => entry.grantsAbilities.length === 0).map((entry) => `Profil d’arme absent : ${entry.name}`),
          requiredDetachments
        });
      }
    }
  });
  return configurations;
}

export function defaultUnitConfiguration(unit: NormalizedUnit): UnitConfiguration | null {
  const point = getPointSizes(unit)[0];
  if (!point) return null;
  const pointIndex = 0;
  const item: RosterItem = { id: 'statistics-default', unitId: unit.id, pointIndex, wargearSelections: {} };
  const resolved = resolveWargear(unit, item);
  const modelCounts = Object.fromEntries(resolved.compositions.map((entry) => [entry.id, entry.count]));
  const signature = JSON.stringify({ pointIndex, modelCounts, arsenal: resolved.arsenal.map((entry) => [entry.name, entry.count]).sort() });
  const hash = fnv1a(`${unit.id}:${signature}`);
  return {
    id: `${unit.id}:${hash}`,
    unitId: unit.id,
    pointIndex,
    modelCount: point.modelCount,
    points: (resolvePointOption(unit, pointIndex)?.cost ?? 0) + wargearCost(unit, item),
    modelCounts,
    wargearSelectionCounts: {},
    configurationHash: hash,
    label: `${point.modelCount} fig. · ${resolved.arsenal.map((entry) => `${entry.count}× ${entry.name}`).join(', ') || 'équipement non résolu'}`,
    warnings: [...resolved.warnings, ...resolved.nonProfileEquipment.filter((entry) => entry.grantsAbilities.length === 0).map((entry) => `Profil d’arme absent : ${entry.name}`)],
    requiredDetachments: []
  };
}

function keywordFlags(unit: NormalizedUnit): string {
  return normalized([...(unit.Keywords ?? []), ...(unit.CoreAbilities ?? []), ...(unit.UnitAbilities ?? []).map((ability) => ability.Title)].join(' '));
}

function battleShockPass(leadership: number): number {
  const mass = parseDiceMass('2D6');
  return probabilityAtLeast(mass, leadership);
}

function resolvedModelProfiles(unit: NormalizedUnit, resolved: WargearResolution): ResolvedModelProfile[] {
  const lines = unit.StatLines?.length ? unit.StatLines : [{}];
  return resolved.compositions.filter((composition) => composition.count > 0).map((composition, index) => {
    const line = lines.length === 1 ? lines[0] : lines[Math.min(index, lines.length - 1)];
    const invulnerable = parseInvulSave(line);
    return {
      compositionId: composition.id,
      label: composition.label,
      count: composition.count,
      movement: numeric(line.Movement),
      toughness: numeric(line.Toughness),
      save: numeric(line.Save, 7),
      invulnerableSave: invulnerable ? numeric(invulnerable.save) : undefined,
      invulnerableDescription: invulnerable?.description,
      wounds: numeric(line.Wounds),
      leadership: numeric(line.Leadership, 7),
      objectiveControl: numeric(line.OC)
    };
  });
}

function rangedInvulnerable(profile: ResolvedModelProfile): number | undefined {
  const description = normalized(profile.invulnerableDescription);
  if (description.includes('melee attacks only') || description.includes('melee attack only')) return undefined;
  return profile.invulnerableSave;
}

function modelTarget(unit: NormalizedUnit, profile: ResolvedModelProfile): StatisticsTarget {
  const keywords = keywordFlags(unit);
  return {
    id: unit.id,
    label: unit.displayName,
    toughness: profile.toughness,
    save: profile.save,
    invulnerableSave: rangedInvulnerable(profile),
    woundsPerModel: profile.wounds,
    models: 1,
    keywords: [keywords.includes('infantry') ? 'infantry' : null, keywords.includes('monster') ? 'monster' : null, keywords.includes('vehicle') ? 'vehicle' : null].filter((value): value is StatisticsTarget['keywords'][number] => value !== null)
  };
}

function allocateThreat(unit: NormalizedUnit, profiles: ResolvedModelProfile[], threat: DefensiveThreat): DamageAllocationResult {
  const models = profiles.flatMap((profile) => Array.from({ length: profile.count }, () => profile));
  const modelWounds = models.map((profile) => profile.wounds);
  if (models.length === 0) return { usefulDamage: [[0, 1]], modelsDestroyed: [[0, 1]], destroyProbability: 1 };
  const initial = new Map<string, AllocationState>([[allocationKey(0, modelWounds[0]), { modelIndex: 0, remainingWounds: modelWounds[0], probability: 1 }]]);
  const weapon = threatProfile(threat);
  const states = applyVariableAttacks(initial, weaponAttackCounts(weapon, models.length), modelWounds, (state) => singleAttackDamage(weapon, modelTarget(unit, models[Math.min(state.modelIndex, models.length - 1)])));
  return summarizeAllocation(states, modelWounds);
}

function threatProfile(threat: DefensiveThreat): RawWeaponProfile {
  return { Name: threat.label, Range: '24', Attacks: threat.attacks, ToHit: threat.skill, Strength: threat.strength, AP: threat.ap, Damage: threat.damage, Keywords: threat.keywords };
}

const ROLE_CRITERIA_VERSION = 'warforge-statistical-roles/v1.1.0';

function deriveRoles(profile: Omit<UnitStatisticalProfile, 'roles' | 'benchmarks'>, unit: NormalizedUnit, resolved: WargearResolution): TacticalRoleScore[] {
  const roles: TacticalRoleScore[] = [];
  const keywords = keywordFlags(unit);
  const add = (role: TacticalRole, score: number, rationale: string, confidence: TacticalRoleScore['confidence'] = 'medium') => roles.push({ role, score: Math.min(1, score), origin: 'computed', confidence, criteriaVersion: ROLE_CRITERIA_VERSION, rationale });
  const targetResult = (target: StatisticsTarget): { damagePerHundred: number; destroyed: number; destroyProbability: number; ranged: number; melee: number } => {
    const rangedProfiles = selectedSalvoProfiles(resolved, target, false);
    const meleeProfiles = selectedSalvoProfiles(resolved, target, true);
    const rangedMass = combineWeapons(rangedProfiles, target);
    const meleeMass = combineWeapons(meleeProfiles, target);
    const rawMass = convolve(rangedMass, meleeMass);
    const useful = summarizeMass(capMass(rawMass, target.woundsPerModel * target.models));
    return {
      damagePerHundred: useful.mean * 100 / Math.max(1, profile.configuration.points),
      destroyed: Math.min(target.models, useful.mean / Math.max(1, target.woundsPerModel)),
      destroyProbability: probabilityAtLeast(rawMass, target.woundsPerModel * target.models),
      ranged: summarizeMass(rangedMass).mean,
      melee: summarizeMass(meleeMass).mean
    };
  };
  const infantry = targetResult(STATISTICS_TARGETS[1]);
  const horde = targetResult(STATISTICS_TARGETS[0]);
  const elite = targetResult(STATISTICS_TARGETS[2]);
  const vehicle = targetResult(STATISTICS_TARGETS[4]);
  if (profile.configuration.modelCount >= 10 && profile.configuration.points <= 150) add('screen', 0.8, 'Au moins 10 figurines pour 150 points ou moins.');
  if (profile.control.objectiveControlPerHundred >= 4) add('objective-holder', 0.8, 'OC par 100 points supérieur ou égal à 4.');
  if (profile.mobility.move >= 10 || profile.mobility.deepStrike || profile.mobility.infiltrators) add('scorer', 0.75, 'Mouvement élevé ou déploiement intrinsèque avancé.');
  if (profile.mobility.threatRange >= 24 || profile.mobility.deepStrike) add('fast-projection', 0.75, 'Projection d’au moins 24 pouces ou Deep Strike.');
  if (infantry.ranged >= infantry.melee && infantry.ranged > 0.5) add('ranged-damage', 0.7, 'Le tir domine la mêlée contre la cible Infanterie versionnée.');
  if (infantry.melee > infantry.ranged && infantry.melee > 0.5) add('melee-damage', 0.7, 'La mêlée domine le tir contre la cible Infanterie versionnée.');
  if (horde.destroyed >= 3 && horde.damagePerHundred >= 3) add('anti-horde', 0.7, 'Au moins 3 pertes attendues et 3 dégâts utiles/100 points contre Horde.', 'medium');
  if (elite.damagePerHundred >= 3 && elite.destroyProbability >= 0.15) add('anti-elite', 0.7, 'Rendement et probabilité de destruction mesurés contre Élite.', 'medium');
  if (vehicle.damagePerHundred >= 2.5 || vehicle.destroyProbability >= 0.2) add('anti-vehicle', 0.7, 'Rendement mesuré contre la cible Véhicule E10/Sv3+/12 PV.', 'medium');
  if (profile.efficiency.effectiveWoundsPerHundred >= 10) add('anvil', 0.75, 'Au moins 10 PV effectifs par 100 points contre la menace active.');
  if (keywords.includes('transport')) add('transport', 1, 'Mot-clé Transport officiel.', 'high');
  if (profile.mobility.deepStrike) add('reserve-pressure', 0.9, 'Deep Strike intrinsèque détecté.', 'high');
  if (resolved.profiles.some((entry) => normalized(entry.profile.Keywords).includes('indirect fire'))) add('indirect-fire', 0.9, 'Au moins une arme résolue possède Indirect Fire.', 'high');
  if ((unit.CoreAbilities ?? []).some((ability) => normalized(ability) === 'leader') && (unit.UnitAbilities?.length ?? 0) > 0) add('support', 0.45, 'Leader possédant au moins une aptitude de datasheet ; effet non présumé actif.', 'low');
  return roles;
}

export function calculateUnitStatisticalProfile(database: NormalizedDatabase, unit: NormalizedUnit, configuration: UnitConfiguration, context: UnitAnalysisContext = DEFAULT_STATISTICS_CONTEXT, includeRoles = true): UnitStatisticalProfile {
  const item: RosterItem = { id: configuration.id, unitId: unit.id, pointIndex: configuration.pointIndex, modelCounts: configuration.modelCounts, wargearSelections: {}, wargearSelectionCounts: configuration.wargearSelectionCounts };
  const resolved = resolveWargear(unit, item, configuration.requiredDetachments);
  const modelProfiles = resolvedModelProfiles(unit, resolved);
  const firstProfile = modelProfiles[0] ?? { movement: 0, toughness: 0, save: 7, wounds: 0, leadership: 7, objectiveControl: 0 };
  const movement = modelProfiles.reduce((minimum, profile) => Math.min(minimum, profile.movement || minimum), firstProfile.movement);
  const toughness = firstProfile.toughness;
  const save = firstProfile.save;
  const invulnerableSave = firstProfile.invulnerableSave;
  const leadership = modelProfiles.reduce((best, profile) => Math.min(best, profile.leadership), firstProfile.leadership);
  const totalWounds = modelProfiles.reduce((sum, profile) => sum + profile.wounds * profile.count, 0);
  const totalObjectiveControl = modelProfiles.reduce((sum, profile) => sum + profile.objectiveControl * profile.count, 0);
  const woundsPerModel = configuration.modelCount > 0 ? totalWounds / configuration.modelCount : 0;
  const oc = configuration.modelCount > 0 ? totalObjectiveControl / configuration.modelCount : 0;
  const rangedProfiles = selectedSalvoProfiles(resolved, context.target, false);
  const meleeProfiles = selectedSalvoProfiles(resolved, context.target, true);
  const oneShotProfiles = [...selectedSalvoProfiles(resolved, context.target, false, true), ...selectedSalvoProfiles(resolved, context.target, true, true)];
  const rangedMass = combineWeapons(rangedProfiles, context.target);
  const meleeMass = combineWeapons(meleeProfiles, context.target);
  const totalMass = convolve(rangedMass, meleeMass);
  const allocation = allocateSelectedProfiles([...rangedProfiles, ...meleeProfiles], context.target);
  const oneShotAllocation = allocateSelectedProfiles(oneShotProfiles, context.target);
  const incomingAllocation = allocateThreat(unit, modelProfiles, context.threat);
  const incomingMass = incomingAllocation.usefulDamage;
  const ranged = summarizeMass(rangedMass);
  const melee = summarizeMass(meleeMass);
  const total = summarizeMass(totalMass);
  const usefulDamage = summarizeMass(allocation.usefulDamage);
  const incomingDamage = summarizeMass(incomingMass);
  const maximumRange = resolved.profiles.filter((profile) => !profile.melee).reduce((maximum, profile) => Math.max(maximum, numeric(profile.profile.Range)), 0);
  const keywords = keywordFlags(unit);
  const supportedCoreAbility = (ability: string): boolean => /^(?:deep strike|infiltrators|scouts(?:\s+\d+"?)?)$/u.test(normalized(ability).trim());
  const unsupportedEffects = [...new Set([
    ...(unit.UnitAbilities ?? []).map((ability) => ability.Title ?? 'Aptitude sans titre'),
    ...(unit.CoreAbilities ?? []).filter((ability) => !supportedCoreAbility(ability)),
    ...resolved.arsenal.flatMap((entry) => entry.grantsAbilities.map((ability) => `${entry.name} : ${ability}`)),
    ...modelProfiles.flatMap((profile) => profile.invulnerableDescription ? [`${profile.label} : sauvegarde invulnérable conditionnelle (${profile.invulnerableDescription})`] : []),
    ...resolved.byComposition.flatMap((composition) => {
      const hasPistol = composition.profiles.some((profile) => !profile.melee && normalized(profile.profile.Keywords).includes('pistol'));
      const hasOther = composition.profiles.some((profile) => !profile.melee && !normalized(profile.profile.Keywords).includes('pistol'));
      return hasPistol && hasOther ? [`${composition.composition.label} : répartition exacte Pistolet/autres armes entre porteurs non structurée`] : [];
    }),
    ...(unit.StatLines?.length && unit.StatLines.length !== resolved.compositions.length && unit.StatLines.length > 1 ? ['Correspondance profils/figurines estimée selon l’ordre du catalogue'] : [])
  ].filter(Boolean))];
  const points = Math.max(1, configuration.points);
  const threatAttackMean = summarizeMass(parseDiceMass(context.threat.attacks)).mean;
  const threatDamageMean = summarizeMass(parseDiceMass(context.threat.damage)).mean;
  const rawThreatDamage = threatAttackMean * successChance(Math.min(6, Math.max(2, numeric(context.threat.skill, 7)))) * threatDamageMean;
  const effectiveWounds = incomingDamage.mean > 0 ? totalWounds * (rawThreatDamage / incomingDamage.mean) : totalWounds;
  const hazardousTests = [...rangedProfiles, ...meleeProfiles, ...oneShotProfiles].filter((profile) => normalized(profile.profile.Keywords).includes('hazardous')).reduce((sum, profile) => sum + profile.count, 0);
  const hazardousFailuresMass = repeatMass([[0, 5 / 6], [1, 1 / 6]], hazardousTests);
  const hazardousDamagePerFailure = keywords.includes('character') || keywords.includes('vehicle') || keywords.includes('monster') ? 3 : Math.max(1, firstProfile.wounds);
  const hazardousSelfDamageMass = capMass(hazardousFailuresMass.map(([failures, probability]) => [failures * hazardousDamagePerFailure, probability] as const), totalWounds);
  const base: Omit<UnitStatisticalProfile, 'roles' | 'benchmarks'> = {
    id: `${configuration.id}:${context.target.id}:${context.threat.id}`,
    engineVersion: STATISTICS_ENGINE_VERSION,
    catalogFingerprint: database.fingerprint,
    unitId: unit.id,
    unitName: unit.displayName,
    faction: unit.factionName,
    sourceKey: unit.sourceKey,
    keywords: [...new Set([...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])])],
    structuredAbilities: (unit.CoreAbilities ?? []).filter((ability) => supportedCoreAbility(ability)),
    configuration,
    characteristics: { movement, toughness, save, invulnerableSave, woundsPerModel, totalWounds, leadership, battleShockPassProbability: battleShockPass(leadership), objectiveControlPerModel: oc, totalObjectiveControl, profiles: modelProfiles },
    offense: {
      ranged,
      melee,
      total,
      usefulDamage,
      destroyProbability: allocation.destroyProbability,
      expectedModelsDestroyed: summarizeMass(allocation.modelsDestroyed).mean,
      hazardousTests,
      oneShotProfiles: oneShotProfiles.reduce((sum, profile) => sum + profile.count, 0),
      oneShotDamage: summarizeMass(oneShotAllocation.usefulDamage),
      hazardousFailures: summarizeMass(hazardousFailuresMass),
      hazardousSelfDamage: summarizeMass(hazardousSelfDamageMass)
    },
    defense: { incomingDamage, survivalProbability: 1 - incomingAllocation.destroyProbability, effectiveWounds },
    mobility: {
      move: movement,
      advance: summarizeMass(parseDiceMass('D6')),
      charge: summarizeMass(parseDiceMass('2D6')),
      chargeNineProbability: probabilityAtLeast(parseDiceMass('2D6'), 9),
      maximumRange,
      threatRange: movement + maximumRange,
      fly: keywords.includes('fly'),
      scouts: keywords.includes('scouts'),
      infiltrators: keywords.includes('infiltrators'),
      deepStrike: keywords.includes('deep strike')
    },
    control: { objectiveControlPerHundred: (oc * configuration.modelCount * 100) / points, woundsPerHundred: (totalWounds * 100) / points, models: configuration.modelCount },
    efficiency: {
      rangedDamagePerHundred: (ranged.mean * 100) / points,
      meleeDamagePerHundred: (melee.mean * 100) / points,
      damagePerHundred: (usefulDamage.mean * 100) / points,
      effectiveWoundsPerHundred: (effectiveWounds * 100) / points,
      objectiveControlPerHundred: (oc * configuration.modelCount * 100) / points,
      pointsPerUsefulDamage: usefulDamage.mean > 0 ? points / usefulDamage.mean : null
    },
    reliability: { coefficientOfVariation: total.coefficientOfVariation, zeroDamageProbability: total.zeroProbability, interquartileRange: total.p75 - total.p25 },
    unsupportedEffects,
    coverage: unsupportedEffects.length > 0 || configuration.warnings.length > 0 ? 'partial' : 'complete',
    assumptions: ['baseline-neutral', 'target-visible-and-in-range', 'outside-half-range', 'no-cover', 'no-external-buffs', 'text-abilities-not-applied', 'ranged-and-melee-total-is-combined-cycle', 'defensive-allocation-follows-source-composition-order']
  };
  return { ...base, roles: includeRoles ? deriveRoles(base, unit, resolved) : [], benchmarks: [] };
}

function percentileFromSorted(sorted: readonly number[], value: number, knownMedian?: number): { percentile: number; rank: number; median: number } {
  if (sorted.length === 0) return { percentile: 0, rank: 0, median: 0 };
  let below = 0; while (below < sorted.length && sorted[below] < value) below += 1;
  let upper = below; while (upper < sorted.length && sorted[upper] === value) upper += 1;
  const equal = upper - below;
  return { percentile: ((below + equal * 0.5) / sorted.length) * 100, rank: sorted.length - below, median: knownMedian ?? quantile(sorted.map((candidate) => [candidate, 1 / sorted.length] as const), 0.5) };
}

export function percentile(values: readonly number[], value: number): { percentile: number; rank: number; median: number } {
  return percentileFromSorted([...values].filter(Number.isFinite).sort((left, right) => left - right), value);
}

function medianNumber(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rangeSummary(values: readonly number[]): { minimum: number; median: number; maximum: number } {
  return { minimum: Math.min(...values), median: medianNumber(values), maximum: Math.max(...values) };
}

export function aggregateUnitProfiles(profiles: UnitStatisticalProfile[]): UnitStatisticalProfile | null {
  if (profiles.length === 0) return null;
  const damageMedian = medianNumber(profiles.map((profile) => profile.offense.usefulDamage.mean));
  const representative = [...profiles].sort((left, right) => Math.abs(left.offense.usefulDamage.mean - damageMedian) - Math.abs(right.offense.usefulDamage.mean - damageMedian) || left.configuration.configurationHash.localeCompare(right.configuration.configurationHash))[0];
  const summary = {
    count: profiles.length,
    points: rangeSummary(profiles.map((profile) => profile.configuration.points)),
    usefulDamage: rangeSummary(profiles.map((profile) => profile.offense.usefulDamage.mean)),
    effectiveWounds: rangeSummary(profiles.map((profile) => profile.defense.effectiveWounds)),
    objectiveControl: rangeSummary(profiles.map((profile) => profile.characteristics.totalObjectiveControl))
  };
  return {
    ...representative,
    id: `${representative.unitId}:aggregate:${representative.id.split(':').slice(-2).join(':')}`,
    configuration: {
      ...representative.configuration,
      id: `${representative.unitId}:aggregate`,
      points: summary.points.median,
      label: `${profiles.length} configuration(s) · médiane et intervalle min–max`,
      aggregate: true
    },
    configurationSummary: summary
  };
}

/** Computes an exact envelope without materialising every full profile and its PMFs. */
export function aggregateUnitConfigurations(database: NormalizedDatabase, unit: NormalizedUnit, configurations: UnitConfiguration[], context: UnitAnalysisContext = DEFAULT_STATISTICS_CONTEXT): UnitStatisticalProfile | null {
  if (configurations.length === 0) return null;
  const defenseCache = new Map<string, { effectiveWounds: number; totalWounds: number; totalObjectiveControl: number }>();
  const observations = configurations.map((configuration) => {
    const item: RosterItem = { id: configuration.id, unitId: unit.id, pointIndex: configuration.pointIndex, modelCounts: configuration.modelCounts, wargearSelections: {}, wargearSelectionCounts: configuration.wargearSelectionCounts };
    const resolved = resolveWargear(unit, item, configuration.requiredDetachments);
    const profiles = resolvedModelProfiles(unit, resolved);
    const damage = summarizeMass(allocateSelectedProfiles([...selectedSalvoProfiles(resolved, context.target, false), ...selectedSalvoProfiles(resolved, context.target, true)], context.target).usefulDamage).mean;
    const defenseKey = JSON.stringify(profiles.map((profile) => [profile.compositionId, profile.count, profile.toughness, profile.save, profile.invulnerableSave, profile.wounds, profile.objectiveControl]));
    let defense = defenseCache.get(defenseKey);
    if (!defense) {
      const totalWounds = profiles.reduce((sum, profile) => sum + profile.wounds * profile.count, 0);
      const totalObjectiveControl = profiles.reduce((sum, profile) => sum + profile.objectiveControl * profile.count, 0);
      const incoming = summarizeMass(allocateThreat(unit, profiles, context.threat).usefulDamage).mean;
      const rawThreatDamage = summarizeMass(parseDiceMass(context.threat.attacks)).mean * successChance(Math.min(6, Math.max(2, numeric(context.threat.skill, 7)))) * summarizeMass(parseDiceMass(context.threat.damage)).mean;
      defense = { totalWounds, totalObjectiveControl, effectiveWounds: incoming > 0 ? totalWounds * rawThreatDamage / incoming : totalWounds };
      defenseCache.set(defenseKey, defense);
    }
    return { configuration, damage, ...defense };
  });
  const damageMedian = medianNumber(observations.map((observation) => observation.damage));
  const representativeObservation = [...observations].sort((left, right) => Math.abs(left.damage - damageMedian) - Math.abs(right.damage - damageMedian) || left.configuration.configurationHash.localeCompare(right.configuration.configurationHash))[0];
  const representative = calculateUnitStatisticalProfile(database, unit, representativeObservation.configuration, context, true);
  const summary = {
    count: observations.length,
    points: rangeSummary(observations.map((observation) => observation.configuration.points)),
    usefulDamage: rangeSummary(observations.map((observation) => observation.damage)),
    effectiveWounds: rangeSummary(observations.map((observation) => observation.effectiveWounds)),
    objectiveControl: rangeSummary(observations.map((observation) => observation.totalObjectiveControl))
  };
  return { ...representative, id: `${unit.id}:aggregate:${context.target.id}:${context.threat.id}`, configuration: { ...representative.configuration, id: `${unit.id}:aggregate`, points: summary.points.median, label: `${observations.length} configuration(s) · médiane et intervalle min–max`, aggregate: true }, configurationSummary: summary };
}

function metricValue(profile: UnitStatisticalProfile, metric: BenchmarkMetric): number {
  if (metric === 'damageEfficiency') return profile.efficiency.damagePerHundred;
  if (metric === 'effectiveWoundsPerHundred') return profile.efficiency.effectiveWoundsPerHundred;
  if (metric === 'objectiveControlPerHundred') return profile.efficiency.objectiveControlPerHundred;
  return profile.mobility.threatRange;
}

function canonicalRosterId(database: NormalizedDatabase, profile: UnitStatisticalProfile): string {
  const direct = database.factions.find((faction) => faction.sourceKey === profile.sourceKey || normalized(faction.name) === normalized(profile.faction));
  return direct?.id ?? database.factions.find((faction) => sourceKeysForFaction(database, faction.id).has(profile.sourceKey))?.id ?? profile.sourceKey;
}

function profileAvailableToRoster(database: NormalizedDatabase, profile: UnitStatisticalProfile, factionId: string): boolean {
  return sourceKeysForFaction(database, factionId).has(profile.sourceKey);
}

export function attachBenchmarks(profiles: UnitStatisticalProfile[], playgroupFactions: ReadonlySet<string>, database?: NormalizedDatabase): UnitStatisticalProfile[] {
  const metrics: BenchmarkMetric[] = ['damageEfficiency', 'effectiveWoundsPerHundred', 'objectiveControlPerHundred', 'threatRange'];
  const playgroupIds = database
    ? new Set([...playgroupFactions].flatMap((value) => database.factions.filter((faction) => faction.id === value || normalized(faction.name) === normalized(value)).map((faction) => faction.id)))
    : playgroupFactions;
  const metadata = new Map<UnitStatisticalProfile, { factionId: string; primaryRole: string; inPlaygroup: boolean }>();
  const factionGroups = new Map<string, UnitStatisticalProfile[]>();
  const roleGroups = new Map<string, UnitStatisticalProfile[]>();
  const playgroupProfiles: UnitStatisticalProfile[] = [];
  for (const profile of profiles) {
    const factionId = database ? canonicalRosterId(database, profile) : profile.faction;
    const primaryRole = [...profile.roles].sort((left, right) => right.score - left.score || left.role.localeCompare(right.role))[0]?.role ?? 'unclassified';
    const inPlaygroup = database ? [...playgroupIds].some((candidate) => profileAvailableToRoster(database, profile, candidate)) : playgroupIds.has(profile.faction);
    metadata.set(profile, { factionId, primaryRole, inPlaygroup });
    if (!database) factionGroups.set(factionId, [...(factionGroups.get(factionId) ?? []), profile]);
    roleGroups.set(primaryRole, [...(roleGroups.get(primaryRole) ?? []), profile]);
    if (inPlaygroup) playgroupProfiles.push(profile);
  }
  if (database) database.factions.forEach((faction) => factionGroups.set(faction.id, profiles.filter((profile) => profileAvailableToRoster(database, profile, faction.id))));
  const sortedMetricCache = new Map<string, number[]>();
  return profiles.map((profile) => {
    const { factionId, primaryRole } = metadata.get(profile)!;
    const cohorts: Array<{ cohort: MetricBenchmark['cohort']; cohortId: string; values: UnitStatisticalProfile[] }> = [
      { cohort: 'faction', cohortId: factionId, values: factionGroups.get(factionId) ?? [] },
      { cohort: 'role', cohortId: primaryRole, values: roleGroups.get(primaryRole) ?? [] },
      { cohort: 'playgroup', cohortId: [...playgroupIds].sort().join('|'), values: playgroupProfiles }
    ];
    const benchmarks = cohorts.flatMap(({ cohort, cohortId, values }) => metrics.map((metric) => {
      const value = metricValue(profile, metric);
      const cacheKey = `${cohort}:${cohortId}:${metric}`;
      let sorted = sortedMetricCache.get(cacheKey);
      if (!sorted) { sorted = values.map((candidate) => metricValue(candidate, metric)).filter(Number.isFinite).sort((left, right) => left - right); sortedMetricCache.set(cacheKey, sorted); }
      const summary = percentileFromSorted(sorted, value, sorted[Math.max(0, Math.ceil(sorted.length * 0.5) - 1)] ?? 0);
      return { cohort, cohortId, metric, sampleSize: values.length, percentile: summary.percentile, rank: summary.rank, median: summary.median, differenceFromMedian: value - summary.median };
    }));
    return { ...profile, benchmarks };
  });
}

export function defaultUnitProfiles(database: NormalizedDatabase, context: UnitAnalysisContext = DEFAULT_STATISTICS_CONTEXT): UnitStatisticalProfile[] {
  return database.units.flatMap((unit) => {
    const configuration = defaultUnitConfiguration(unit);
    return configuration ? [calculateUnitStatisticalProfile(database, unit, configuration, context)] : [];
  });
}
