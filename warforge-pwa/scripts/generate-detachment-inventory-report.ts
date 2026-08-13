import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { enhancementIsEligible, getDetachmentCost, getPointSizes } from '../src/domain/calculations';
import { parseInventoryCsv } from '../src/domain/inventory';
import { normalizeDatabase } from '../src/domain/normalize';
import type { NormalizedDatabase, NormalizedDetachment, NormalizedUnit, RawEnhancement } from '../src/domain/types';

const REPORT_SCHEMA = 'warforge-detachment-inventory-report/v1.0.0';
const METHODOLOGY_VERSION = 'warforge-detachment-inventory-methodology/v1.0.0';
const SNAPSHOT_DATE = process.env.WARFORGE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const TARGET_FACTIONS = ['Space Marines', 'Salamanders', 'Dark Angels', 'Blood Angels'] as const;
const CAPABILITIES = [
  'action-capacity', 'concentrated-damage', 'distributed-damage', 'durable-presence',
  'independent-units', 'objective-control', 'screening', 'target-access',
  'territorial-projection', 'unit-redundancy'
] as const;
type Capability = typeof CAPABILITIES[number];

const SCORE_WEIGHTS = {
  primary: 0.20,
  secondary: 0.25,
  inventory: 0.20,
  ruleAndStratagem: 0.20,
  enhancement: 0.10,
  flexibility: 0.05
} as const;

const projectRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(projectRoot, '..');
const catalogPath = resolve(projectRoot, 'public/data/catalog.json');
const inventoryPath = resolve(projectRoot, 'data/inventory/datasheet_x_figs.csv');
const strategyPath = resolve(projectRoot, 'data/strategy/knowledge-base.json');
const missionsPath = resolve(projectRoot, 'public/data/missions.json');
const imagesPath = resolve(projectRoot, 'public/data/unit-images.json');
const statsRoot = resolve(workspaceRoot, 'deliverables/statistics-reports');

interface DistributionSummary { mean: number; p25: number; median: number; p75: number; zeroProbability: number }
interface OffenseScenario { targetId: string; distance: number; mode: string; usefulDamage: DistributionSummary; expectedModelsDestroyed: number; activeProfiles: string[] }
interface UnitStatistics {
  id: string; name: string; sourceKey: string; rosterFactionIds: string[]; keywords: string[];
  points: { minimum: number; median: number; maximum: number };
  characteristics: { movement: number; totalWounds: number; totalObjectiveControl: number };
  mobility: { move: number; maximumRange: number; threatRange: number; fly: boolean; scouts: boolean; infiltrators: boolean; deepStrike: boolean };
  control: { objectiveControlPerHundred: number; woundsPerHundred: number; models: number };
  efficiency: { damagePerHundred: number; effectiveWoundsPerHundred: number; objectiveControlPerHundred: number };
  reliability: { coefficientOfVariation: number | null; zeroDamageProbability: number; interquartileRange: number };
  roles: Array<{ role: string; score: number }>;
  coverage: 'complete' | 'partial' | 'unsupported'; unsupportedEffects: string[];
  offenseScenarios: OffenseScenario[];
}

interface StatisticsSnapshot {
  schemaVersion: string; snapshotDate: string; catalogVersion: string; catalogFingerprint: string;
  engineVersion: string; guideVersion: string; annotationVersion: string; assumptions: string[];
  distances: number[]; targets: Array<{ id: string; name: string }>; units: UnitStatistics[];
  factions: Array<{ id: string; unitIds: string[] }>;
}

interface InventoryAssociation { figureId: number; type: 'real' | 'proxy' }
interface OwnedUnit {
  id: string; name: string; sourceKey: string; keywords: string[]; minimumModels: number; points: number;
  realFigureIds: number[]; proxyFigureIds: number[]; allFigureIds: number[]; completeCopies: number;
  stats: UnitStatistics; rawCapabilities: Record<Capability, number>; capabilities: Record<Capability, number>;
  imageAsset?: string; weaponKeywords: string[]; distanceCurve: Array<{ distance: number; usefulDamage: number; mode: string }>;
}

interface DetachmentModel {
  id: string; name: string; sourceKey: string; cost: number; lock: string | null; ruleTitle: string;
  ruleText: string; restrictions: string; forceDispositions: string[]; stratagems: NonNullable<NormalizedDetachment['Stratagems']>;
  enhancements: RawEnhancement[]; catalogue: NormalizedDetachment;
}

interface ScoreBreakdown {
  primary: number; secondary: number; inventory: number; ruleAndStratagem: number;
  enhancement: number; flexibility: number; total: number;
}

interface CoreUnit {
  unitId: string; name: string; assignedDetachmentId: string; assignedDetachmentName: string; points: number;
  minimumModels: number; figureIds: number[]; realCount: number; proxyCount: number; capabilities: Capability[];
  weaponKeywords: string[]; imageAsset?: string; distanceCurve: OwnedUnit['distanceCurve'];
}

interface Assessment {
  id: string; factionId: string; battleSize: number; dpBudget: number; kind: 'single' | 'combination';
  detachmentIds: string[]; detachmentNames: string[]; detachmentSources: string[]; dpCost: number; chapterLock: string | null;
  forceDispositions: string[]; primaryMissionScores: Array<{ id: string; title: string; score: number }>;
  secondaryMissionScores: Array<{ id: string; title: string; familyId: string; score: number }>;
  capabilityScores: Record<Capability, number>; scores: ScoreBreakdown; analyticalCoverage: number; confidence: 'low' | 'medium' | 'high';
  supportedEffects: number; partialEffects: number; unsupportedEffects: number; rank?: number; sensitivityRank?: number;
  core?: CoreUnit[]; alternatives?: Array<{ unitId: string; name: string; points: number; reason: string }>;
  warnings: string[];
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function normalized(value: string | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slug(value: string): string { return normalized(value).replace(/ /g, '-') || 'unknown'; }
function clamp(value: number, minimum = 0, maximum = 100): number { return Math.max(minimum, Math.min(maximum, value)); }
function round(value: number, digits = 2): number { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function average(values: number[]): number { return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function quantile(values: number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function robust(values: number[]): number { return 0.6 * average(values) + 0.4 * quantile(values, 0.25); }
function textOf(value: unknown): string { return typeof value === 'string' ? value : ''; }

function latestStatisticsSnapshot(): { path: string; snapshot: StatisticsSnapshot } {
  const candidates: string[] = [];
  if (existsSync(statsRoot)) {
    for (const directory of readdirSync(statsRoot)) {
      const absolute = resolve(statsRoot, directory);
      if (!statSync(absolute).isDirectory()) continue;
      for (const filename of readdirSync(absolute)) {
        if (/snapshot.*\.json\.gz$/i.test(filename)) candidates.push(resolve(absolute, filename));
      }
    }
  }
  candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  for (const path of candidates) {
    const snapshot = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as StatisticsSnapshot;
    if (snapshot.catalogFingerprint) return { path, snapshot };
  }
  throw new Error('Aucun snapshot statistique exhaustif n’est disponible. Exécutez pnpm reports:statistics.');
}

function detachmentLock(detachment: NormalizedDetachment): string | null {
  const restrictions = normalized(detachment.Rule?.Restrictions);
  if (!restrictions.includes('other chapter') && !restrictions.includes('autre chapitre')) return null;
  return detachment.sourceKey === 'Space Marines' ? 'Adeptus Astartes' : detachment.sourceKey;
}

function accessibleDetachments(database: NormalizedDatabase, factionId: string): DetachmentModel[] {
  const sources = new Set(database.primaryRostersByFaction?.[factionId] ?? [factionId]);
  if (factionId === 'Salamanders') { sources.add('Space Marines'); sources.add('Salamanders'); }
  if (factionId === 'Dark Angels') { sources.add('Space Marines'); sources.add('Dark Angels'); }
  const candidates = database.detachments.filter((detachment) => sources.has(detachment.sourceKey));
  const byName = new Map<string, NormalizedDetachment>();
  const preference = (detachment: NormalizedDetachment): number => {
    if (detachment.sourceKey === factionId) return 3;
    if (detachment.sourceKey === 'Space Marines') return 2;
    return 1;
  };
  for (const candidate of candidates) {
    const key = normalized(candidate.displayName);
    const existing = byName.get(key);
    if (!existing || preference(candidate) > preference(existing)) byName.set(key, candidate);
  }
  return [...byName.values()].map((detachment) => ({
    id: detachment.id,
    name: detachment.displayName,
    sourceKey: detachment.sourceKey,
    cost: getDetachmentCost(detachment),
    lock: detachmentLock(detachment),
    ruleTitle: detachment.Rule?.Title?.trim() || 'Règle sans titre',
    ruleText: detachment.Rule?.Text?.trim() || '',
    restrictions: detachment.Rule?.Restrictions?.trim() || '',
    forceDispositions: [...new Set((detachment.ForceDispositions ?? []).map((value) => value.trim()).filter(Boolean))],
    stratagems: detachment.Stratagems ?? [],
    enhancements: detachment.Enhancements ?? [],
    catalogue: detachment
  })).sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

function enumerateLegalSets(detachments: DetachmentModel[], budget: number): DetachmentModel[][] {
  const results: DetachmentModel[][] = [];
  const walk = (start: number, selected: DetachmentModel[], cost: number): void => {
    for (let index = start; index < detachments.length; index += 1) {
      const candidate = detachments[index];
      if (cost + candidate.cost > budget) continue;
      const locks = new Set([...selected, candidate].flatMap((entry) => entry.lock ? [entry.lock] : []));
      if (locks.size > 1) continue;
      const next = [...selected, candidate];
      results.push(next);
      walk(index + 1, next, cost + candidate.cost);
    }
  };
  walk(0, [], 0);
  return results;
}

function bestScenario(stats: UnitStatistics, targetIds: string[], modelDestruction = false): number {
  const candidates = stats.offenseScenarios.filter((scenario) => targetIds.includes(scenario.targetId));
  return candidates.reduce((best, scenario) => Math.max(best, modelDestruction ? scenario.expectedModelsDestroyed : scenario.usefulDamage.mean), 0);
}

function rawCapabilities(stats: UnitStatistics, copies: number): Record<Capability, number> {
  const points = Math.max(1, stats.points.minimum);
  const role = (name: string): number => stats.roles.find((entry) => entry.role === name)?.score ?? 0;
  const rangedAccess = Math.max(stats.mobility.maximumRange, stats.mobility.threatRange);
  return {
    'action-capacity': (200 / points) + stats.mobility.move + 12 * role('scorer') + (stats.mobility.deepStrike ? 15 : 0),
    'concentrated-damage': 100 * bestScenario(stats, ['elite', 'monster', 'vehicle', 'heavy-armour']) / points,
    'distributed-damage': 100 * bestScenario(stats, ['horde', 'infantry'], true) / points,
    'durable-presence': stats.efficiency.effectiveWoundsPerHundred + stats.characteristics.totalWounds / 3,
    'independent-units': (stats.keywords.some((keyword) => normalized(keyword) === 'character') ? 0 : 15) + 180 / points + stats.mobility.move,
    'objective-control': stats.efficiency.objectiveControlPerHundred * 6 + stats.characteristics.totalObjectiveControl,
    'screening': 100 * stats.control.models / points + 3 * stats.mobility.move,
    'target-access': rangedAccess + (stats.mobility.deepStrike ? 20 : 0) + (stats.mobility.fly ? 8 : 0),
    'territorial-projection': stats.mobility.move + (stats.mobility.scouts ? 12 : 0) + (stats.mobility.infiltrators ? 16 : 0) + (stats.mobility.deepStrike ? 14 : 0),
    'unit-redundancy': Math.min(4, copies) * 20 + 100 / points
  };
}

function percentileRanks(units: OwnedUnit[]): void {
  for (const capability of CAPABILITIES) {
    const values = units.map((unit) => unit.rawCapabilities[capability]).sort((a, b) => a - b);
    for (const unit of units) {
      const value = unit.rawCapabilities[capability];
      const below = values.filter((candidate) => candidate < value).length;
      const equal = values.filter((candidate) => candidate === value).length;
      unit.capabilities[capability] = round(100 * (below + equal / 2) / Math.max(1, values.length));
    }
  }
}

function weaponKeywordSummary(unit: NormalizedUnit): string[] {
  const text = normalized((unit.Weapons ?? []).flatMap((group) => group.Weapons ?? []).map((weapon) => `${weapon.Name ?? ''} ${weapon.Keywords ?? ''}`).join(' '));
  return [
    ['Pistol', /\bpistol\b/], ['Rapid Fire', /\brapid fire\b|\btirs rapides\b/], ['Melta', /\bmelta\b|\bfusion\b/],
    ['Torrent', /\btorrent\b/], ['Plasma', /\bplasma\b/]
  ].filter(([, expression]) => (expression as RegExp).test(text)).map(([label]) => label as string);
}

function distanceCurve(stats: UnitStatistics): OwnedUnit['distanceCurve'] {
  return [0, 9, 12, 18, 24, 36].map((distance) => {
    const candidates = stats.offenseScenarios.filter((scenario) => scenario.targetId === 'infantry' && scenario.distance === distance);
    const best = candidates.sort((left, right) => right.usefulDamage.mean - left.usefulDamage.mean)[0];
    return { distance, usefulDamage: round(best?.usefulDamage.mean ?? 0), mode: best?.mode ?? 'hors-portée' };
  });
}

function ownedUnitsForFaction(
  database: NormalizedDatabase,
  snapshot: StatisticsSnapshot,
  inventoryRaw: string,
  images: Map<string, string>,
  factionId: string
): OwnedUnit[] {
  const inventory = parseInventoryCsv(inventoryRaw, database, basename(inventoryPath));
  const faction = snapshot.factions.find((entry) => entry.id === factionId);
  if (!faction) return [];
  const ids = new Set(faction.unitIds);
  const statsById = new Map(snapshot.units.map((unit) => [unit.id, unit]));
  const unitsById = new Map(database.units.map((unit) => [unit.id, unit]));
  const associations = new Map<string, InventoryAssociation[]>();
  for (const entry of inventory.entries) {
    const values = associations.get(entry.unitId) ?? [];
    values.push({ figureId: entry.figureId, type: entry.type });
    associations.set(entry.unitId, values);
  }
  const sourcePreference = (sourceKey: string): number => sourceKey === factionId ? 3 : sourceKey === 'Space Marines' ? 2 : 1;
  const candidates = [...ids].flatMap((id) => {
    const unit = unitsById.get(id), stats = statsById.get(id), entries = associations.get(id) ?? [];
    if (!unit || !stats || entries.length === 0) return [];
    const minimumModels = getPointSizes(unit)[0]?.modelCount ?? 1;
    const realFigureIds = [...new Set(entries.filter((entry) => entry.type === 'real').map((entry) => entry.figureId))].sort((a, b) => a - b);
    const proxyFigureIds = [...new Set(entries.filter((entry) => entry.type === 'proxy').map((entry) => entry.figureId))].sort((a, b) => a - b);
    const allFigureIds = [...new Set([...realFigureIds, ...proxyFigureIds])].sort((a, b) => a - b);
    const completeCopies = Math.floor(allFigureIds.length / Math.max(1, minimumModels));
    if (completeCopies < 1) return [];
    const raw = rawCapabilities(stats, completeCopies);
    return [{
      id, name: stats.name, sourceKey: stats.sourceKey, keywords: [...stats.keywords], minimumModels, points: stats.points.minimum,
      realFigureIds, proxyFigureIds, allFigureIds, completeCopies, stats, rawCapabilities: raw,
      capabilities: Object.fromEntries(CAPABILITIES.map((capability) => [capability, 0])) as Record<Capability, number>,
      imageAsset: images.get(id), weaponKeywords: weaponKeywordSummary(unit), distanceCurve: distanceCurve(stats),
      sourcePriority: sourcePreference(stats.sourceKey)
    }];
  });
  const byName = new Map<string, typeof candidates[number]>();
  for (const candidate of candidates) {
    const key = normalized(candidate.name);
    const current = byName.get(key);
    if (!current || candidate.sourcePriority > current.sourcePriority) byName.set(key, candidate);
  }
  const owned = [...byName.values()].map(({ sourcePriority: _sourcePriority, ...unit }) => unit as OwnedUnit);
  percentileRanks(owned);
  return owned.sort((left, right) => left.name.localeCompare(right.name, 'fr'));
}

const REQUIREMENT_TERMS: Array<{ label: string; test: RegExp; unit: (unit: OwnedUnit) => boolean }> = [
  { label: 'Fly', test: /\bfly\b|\bvol\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'fly') },
  { label: 'Infantry', test: /\binfantry\b|\binfanterie\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'infantry') },
  { label: 'Vehicle', test: /\bvehicle\b|\bvehicule\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'vehicle') },
  { label: 'Mounted', test: /\bmounted\b|\bmonte\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'mounted') },
  { label: 'Transport', test: /\btransport\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'transport') },
  { label: 'Walker', test: /\bwalker\b|\bmarcheur\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'walker') },
  { label: 'Psyker', test: /\bpsyker\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'psyker') },
  { label: 'Terminator', test: /\bterminator\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'terminator') },
  { label: 'Deathwing', test: /\bdeathwing\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'deathwing') },
  { label: 'Ravenwing', test: /\bravenwing\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'ravenwing') },
  { label: 'Phobos', test: /\bphobos\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'phobos') },
  { label: 'Tacticus', test: /\btacticus\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'tacticus') },
  { label: 'Gravis', test: /\bgravis\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'gravis') },
  { label: 'Character', test: /\bcharacter\b|\bpersonnage\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'character') },
  { label: 'Ancient', test: /\bancient\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'ancient') },
  { label: 'Jump Pack', test: /\bjump pack\b|\breacteur dorsal\b/, unit: (unit) => unit.keywords.some((keyword) => normalized(keyword) === 'jump pack') },
  { label: 'Torrent', test: /\btorrent\b/, unit: (unit) => unit.weaponKeywords.includes('Torrent') },
  { label: 'Melta', test: /\bmelta\b|\bfusion\b/, unit: (unit) => unit.weaponKeywords.includes('Melta') },
  { label: 'Plasma', test: /\bplasma\b/, unit: (unit) => unit.weaponKeywords.includes('Plasma') }
];

const EFFECT_CAPABILITIES: Array<{ test: RegExp; capabilities: Capability[] }> = [
  { test: /move|advance|fall back|reserve|ingress|charge|redeploy|mouvement|avance|repli|reserve|charge/, capabilities: ['target-access', 'territorial-projection', 'action-capacity'] },
  { test: /objective control|battle shocked|battle-shocked|oc characteristic|controle d objectif/, capabilities: ['objective-control', 'durable-presence'] },
  { test: /hit roll|wound roll|strength|armour penetration|damage|attacks characteristic|lethal hits|devastating wounds|sustained hits|touche|blessure|force|degat/, capabilities: ['concentrated-damage', 'distributed-damage'] },
  { test: /save|feel no pain|worsen the armour|subtract 1 from the wound|cannot be targeted|sauvegarde|insensible/, capabilities: ['durable-presence'] },
  { test: /action|eligible to shoot|eligible to charge/, capabilities: ['action-capacity', 'independent-units'] },
  { test: /deep strike|scout|infiltrator|strategic reserves/, capabilities: ['territorial-projection', 'target-access'] },
  { test: /additional unit|return.*model|reinforcement|split/, capabilities: ['unit-redundancy', 'screening'] }
];

function effectCapabilities(text: string): Capability[] {
  const value = normalized(text);
  return [...new Set(EFFECT_CAPABILITIES.flatMap((entry) => entry.test.test(value) ? entry.capabilities : []))];
}

function requirementTerms(text: string): typeof REQUIREMENT_TERMS {
  const value = normalized(text);
  return REQUIREMENT_TERMS.filter((entry) => entry.test.test(value));
}

function eligibleOwnedUnits(text: string, units: OwnedUnit[]): { units: OwnedUnit[]; terms: string[]; structured: boolean } {
  const terms = requirementTerms(text);
  if (terms.length === 0) return { units, terms: [], structured: false };
  const weaponTerms = new Set(['Torrent', 'Melta', 'Plasma']);
  const unitTerms = terms.filter((term) => !weaponTerms.has(term.label));
  const equipmentTerms = terms.filter((term) => weaponTerms.has(term.label));
  const matched = units.filter((unit) => unitTerms.every((term) => term.unit(unit)) && (equipmentTerms.length === 0 || equipmentTerms.some((term) => term.unit(unit))));
  return { units: matched, terms: terms.map((term) => term.label), structured: true };
}

function detachmentUnitRelevance(unit: OwnedUnit, detachment: DetachmentModel): number {
  const text = `${detachment.ruleText} ${detachment.stratagems.map((entry) => `${entry.Target ?? ''} ${entry.Effect ?? ''}`).join(' ')} ${detachment.enhancements.map((entry) => entry.Description ?? '').join(' ')}`;
  const terms = requirementTerms(text);
  const matchedTerms = terms.filter((term) => term.unit(unit)).length;
  const exactName = normalized(text).includes(normalized(unit.name)) ? 4 : 0;
  const chapter = unit.sourceKey === detachment.sourceKey && detachment.sourceKey !== 'Space Marines' ? 1.5 : 0;
  const capabilityAlignment = effectCapabilities(text).filter((capability) => unit.capabilities[capability] >= 65).length * 0.4;
  return matchedTerms + exactName + chapter + capabilityAlignment;
}

function portfolioCapabilities(units: OwnedUnit[], detachments: DetachmentModel[]): Record<Capability, number> {
  const result = {} as Record<Capability, number>;
  for (const capability of CAPABILITIES) {
    const values = units.map((unit) => unit.capabilities[capability]).sort((a, b) => b - a);
    const best = values.slice(0, 3);
    const depth = clamp(8 * values.filter((value) => value >= 60).length);
    // A broad collection must still make list-building trade-offs: excellence,
    // median quality and redundancy all contribute, so three outliers cannot
    // produce a nominal 100/100 portfolio by themselves.
    result[capability] = 0.55 * average(best) + 0.25 * quantile(values, 0.5) + 0.20 * depth;
  }
  for (const detachment of detachments) {
    const text = `${detachment.ruleText} ${detachment.stratagems.map((entry) => entry.Effect ?? '').join(' ')}`;
    for (const capability of effectCapabilities(text)) result[capability] = clamp(result[capability] + 3);
  }
  return result;
}

function strategyAxisProfile(
  capabilities: Record<Capability, number>,
  detachmentIds: string[],
  knowledge: any
): Record<string, number> {
  const mapping: Record<string, Capability[]> = {
    'primary-scoring': ['objective-control', 'action-capacity', 'durable-presence'],
    'secondary-scoring': ['action-capacity', 'territorial-projection', 'unit-redundancy'],
    'board-control': ['objective-control', 'screening', 'durable-presence'],
    tempo: ['territorial-projection', 'target-access', 'independent-units'],
    mobility: ['territorial-projection', 'target-access'],
    durability: ['durable-presence', 'objective-control'],
    'damage-projection': ['concentrated-damage', 'distributed-damage', 'target-access'],
    'resource-efficiency': ['unit-redundancy', 'independent-units'],
    denial: ['screening', 'objective-control', 'concentrated-damage'],
    trading: ['unit-redundancy', 'concentrated-damage', 'durable-presence']
  };
  const profile = Object.fromEntries(Object.entries(mapping).map(([axis, values]) => [axis, average(values.map((value) => capabilities[value]))]));
  const reviewed = (knowledge.detachmentProfiles ?? []).filter((entry: any) => detachmentIds.includes(entry.catalogDetachmentId) && entry.status === 'reviewed');
  for (const axis of Object.keys(profile)) {
    const ratings = reviewed.flatMap((entry: any) => entry.axisRatings ?? []).filter((entry: any) => entry.axis === axis).map((entry: any) => 25 * entry.score);
    if (ratings.length > 0) profile[axis] = 0.7 * profile[axis] + 0.3 * average(ratings);
  }
  return profile;
}

function primaryMissionScores(detachments: DetachmentModel[], capabilities: Record<Capability, number>, knowledge: any): Assessment['primaryMissionScores'] {
  const dispositionByDeck = new Map((knowledge.forceDispositions ?? []).map((entry: any) => [normalized(entry.deck), entry.id]));
  const allowed = new Set(detachments.flatMap((detachment) => detachment.forceDispositions).map((value) => dispositionByDeck.get(normalized(value))).filter(Boolean));
  const axisProfile = strategyAxisProfile(capabilities, detachments.map((entry) => entry.id), knowledge);
  return (knowledge.scenarios ?? []).filter((scenario: any) => scenario.kind === 'primary-card' && allowed.has(scenario.forceDispositionId)).map((scenario: any) => ({
    id: scenario.id,
    title: scenario.title,
    score: round(average((scenario.victoryAxes ?? []).map((axis: string) => axisProfile[axis] ?? 50)))
  }));
}

function secondaryMissionScores(capabilities: Record<Capability, number>, knowledge: any): Assessment['secondaryMissionScores'] {
  return (knowledge.secondaryMissionGuides ?? []).filter((guide: any) => guide.status === 'reviewed').map((guide: any) => {
    const weighted = (guide.capabilityRequirements ?? []).map((requirement: any) => ({
      value: capabilities[requirement.capability as Capability] ?? 0,
      weight: requirement.importance === 'core' ? 1 : 0.6
    }));
    const score = weighted.reduce((sum: number, entry: any) => sum + entry.value * entry.weight, 0) / Math.max(1, weighted.reduce((sum: number, entry: any) => sum + entry.weight, 0));
    return { id: guide.scenarioId, title: guide.title.replace(/\s+[—-]\s+guide tactique$/i, ''), familyId: guide.familyId, score: round(score) };
  });
}

function detachmentEvidence(detachment: DetachmentModel, units: OwnedUnit[], knowledge: any): {
  ruleScore: number; stratagemScore: number; enhancementScore: number; flexibility: number;
  supported: number; partial: number; unsupported: number; coverage: number; confidence: number; eligibleUnitIds: string[];
} {
  const reviewedNodes = (knowledge.ruleNodes ?? []).filter((node: any) => node.owner?.type === 'detachment' && node.owner.catalogId === detachment.id && node.status === 'reviewed');
  const profile = (knowledge.detachmentProfiles ?? []).find((entry: any) => entry.catalogDetachmentId === detachment.id && entry.status === 'reviewed');
  const ruleCaps = effectCapabilities(detachment.ruleText);
  const ruleCandidates = eligibleOwnedUnits(detachment.ruleText, units);
  const ruleValues = ruleCaps.length > 0 ? ruleCaps.flatMap((capability) => ruleCandidates.units.map((unit) => unit.capabilities[capability])).sort((a, b) => b - a).slice(0, 4) : [];
  const ruleScore = ruleValues.length > 0 ? average(ruleValues) : 45;
  const stratagemValues: number[] = [];
  let supported = reviewedNodes.length > 0 || profile ? 1 : 0;
  let partial = reviewedNodes.length > 0 || profile ? 0 : 1;
  let unsupported = 0;
  const allEligible = new Set(ruleCandidates.units.map((unit) => unit.id));
  for (const stratagem of detachment.stratagems) {
    const text = `${stratagem.Target ?? ''} ${stratagem.Effect ?? ''}`;
    const caps = effectCapabilities(text);
    const candidates = eligibleOwnedUnits(stratagem.Target ?? '', units);
    candidates.units.forEach((unit) => allEligible.add(unit.id));
    if (caps.length === 0) { unsupported += 1; stratagemValues.push(30); continue; }
    const values = caps.flatMap((capability) => candidates.units.map((unit) => unit.capabilities[capability])).sort((a, b) => b - a).slice(0, 4);
    stratagemValues.push((values.length > 0 ? average(values) : 20) * (candidates.structured ? 0.9 : 0.7));
    if (candidates.structured) partial += 1; else unsupported += 1;
  }
  const enhancementValues: number[] = [];
  for (const enhancement of detachment.enhancements) {
    const eligible = units.filter((unit) => {
      const catalogUnit = unitById.get(unit.id);
      return catalogUnit ? enhancementIsEligible(catalogUnit, enhancement) : false;
    });
    const caps = effectCapabilities(enhancement.Description ?? '');
    const values = caps.flatMap((capability) => eligible.map((unit) => unit.capabilities[capability])).sort((a, b) => b - a).slice(0, 3);
    enhancementValues.push(values.length > 0 ? average(values) : eligible.length > 0 ? 45 : 0);
    if (eligible.length > 0) partial += 1; else unsupported += 1;
    eligible.forEach((unit) => allEligible.add(unit.id));
  }
  const total = supported + partial + unsupported;
  const coverage = total > 0 ? (supported + 0.6 * partial) / total : 0;
  const confidence = total > 0 ? (0.9 * supported + 0.6 * partial + 0.25 * unsupported) / total : 0.25;
  return {
    ruleScore: round(ruleScore), stratagemScore: round(average(stratagemValues)), enhancementScore: round(average(enhancementValues)),
    flexibility: round(clamp(20 * Math.log2(1 + allEligible.size))), supported, partial, unsupported,
    coverage: round(coverage * 100), confidence: round(confidence * 100), eligibleUnitIds: [...allEligible]
  };
}

let unitById = new Map<string, NormalizedUnit>();

function assessSet(
  factionId: string,
  battleSize: number,
  budget: number,
  detachments: DetachmentModel[],
  units: OwnedUnit[],
  knowledge: any,
  evidenceById: Map<string, ReturnType<typeof detachmentEvidence>>
): Assessment {
  const capabilities = portfolioCapabilities(units, detachments);
  const primaries = primaryMissionScores(detachments, capabilities, knowledge);
  const secondaries = secondaryMissionScores(capabilities, knowledge);
  const evidence = detachments.map((detachment) => evidenceById.get(detachment.id) as ReturnType<typeof detachmentEvidence>);
  const primary = robust(primaries.map((mission) => mission.score));
  const secondary = robust(secondaries.map((mission) => mission.score));
  const breadth = 100 * CAPABILITIES.filter((capability) => units.filter((unit) => unit.capabilities[capability] >= 60).length >= 2).length / CAPABILITIES.length;
  const exploitability = average(evidence.map((entry) => clamp(entry.eligibleUnitIds.length * 20)));
  const realShare = units.length > 0 ? average(units.map((unit) => unit.realFigureIds.length / Math.max(1, unit.allFigureIds.length))) * 100 : 0;
  const inventory = 0.45 * breadth + 0.45 * exploitability + 0.10 * realShare;
  const ruleAndStratagem = average(evidence.map((entry) => 0.35 * entry.ruleScore + 0.65 * entry.stratagemScore));
  const enhancement = average(evidence.map((entry) => entry.enhancementScore));
  const flexibility = 0.6 * capabilities['unit-redundancy'] + 0.4 * average(evidence.map((entry) => entry.flexibility));
  const total = 100 * (SCORE_WEIGHTS.primary * primary + SCORE_WEIGHTS.secondary * secondary + SCORE_WEIGHTS.inventory * inventory
    + SCORE_WEIGHTS.ruleAndStratagem * ruleAndStratagem + SCORE_WEIGHTS.enhancement * enhancement + SCORE_WEIGHTS.flexibility * flexibility) / 100;
  const coverage = average(evidence.map((entry) => entry.coverage));
  const confidenceValue = average(evidence.map((entry) => entry.confidence));
  const supported = evidence.reduce((sum, entry) => sum + entry.supported, 0);
  const partial = evidence.reduce((sum, entry) => sum + entry.partial, 0);
  const unsupported = evidence.reduce((sum, entry) => sum + entry.unsupported, 0);
  const names = detachments.map((entry) => entry.name);
  return {
    id: `${slug(factionId)}:${battleSize}:${detachments.map((entry) => slug(entry.name)).join('+')}`,
    factionId, battleSize, dpBudget: budget, kind: detachments.length === 1 ? 'single' : 'combination',
    detachmentIds: detachments.map((entry) => entry.id), detachmentNames: names, detachmentSources: detachments.map((entry) => entry.sourceKey),
    dpCost: detachments.reduce((sum, entry) => sum + entry.cost, 0), chapterLock: detachments.find((entry) => entry.lock)?.lock ?? null,
    forceDispositions: [...new Set(detachments.flatMap((entry) => entry.forceDispositions))].sort(),
    primaryMissionScores: primaries, secondaryMissionScores: secondaries, capabilityScores: Object.fromEntries(CAPABILITIES.map((capability) => [capability, round(capabilities[capability])])) as Record<Capability, number>,
    scores: { primary: round(primary), secondary: round(secondary), inventory: round(inventory), ruleAndStratagem: round(ruleAndStratagem), enhancement: round(enhancement), flexibility: round(flexibility), total: round(total) },
    analyticalCoverage: round(coverage), confidence: confidenceValue >= 75 ? 'high' : confidenceValue >= 50 ? 'medium' : 'low',
    supportedEffects: supported, partialEffects: partial, unsupportedEffects: unsupported,
    warnings: [
      'Inférence préliminaire : les conditions de phase, de portée, de cible et de PC ne sont pas supposées satisfaites.',
      ...(unsupported > 0 ? [`${unsupported} effet(s) non classé(s) contribuent à la baisse de couverture.`] : [])
    ]
  };
}

function assessmentComparator(left: Assessment, right: Assessment): number {
  return right.scores.total - left.scores.total || right.analyticalCoverage - left.analyticalCoverage || right.scores.flexibility - left.scores.flexibility || left.dpCost - right.dpCost || left.id.localeCompare(right.id);
}

function allocateCore(assessment: Assessment, detachments: DetachmentModel[], units: OwnedUnit[]): { core: CoreUnit[]; alternatives: Assessment['alternatives'] } {
  const selected: CoreUnit[] = [];
  const selectedUnitIds = new Set<string>();
  const reserved = new Set<number>();
  const representedCaps = new Set<Capability>();
  const canAllocate = (unit: OwnedUnit): number[] => unit.allFigureIds.filter((id) => !reserved.has(id)).slice(0, unit.minimumModels);
  const add = (unit: OwnedUnit, detachment: DetachmentModel): boolean => {
    const ids = canAllocate(unit);
    if (ids.length < unit.minimumModels || selectedUnitIds.has(unit.id)) return false;
    ids.forEach((id) => reserved.add(id));
    selectedUnitIds.add(unit.id);
    const caps = CAPABILITIES.filter((capability) => unit.capabilities[capability] >= 65).sort((a, b) => unit.capabilities[b] - unit.capabilities[a]).slice(0, 3);
    caps.forEach((capability) => representedCaps.add(capability));
    selected.push({
      unitId: unit.id, name: unit.name, assignedDetachmentId: detachment.id, assignedDetachmentName: detachment.name,
      points: unit.points, minimumModels: unit.minimumModels, figureIds: ids,
      realCount: ids.filter((id) => unit.realFigureIds.includes(id)).length,
      proxyCount: ids.filter((id) => !unit.realFigureIds.includes(id)).length,
      capabilities: caps, weaponKeywords: unit.weaponKeywords, imageAsset: unit.imageAsset, distanceCurve: unit.distanceCurve
    });
    return true;
  };
  for (const detachment of detachments) {
    const candidates = units.filter((unit) => detachmentUnitRelevance(unit, detachment) > 0);
    const sorted = [...candidates].sort((left, right) =>
      detachmentUnitRelevance(right, detachment) - detachmentUnitRelevance(left, detachment)
      || average(Object.values(right.capabilities)) - average(Object.values(left.capabilities))
      || left.points - right.points);
    const choice = sorted.find((unit) => canAllocate(unit).length >= unit.minimumModels && !selectedUnitIds.has(unit.id));
    if (choice) add(choice, detachment);
  }
  while (selected.length < 8) {
    const candidates = units.filter((unit) => !selectedUnitIds.has(unit.id) && canAllocate(unit).length >= unit.minimumModels).map((unit) => {
      const missing = CAPABILITIES.filter((capability) => !representedCaps.has(capability));
      const bestRelevance = Math.max(...detachments.map((detachment) => detachmentUnitRelevance(unit, detachment)));
      const value = average((missing.length > 0 ? missing : CAPABILITIES).map((capability) => unit.capabilities[capability])) + 7 * bestRelevance + 3 * unit.weaponKeywords.length - unit.points / 100;
      const assigned = [...detachments].sort((left, right) => {
        return detachmentUnitRelevance(unit, right) - detachmentUnitRelevance(unit, left);
      })[0];
      return { unit, value, assigned };
    }).sort((left, right) => right.value - left.value || left.unit.points - right.unit.points);
    if (!candidates[0] || !add(candidates[0].unit, candidates[0].assigned)) break;
    if (selected.length >= 4 && representedCaps.size >= 8) break;
  }
  const alternatives = units.filter((unit) => !selectedUnitIds.has(unit.id) && unit.allFigureIds.length >= unit.minimumModels)
    .sort((left, right) => average(Object.values(right.capabilities)) - average(Object.values(left.capabilities)) || left.points - right.points)
    .slice(0, 4).map((unit) => ({ unitId: unit.id, name: unit.name, points: unit.points, reason: `Alternative possédée couvrant ${CAPABILITIES.filter((capability) => unit.capabilities[capability] >= 65).slice(0, 2).join(' et ') || 'un rôle généraliste'}.` }));
  return { core: selected, alternatives };
}

function sensitivitySummary(
  factionId: string, detachments: DetachmentModel[], units: OwnedUnit[], knowledge: any,
  evidenceById: Map<string, ReturnType<typeof detachmentEvidence>>
): Array<{ battleSize: number; dpBudget: number; evaluated: number; top: Assessment[] }> {
  return [{ battleSize: 1000, dpBudget: 2 }, { battleSize: 3000, dpBudget: 4 }].map(({ battleSize, dpBudget }) => {
    const sets = enumerateLegalSets(detachments, dpBudget);
    const assessments = sets.map((set) => assessSet(factionId, battleSize, dpBudget, set, units, knowledge, evidenceById)).sort(assessmentComparator);
    assessments.forEach((assessment, index) => { assessment.sensitivityRank = index + 1; });
    return { battleSize, dpBudget, evaluated: assessments.length, top: assessments.slice(0, 10) };
  });
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(' + ') : String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function scoresCsv(factions: any[]): string {
  const header = ['faction','rank','kind','detachments','sources','dp_cost','chapter_lock','force_dispositions','score_total','score_primary','score_secondary','score_inventory','score_rule_stratagem','score_enhancement','score_flexibility','coverage_pct','confidence','supported','partial','unsupported'];
  const rows = factions.flatMap((faction) => faction.assessments.map((entry: Assessment) => [
    entry.factionId, entry.rank, entry.kind, entry.detachmentNames, entry.detachmentSources, entry.dpCost, entry.chapterLock,
    entry.forceDispositions, entry.scores.total, entry.scores.primary, entry.scores.secondary, entry.scores.inventory,
    entry.scores.ruleAndStratagem, entry.scores.enhancement, entry.scores.flexibility, entry.analyticalCoverage,
    entry.confidence, entry.supportedEffects, entry.partialEffects, entry.unsupportedEffects
  ]));
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function methodologyMarkdown(snapshot: StatisticsSnapshot): string {
  return `# Méthodologie du rapport de détachements\n\nVersion : \`${METHODOLOGY_VERSION}\`  \nSnapshot : ${SNAPSHOT_DATE}  \nCatalogue : ${snapshot.catalogVersion}  \nMoteur statistique : ${snapshot.engineVersion}\n\n## Nature des résultats\n\nLes règles, coûts, missions et caractéristiques du catalogue sont des faits versionnés. Les dégâts, durabilités, distances et probabilités proviennent du moteur exact Warforge. Les scores de détachement, noyaux et alternatives sont des **inférences préliminaires** : ils ne constituent ni un taux de victoire, ni la certification qu’une condition de jeu sera satisfaite.\n\n## Score sur 100\n\n- 20 % missions principales ;\n- 25 % portefeuille de 18 missions secondaires ;\n- 20 % adéquation de l’inventaire ;\n- 20 % règle et stratagèmes ;\n- 10 % optimisations ;\n- 5 % flexibilité et redondance.\n\nLes portefeuilles de missions utilisent \`0,60 × moyenne + 0,40 × P25\`. Les combinaisons sont recalculées sur leur union réelle. Les égalités sont départagées par couverture, flexibilité, coût en DP puis identifiant stable.\n\n## Capacités secondaires\n\n${CAPABILITIES.map((capability) => `- \`${capability}\``).join('\n')}\n\nChaque besoin de capacité provient des guides secondaires revus. Il ne certifie pas qu’une liste complète satisfait la mission. Les profils d’unités sont comparés au sein de l’inventaire de la faction ; les percentiles sont donc contextuels.\n\n## Distances et mots-clés\n\nLes courbes utilisent 0, 9, 12, 18, 24 et 36 pouces contre la cible Infanterie versionnée. À 0 pouce, Pistol et mêlée restent séparés. Hors engagement, Pistol et autres armes de tir sont exclusifs pour l’infanterie. Rapid Fire et Melta s’activent à demi-portée inclusive conformément aux hypothèses du moteur ${snapshot.engineVersion}.\n\n## Couverture et limites\n\nUne règle reliée à un nœud stratégique revu est supportée. Une condition reconnue par les champs structurés du catalogue est partielle. Un texte sans traduction analytique contrôlée est non supporté et abaisse la couverture ; il n’est jamais appliqué silencieusement. Aucun PC, terrain, placement, ligne de vue, portée, cible, phase ou résultat de dé n’est supposé acquis.\n`;
}

const rawCatalog = readFileSync(catalogPath, 'utf8');
const database = normalizeDatabase(rawCatalog);
unitById = new Map(database.units.map((unit) => [unit.id, unit]));
const inventoryRaw = readFileSync(inventoryPath, 'utf8');
const knowledge = JSON.parse(readFileSync(strategyPath, 'utf8'));
const missions = JSON.parse(readFileSync(missionsPath, 'utf8'));
const imageManifest = JSON.parse(readFileSync(imagesPath, 'utf8'));
const images = new Map<string, string>((imageManifest.entries ?? []).map((entry: any) => [entry.unitId, entry.asset]));
const stats = latestStatisticsSnapshot();
if (stats.snapshot.catalogFingerprint !== database.fingerprint) throw new Error(`Snapshot statistique incompatible : ${stats.snapshot.catalogFingerprint} / ${database.fingerprint}.`);
if (knowledge.compatibility?.catalogDataVersion !== stats.snapshot.catalogVersion) throw new Error('La base stratégique et le snapshot statistique ne ciblent pas la même version du catalogue.');

const factionReports = TARGET_FACTIONS.map((factionId) => {
  process.stdout.write(`Analyse ${factionId}…\n`);
  const detachments = accessibleDetachments(database, factionId);
  const units = ownedUnitsForFaction(database, stats.snapshot, inventoryRaw, images, factionId);
  const evidenceById = new Map(detachments.map((detachment) => [detachment.id, detachmentEvidence(detachment, units, knowledge)]));
  const assessments = enumerateLegalSets(detachments, 3).map((set) => assessSet(factionId, 2000, 3, set, units, knowledge, evidenceById)).sort(assessmentComparator);
  assessments.forEach((assessment, index) => { assessment.rank = index + 1; });
  const singles = assessments.filter((entry) => entry.kind === 'single');
  const combinations = assessments.filter((entry) => entry.kind === 'combination');
  const bestSingle = singles[0];
  const bestCombination = combinations[0] ?? bestSingle;
  const baselineDispositions = new Set(bestCombination.forceDispositions);
  const distinctAlternative = assessments.find((entry) => entry.id !== bestSingle.id && entry.id !== bestCombination.id && entry.forceDispositions.some((value) => !baselineDispositions.has(value)))
    ?? assessments.find((entry) => entry.id !== bestSingle.id && entry.id !== bestCombination.id) ?? bestSingle;
  const featured = [...new Map([bestSingle, bestCombination, distinctAlternative].map((entry) => [entry.id, entry])).values()];
  for (const entry of featured) {
    const selectedDetachments = entry.detachmentIds.map((id) => detachments.find((detachment) => detachment.id === id)).filter(Boolean) as DetachmentModel[];
    const allocation = allocateCore(entry, selectedDetachments, units);
    entry.core = allocation.core;
    entry.alternatives = allocation.alternatives;
  }
  const detachmentDetails = detachments.map((detachment) => {
    const single = singles.find((entry) => entry.detachmentIds[0] === detachment.id) as Assessment;
    const evidence = evidenceById.get(detachment.id) as ReturnType<typeof detachmentEvidence>;
    const topUnits = evidence.eligibleUnitIds.map((id) => units.find((unit) => unit.id === id)).filter(Boolean).sort((left, right) => average(Object.values((right as OwnedUnit).capabilities)) - average(Object.values((left as OwnedUnit).capabilities))).slice(0, 6) as OwnedUnit[];
    return {
      id: detachment.id, name: detachment.name, sourceKey: detachment.sourceKey, cost: detachment.cost, chapterLock: detachment.lock,
      ruleTitle: detachment.ruleTitle, ruleText: detachment.ruleText, restrictions: detachment.restrictions,
      forceDispositions: detachment.forceDispositions,
      stratagems: detachment.stratagems.map((entry) => ({ name: entry.Name, cpCost: entry.CPCost, phase: entry.Phase, when: entry.When, target: entry.Target, effect: entry.Effect, capabilities: effectCapabilities(`${entry.Target ?? ''} ${entry.Effect ?? ''}`), requirements: requirementTerms(entry.Target ?? '').map((term) => term.label) })),
      enhancements: detachment.enhancements.map((entry) => ({ name: entry.Name, cost: entry.Cost, description: entry.Description, requiredKeywords: entry.RequiredKeywords ?? [], eligibleCarriers: units.filter((unit) => {
        const catalogUnit = unitById.get(unit.id);
        return catalogUnit ? enhancementIsEligible(catalogUnit, entry) : false;
      }).slice(0, 12).map((unit) => unit.name) })),
      topOwnedUnits: topUnits.map((unit) => ({ id: unit.id, name: unit.name, points: unit.points, real: unit.realFigureIds.length, proxy: unit.proxyFigureIds.length, weaponKeywords: unit.weaponKeywords })),
      score: single.scores, coverage: evidence.coverage, confidence: single.confidence, supported: evidence.supported, partial: evidence.partial, unsupported: evidence.unsupported
    };
  });
  return {
    factionId, detachments: detachmentDetails, ownedUnits: units.map((unit) => ({
      id: unit.id, name: unit.name, sourceKey: unit.sourceKey, points: unit.points, minimumModels: unit.minimumModels,
      realFigureIds: unit.realFigureIds, proxyFigureIds: unit.proxyFigureIds, completeCopies: unit.completeCopies,
      capabilities: unit.capabilities, weaponKeywords: unit.weaponKeywords, coverage: unit.stats.coverage, imageAsset: unit.imageAsset
    })),
    inventorySummary: {
      distinctDatasheets: units.length,
      physicalFigureIds: new Set(units.flatMap((unit) => unit.allFigureIds)).size,
      realAssociations: units.reduce((sum, unit) => sum + unit.realFigureIds.length, 0),
      proxyAssociations: units.reduce((sum, unit) => sum + unit.proxyFigureIds.length, 0)
    },
    evaluated: { singles: singles.length, combinations: combinations.length, total: assessments.length },
    featuredIds: featured.map((entry) => entry.id), assessments, sensitivity: sensitivitySummary(factionId, detachments, units, knowledge, evidenceById)
  };
});

const report = {
  schemaVersion: REPORT_SCHEMA,
  methodologyVersion: METHODOLOGY_VERSION,
  generatedAt: new Date().toISOString(),
  snapshotDate: SNAPSHOT_DATE,
  battleSize: { points: 2000, detachmentPoints: 3, enhancementLimit: 4 },
  sensitivityBattleSizes: [{ points: 1000, detachmentPoints: 2 }, { points: 3000, detachmentPoints: 4 }],
  scoreWeights: SCORE_WEIGHTS,
  robustPortfolioFormula: '0.60 * mean + 0.40 * P25',
  capabilityPortfolioFormula: '0.55 * mean(top 3) + 0.25 * median(inventory) + 0.20 * depth(>= P60)',
  capabilityVocabulary: CAPABILITIES,
  secondaryMissionFamilies: (knowledge.secondaryMissionFamilies ?? []).map((family: any) => ({ familyId: family.familyId, title: family.title })),
  assumptions: [
    'Inventaire réel et proxies explicitement déclarés ; aucune figurine manquante n’est autorisée dans les noyaux.',
    'Les recommandations sont des inférences préliminaires et non des règles officielles ou des taux de victoire.',
    'Aucun CP, placement, terrain, mouvement, portée, cible, phase ou résultat de dé n’est supposé satisfait.',
    ...stats.snapshot.assumptions
  ],
  sources: {
    catalog: { path: 'warforge-pwa/public/data/catalog.json', sha256: sha256(catalogPath), fingerprint: database.fingerprint, version: stats.snapshot.catalogVersion },
    inventory: { path: 'warforge-pwa/data/inventory/datasheet_x_figs.csv', sha256: sha256(inventoryPath) },
    strategy: { path: 'warforge-pwa/data/strategy/knowledge-base.json', sha256: sha256(strategyPath), schemaVersion: knowledge.schemaVersion, knowledgeVersion: knowledge.knowledgeVersion },
    missions: { path: 'warforge-pwa/public/data/missions.json', sha256: sha256(missionsPath), activePackId: missions.activePackId },
    statistics: { path: stats.path.replace(`${workspaceRoot}\\`, '').replaceAll('\\', '/'), sha256: sha256(stats.path), schemaVersion: stats.snapshot.schemaVersion, engineVersion: stats.snapshot.engineVersion, distances: stats.snapshot.distances },
    images: { path: 'warforge-pwa/public/data/unit-images.json', sha256: sha256(imagesPath), schemaVersion: imageManifest.schemaVersion }
  },
  factions: factionReports
};

const outputDirectory = resolve(workspaceRoot, `output/pdf/detachment-inventory-report-${SNAPSHOT_DATE}`);
mkdirSync(outputDirectory, { recursive: true });
const assessmentPath = resolve(outputDirectory, 'assessments.json');
writeFileSync(assessmentPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(resolve(outputDirectory, 'scores.csv'), scoresCsv(factionReports), 'utf8');
writeFileSync(resolve(outputDirectory, 'methodologie.md'), `${methodologyMarkdown(stats.snapshot)}\n## Calibration du portefeuille\n\nUne capacité de portefeuille combine 55 % de la moyenne des trois meilleures unités, 25 % de la médiane de l’inventaire et 20 % de la profondeur au-dessus du 60e percentile. Cette calibration empêche trois valeurs extrêmes de produire seules un 100/100.\n`, 'utf8');

const manifest = {
  schemaVersion: 'warforge-detachment-inventory-manifest/v1', generatedAt: report.generatedAt, snapshotDate: SNAPSHOT_DATE,
  reportSchema: REPORT_SCHEMA, methodologyVersion: METHODOLOGY_VERSION,
  inputs: report.sources,
  outputs: ['00-synthese-comparative.pdf', '01-space-marines.pdf', '02-salamanders.pdf', '03-dark-angels.pdf', '04-blood-angels.pdf', 'scores.csv', 'assessments.json', 'methodologie.md', 'chart-audit.json'],
  qualityGates: { applicationChanged: false, gameDataChanged: false, preliminaryInferences: true, winProbabilityReported: false }
};
writeFileSync(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const bundledPython = resolve(process.env.USERPROFILE ?? '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.WARFORGE_REPORT_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python');
const renderer = resolve(projectRoot, 'scripts/render-detachment-inventory-report.py');
const render = spawnSync(python, [renderer, '--input', assessmentPath, '--output', outputDirectory, '--public-root', resolve(projectRoot, 'public')], { cwd: projectRoot, stdio: 'inherit', env: process.env });
if (render.status !== 0) throw new Error(`Le rendu PDF a échoué avec le code ${render.status ?? 'inconnu'}.`);
process.stdout.write(`Rapports générés dans ${outputDirectory}\n`);
