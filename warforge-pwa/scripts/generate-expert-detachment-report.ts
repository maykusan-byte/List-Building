import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizeDatabase } from '../src/domain/normalize';
import type { NormalizedDatabase, NormalizedDetachment, NormalizedUnit } from '../src/domain/types';

const EXPERT_SCHEMA = 'warforge-detachment-inventory-expert-report/v1.0.0';
const INFERENCE_SCHEMA = 'warforge-expert-inferences/v1.0.0';
const METHODOLOGY_VERSION = 'warforge-detachment-expert-methodology/v1.0.0';
const EXPERT_TARGET_FACTIONS = new Set(['Space Marines', 'Salamanders', 'Dark Angels', 'Blood Angels']);
const SNAPSHOT_DATE = process.env.WARFORGE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const CAPABILITIES = ['action-capacity','concentrated-damage','distributed-damage','durable-presence','independent-units','objective-control','screening','target-access','territorial-projection','unit-redundancy'] as const;
type Capability = typeof CAPABILITIES[number];
type SourceKind = 'detachment-rule' | 'stratagem' | 'enhancement' | 'unit-ability' | 'unit-info' | 'chain';
type EvidenceKind = 'fact-structured' | 'direct-inference' | 'chained-inference';
type AvailabilityKind = 'unconditional' | 'ordinary-condition' | 'cp-or-once' | 'rare-or-opponent-dependent';

const WEIGHTS = { primary: .20, secondary: .25, inventory: .20, ruleAndStratagem: .20, enhancement: .10, flexibility: .05 } as const;
const EVIDENCE_FACTORS: Record<EvidenceKind, number> = { 'fact-structured': 1, 'direct-inference': .8, 'chained-inference': .6 };
const AVAILABILITY_FACTORS: Record<AvailabilityKind, number> = { unconditional: 1, 'ordinary-condition': .75, 'cp-or-once': .5, 'rare-or-opponent-dependent': .35 };

const projectRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(projectRoot, '..');
const baselineDirectory = resolve(workspaceRoot, `output/pdf/detachment-inventory-report-${SNAPSHOT_DATE}`);
const outputDirectory = resolve(workspaceRoot, `output/pdf/detachment-inventory-expert-report-${SNAPSHOT_DATE}`);
const catalogPath = resolve(projectRoot, 'public/data/catalog.json');
const strategyPath = resolve(projectRoot, 'data/strategy/knowledge-base.json');
const baselinePath = resolve(baselineDirectory, 'assessments.json');

interface Participant { type: 'detachment' | 'unit'; id: string; name: string; role: string }
interface ExpertInferenceRecord {
  id: string; factionId: string; detachmentId?: string; sourceKind: SourceKind; sourcePath: string; sourceTitle: string;
  sourceHash: string; sourceExcerpt: string; participants: Participant[]; relationKind: 'enables' | 'amplifies' | 'protects' | 'repositions' | 'denies' | 'scores' | 'coordinates';
  statement: string; capabilities: Capability[]; importance: 'minor' | 'material' | 'structural'; baseMagnitude: number;
  evidenceKind: EvidenceKind; evidenceFactor: number; availabilityKind: AvailabilityKind; availabilityFactor: number;
  contribution: number; favorableContribution: number; prerequisites: string[]; timing: string; cpCost: number | null;
  counterplay: string; tradeoffs: string[]; confidence: 'low' | 'medium' | 'high'; status: 'draft';
}

interface ExpertAssessment {
  id: string; factionId: string; battleSize: number; dpBudget: number; kind: 'single' | 'combination';
  detachmentIds: string[]; detachmentNames: string[]; detachmentSources: string[]; dpCost: number; forceDispositions: string[];
  prudentScores: any; expertScores: any; favorableScores: any; scoreRange: { prudent: number; central: number; favorable: number };
  capabilityScores: Record<Capability, number>; capabilityAdjustments: Record<Capability, number>; favorableCapabilityAdjustments: Record<Capability, number>;
  primaryMissionScores: any[]; secondaryMissionScores: any[]; interpretationCoverage: number; evidenceConfidence: number;
  inferenceShare: number; conditionalityIndex: number; inferenceIds: string[]; unsupportedEffects: string[]; rank?: number;
  core?: any[]; alternatives?: any[]; warnings: string[];
}

const rawCatalog = readFileSync(catalogPath, 'utf8');
const database = normalizeDatabase(rawCatalog);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const knowledge = JSON.parse(readFileSync(strategyPath, 'utf8'));
const unitById = new Map(database.units.map((unit) => [unit.id, unit]));
const detachmentById = new Map(database.detachments.map((detachment) => [detachment.id, detachment]));
const reviewedRuleOwners = new Set((knowledge.ruleNodes ?? []).filter((node: any) => node.status === 'reviewed').map((node: any) => node.owner?.catalogId));

function normalized(value: string | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function slug(value: string): string { return normalized(value).replace(/ /g, '-') || 'unknown'; }
function clamp(value: number, minimum = 0, maximum = 100): number { return Math.max(minimum, Math.min(maximum, value)); }
function round(value: number, digits = 2): number { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function average(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function quantile(values: number[], probability: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b); const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), upper = Math.ceil(index); return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function robust(values: number[]): number { return .6 * average(values) + .4 * quantile(values, .25); }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }

const EXPERT_PATTERNS: Array<{ id: string; test: RegExp; capabilities: Capability[]; relation: ExpertInferenceRecord['relationKind']; importance: ExpertInferenceRecord['importance']; statement: string }> = [
  { id: 'actions', test: /action|eligible to shoot.*action|perform.*action/, capabilities: ['action-capacity','independent-units'], relation: 'scores', importance: 'structural', statement: 'améliore la disponibilité pour les actions et opérations' },
  { id: 'objective', test: /objective control|control.*objective|vowed objective|objective marker|battle shocked.*control/, capabilities: ['objective-control','durable-presence'], relation: 'scores', importance: 'structural', statement: 'renforce la tenue, la contestation ou la récupération des objectifs' },
  { id: 'reposition', test: /normal move|move of up to|advance|fall back|redeploy|disembark|embark|consolidat|mouvement|avance|repli/, capabilities: ['territorial-projection','target-access','action-capacity'], relation: 'repositions', importance: 'material', statement: 'convertit une activation en projection ou repositionnement' },
  { id: 'reserve', test: /deep strike|strategic reserve|ingress move|set up.*battlefield|arriving/, capabilities: ['territorial-projection','target-access'], relation: 'enables', importance: 'material', statement: 'ouvre une ligne de réserve, d’arrivée ou d’accès à une zone' },
  { id: 'durability', test: /feel no pain|subtract 1 from.*damage|worsen.*armour penetration|save characteristic|cannot be selected.*target|subtract 1 from.*wound|return.*destroyed model|restores?.*wounds/, capabilities: ['durable-presence','objective-control'], relation: 'protects', importance: 'material', statement: 'augmente la persistance théorique d’une unité exposée' },
  { id: 'accuracy', test: /re roll.*hit|add 1 to.*hit|critical hit|lethal hits|sustained hits|torrent/, capabilities: ['concentrated-damage','distributed-damage'], relation: 'amplifies', importance: 'material', statement: 'améliore la conversion des attaques en touches utiles' },
  { id: 'wounding', test: /re roll.*wound|add 1 to.*wound|strength characteristic|devastating wounds|anti |armour penetration|damage characteristic/, capabilities: ['concentrated-damage'], relation: 'amplifies', importance: 'structural', statement: 'améliore la conversion contre les cibles résistantes' },
  { id: 'volume', test: /attacks characteristic|additional attack|shoot again|shoot as if|fight again|explodes?/, capabilities: ['distributed-damage','concentrated-damage'], relation: 'amplifies', importance: 'material', statement: 'augmente le volume ou ajoute une fenêtre offensive' },
  { id: 'access', test: /ignores cover|indirect fire|precision|visible.*not|within range|closest eligible target/, capabilities: ['target-access','concentrated-damage'], relation: 'enables', importance: 'minor', statement: 'réduit une contrainte d’accès ou de sélection de cible' },
  { id: 'screen', test: /cannot.*charge|subtract.*charge|engagement range|cannot.*set up|battle shock roll|mortal wounds.*charge/, capabilities: ['screening','durable-presence'], relation: 'denies', importance: 'material', statement: 'crée une capacité de filtrage, de dissuasion ou de déni' },
  { id: 'transport', test: /transport capacity|embarked|disembark|assault ramp/, capabilities: ['target-access','territorial-projection','durable-presence'], relation: 'coordinates', importance: 'structural', statement: 'coordonne un transport et sa cargaison pour projeter une unité' },
  { id: 'leader', test: /while.*leading|leader|attached unit|can be attached/, capabilities: ['durable-presence','independent-units','unit-redundancy'], relation: 'coordinates', importance: 'material', statement: 'crée une chaîne Leader-unité attachée conditionnelle' },
  { id: 'recursion', test: /return.*model|add.*new unit|split.*unit|reinforcement/, capabilities: ['unit-redundancy','screening'], relation: 'enables', importance: 'structural', statement: 'augmente la redondance ou recrée une présence sur table' },
  { id: 'restriction', test: /cannot include|restricted units|excluding.*units drawn from any other chapter/, capabilities: ['unit-redundancy'], relation: 'coordinates', importance: 'material', statement: 'réduit la souplesse de composition disponible', }
];

const UNIT_TERMS: Array<{ label: string; test: RegExp; match: (unit: NormalizedUnit) => boolean }> = [
  ['Fly', /\bfly\b/, 'fly'], ['Infantry', /\binfantry\b/, 'infantry'], ['Vehicle', /\bvehicle\b/, 'vehicle'], ['Mounted', /\bmounted\b/, 'mounted'],
  ['Transport', /\btransport\b/, 'transport'], ['Walker', /\bwalker\b/, 'walker'], ['Psyker', /\bpsyker\b/, 'psyker'], ['Terminator', /\bterminator\b/, 'terminator'],
  ['Deathwing', /\bdeathwing\b/, 'deathwing'], ['Ravenwing', /\bravenwing\b/, 'ravenwing'], ['Phobos', /\bphobos\b/, 'phobos'], ['Gravis', /\bgravis\b/, 'gravis'],
  ['Character', /\bcharacter\b/, 'character'], ['Ancient', /\bancient\b/, 'ancient'], ['Jump Pack', /\bjump pack\b/, 'jump pack']
].map(([label, test, keyword]) => ({ label: label as string, test: test as RegExp, match: (unit: NormalizedUnit) => [...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].some((value) => normalized(value) === keyword) }));

function weaponText(unit: NormalizedUnit): string { return normalized((unit.Weapons ?? []).flatMap((group) => group.Weapons ?? []).map((weapon) => `${weapon.Name ?? ''} ${weapon.Keywords ?? ''}`).join(' ')); }
function unitMatchesSource(unit: NormalizedUnit, sourceText: string): boolean {
  const value = normalized(sourceText); const terms = UNIT_TERMS.filter((term) => term.test.test(value));
  const unitTerms = terms.filter((term) => term.match(unit));
  if (unitTerms.length > 0) return true;
  const weapons = weaponText(unit);
  return (/\btorrent\b/.test(value) && /\btorrent\b/.test(weapons)) || (/\bmelta\b|\bfusion\b/.test(value) && /\bmelta\b|\bfusion\b/.test(weapons)) || (/\bplasma\b/.test(value) && /\bplasma\b/.test(weapons));
}

function classify(sourceText: string): typeof EXPERT_PATTERNS {
  const value = normalized(sourceText);
  return EXPERT_PATTERNS.filter((pattern) => pattern.test.test(value));
}
function availability(sourceKind: SourceKind, sourceText: string, cpCost: number | null): AvailabilityKind {
  const value = normalized(sourceText);
  if (cpCost !== null || /once per battle|one shot|once per turn/.test(value)) return 'cp-or-once';
  if (/opponent|enemy unit.*destroyed|battle shocked|below.*starting strength|after.*destroyed|roll one d6/.test(value)) return 'rare-or-opponent-dependent';
  if (/\bif\b|\bwhen\b|\bwhile\b|\bafter\b|within \d|closest|charge move|remained stationary/.test(value)) return 'ordinary-condition';
  return sourceKind === 'chain' ? 'ordinary-condition' : 'unconditional';
}
function importanceMagnitude(importance: ExpertInferenceRecord['importance']): number { return importance === 'structural' ? 9 : importance === 'material' ? 6 : 3; }
function prerequisitesFrom(sourceText: string): string[] {
  return sourceText.split(/(?<=[.!?])\s+|\n+/).map((line) => line.trim()).filter((line) => /\b(if|when|while|after|within|before|excluding|only)\b/i.test(line)).slice(0, 3);
}
function counterplayFor(capabilities: Capability[]): string {
  if (capabilities.includes('territorial-projection')) return 'Écran de zones d’arrivée, blocage des lignes de déplacement et éloignement des cibles utiles.';
  if (capabilities.includes('objective-control')) return 'Contester avec une seconde vague ou éliminer le porteur avant la fenêtre de score.';
  if (capabilities.includes('durable-presence')) return 'Changer de cible, saturer ou forcer l’unité à dépenser ses ressources défensives trop tôt.';
  if (capabilities.includes('concentrated-damage')) return 'Masquer la cible prioritaire, imposer un écran ou présenter une cible de rendement inférieur.';
  return 'Refuser la condition d’activation et contraindre l’unité à un rôle moins rentable.';
}

function recordFor(args: {
  factionId: string; detachment?: NormalizedDetachment; sourceKind: SourceKind; sourcePath: string; sourceTitle: string; sourceText: string;
  cpCost?: number | null; participants: Participant[]; evidenceKind?: EvidenceKind; timing?: string;
}): ExpertInferenceRecord | null {
  const patterns = classify(args.sourceText);
  if (!patterns.length) return null;
  const capabilities = [...new Set(patterns.flatMap((pattern) => pattern.capabilities))];
  const strongest = [...patterns].sort((left, right) => importanceMagnitude(right.importance) - importanceMagnitude(left.importance))[0];
  const negative = strongest.id === 'restriction';
  const evidenceKind = args.evidenceKind ?? (args.detachment && reviewedRuleOwners.has(args.detachment.id) ? 'fact-structured' : 'direct-inference');
  const availabilityKind = availability(args.sourceKind, args.sourceText, args.cpCost ?? null);
  const magnitude = importanceMagnitude(strongest.importance) * (negative ? -1 : 1);
  const contribution = magnitude * EVIDENCE_FACTORS[evidenceKind] * AVAILABILITY_FACTORS[availabilityKind];
  const identity = `${args.factionId}|${args.detachment?.id ?? ''}|${args.sourceKind}|${args.sourcePath}|${capabilities.sort().join(',')}|${args.participants.map((p) => p.id).sort().join(',')}`;
  return {
    id: `expert-${slug(identity).slice(0, 130)}-${hash(identity).slice(0, 10)}`,
    factionId: args.factionId, detachmentId: args.detachment?.id, sourceKind: args.sourceKind, sourcePath: args.sourcePath,
    sourceTitle: args.sourceTitle, sourceHash: hash(args.sourceText), sourceExcerpt: args.sourceText.slice(0, 600), participants: args.participants,
    relationKind: strongest.relation, statement: `${args.sourceTitle} ${strongest.statement}.`, capabilities, importance: strongest.importance,
    baseMagnitude: magnitude, evidenceKind, evidenceFactor: EVIDENCE_FACTORS[evidenceKind], availabilityKind, availabilityFactor: AVAILABILITY_FACTORS[availabilityKind],
    contribution: round(contribution), favorableContribution: round(magnitude * EVIDENCE_FACTORS[evidenceKind]), prerequisites: prerequisitesFrom(args.sourceText),
    timing: args.timing ?? 'Condition décrite dans le texte source.', cpCost: args.cpCost ?? null, counterplay: counterplayFor(capabilities),
    tradeoffs: [
      ...(args.cpCost !== undefined && args.cpCost !== null ? [`Consomme ${args.cpCost} PC lorsque la condition et la cible sont valides.`] : []),
      ...(args.sourceKind === 'enhancement' ? ['Consomme des points et un emplacement d’optimisation sur un porteur légal.'] : []),
      ...(args.sourceKind === 'chain' ? ['Exige la présence simultanée et la coordination des participants.'] : []),
      ...(negative ? ['Réduit la liberté de composition ou le nombre d’alternatives légales.'] : [])
    ],
    confidence: evidenceKind === 'fact-structured' ? 'high' : evidenceKind === 'direct-inference' ? 'medium' : 'low', status: 'draft'
  };
}

function ownedUnitIds(faction: any): Set<string> { return new Set((faction.ownedUnits ?? []).map((unit: any) => unit.id)); }
function participantsForText(faction: any, detachment: NormalizedDetachment, sourceText: string, fallbackNames: string[]): Participant[] {
  const ids = ownedUnitIds(faction); const named = new Set(fallbackNames.map(normalized));
  const matched = database.units.filter((unit) => ids.has(unit.id) && (unitMatchesSource(unit, sourceText) || named.has(normalized(unit.displayName)))).slice(0, 8);
  return [
    { type: 'detachment', id: detachment.id, name: detachment.displayName, role: 'source de règle' },
    ...matched.map((unit) => ({ type: 'unit' as const, id: unit.id, name: unit.displayName, role: 'bénéficiaire possédé potentiel' }))
  ];
}

function buildFactionInferences(faction: any): { records: ExpertInferenceRecord[]; unsupportedByDetachment: Map<string, string[]>; sourceCounts: Map<string, number> } {
  const records: ExpertInferenceRecord[] = []; const unsupportedByDetachment = new Map<string, string[]>(); const sourceCounts = new Map<string, number>();
  const push = (record: ExpertInferenceRecord | null, detachmentId?: string, label?: string): void => {
    if (label) sourceCounts.set(detachmentId ?? 'unit', (sourceCounts.get(detachmentId ?? 'unit') ?? 0) + 1);
    if (record) records.push(record); else if (detachmentId && label) unsupportedByDetachment.set(detachmentId, [...(unsupportedByDetachment.get(detachmentId) ?? []), label]);
  };
  for (const detail of faction.detachments) {
    const detachment = detachmentById.get(detail.id); if (!detachment) continue;
    const fallback = (detail.topOwnedUnits ?? []).map((unit: any) => unit.name);
    const ruleText = `${text(detachment.Rule?.Text)} ${text(detachment.Rule?.Restrictions)}`.trim();
    push(recordFor({ factionId: faction.factionId, detachment, sourceKind: 'detachment-rule', sourcePath: `${detachment.id}/Rule`, sourceTitle: detachment.Rule?.Title ?? detachment.displayName, sourceText: ruleText, participants: participantsForText(faction, detachment, ruleText, fallback) }), detachment.id, `Règle : ${detachment.Rule?.Title ?? detachment.displayName}`);
    (detachment.Stratagems ?? []).forEach((stratagem, index) => {
      const value = `${text(stratagem.When)} ${text(stratagem.Target)} ${text(stratagem.Effect)}`;
      push(recordFor({ factionId: faction.factionId, detachment, sourceKind: 'stratagem', sourcePath: `${detachment.id}/Stratagems/${index}`, sourceTitle: stratagem.Name ?? `Stratagème ${index + 1}`, sourceText: value, cpCost: stratagem.CPCost ?? null, timing: `${stratagem.Phase ?? 'phase conditionnelle'} - ${stratagem.When ?? ''}`, participants: participantsForText(faction, detachment, stratagem.Target ?? '', fallback) }), detachment.id, `Stratagème : ${stratagem.Name ?? index + 1}`);
    });
    (detachment.Enhancements ?? []).forEach((enhancement, index) => {
      const value = text(enhancement.Description); const carrierNames = detail.enhancements?.find((entry: any) => entry.name === enhancement.Name)?.eligibleCarriers ?? [];
      push(recordFor({ factionId: faction.factionId, detachment, sourceKind: 'enhancement', sourcePath: `${detachment.id}/Enhancements/${index}`, sourceTitle: enhancement.Name ?? `Optimisation ${index + 1}`, sourceText: value, participants: participantsForText(faction, detachment, value, carrierNames) }), detachment.id, `Optimisation : ${enhancement.Name ?? index + 1}`);
    });
  }
  const ids = ownedUnitIds(faction);
  for (const unit of database.units.filter((candidate) => ids.has(candidate.id))) {
    (unit.UnitAbilities ?? []).forEach((ability, index) => {
      const value = `${text(ability.Title)} ${text(ability.Text)}`; const sourceKind: SourceKind = /leader|transport|attached|embark|disembark/i.test(value) ? 'chain' : 'unit-ability';
      push(recordFor({ factionId: faction.factionId, sourceKind, sourcePath: `${unit.id}/UnitAbilities/${index}`, sourceTitle: `${unit.displayName} - ${ability.Title ?? 'aptitude'}`, sourceText: value, evidenceKind: sourceKind === 'chain' ? 'chained-inference' : 'direct-inference', participants: [{ type: 'unit', id: unit.id, name: unit.displayName, role: 'porteur de l’aptitude' }] }), undefined, `Aptitude : ${unit.displayName}/${ability.Title ?? index + 1}`);
    });
    (unit.Infos ?? []).forEach((info, index) => {
      const value = `${text(info.Title)} ${text(info.Text)}`;
      push(recordFor({ factionId: faction.factionId, sourceKind: /transport|leader|attached/i.test(value) ? 'chain' : 'unit-info', sourcePath: `${unit.id}/Infos/${index}`, sourceTitle: `${unit.displayName} - ${info.Title ?? 'information'}`, sourceText: value, evidenceKind: /transport|leader|attached/i.test(value) ? 'chained-inference' : 'direct-inference', participants: [{ type: 'unit', id: unit.id, name: unit.displayName, role: 'unité possédée' }] }));
    });
  }
  const deduplicated = [...new Map(records.map((record) => [record.id, record])).values()];
  return { records: deduplicated, unsupportedByDetachment, sourceCounts };
}

const AXIS_CAPABILITIES: Record<string, Capability[]> = {
  'primary-scoring': ['objective-control','action-capacity','durable-presence'], 'secondary-scoring': ['action-capacity','territorial-projection','unit-redundancy'],
  'board-control': ['objective-control','screening','durable-presence'], tempo: ['territorial-projection','target-access','independent-units'],
  mobility: ['territorial-projection','target-access'], durability: ['durable-presence','objective-control'],
  'damage-projection': ['concentrated-damage','distributed-damage','target-access'], 'resource-efficiency': ['unit-redundancy','independent-units'],
  denial: ['screening','objective-control','concentrated-damage'], trading: ['unit-redundancy','concentrated-damage','durable-presence']
};

function cappedAdjustments(records: ExpertInferenceRecord[], favorable = false): Record<Capability, number> {
  return Object.fromEntries(CAPABILITIES.map((capability) => {
    const sum = records.filter((record) => record.capabilities.includes(capability)).reduce((total, record) => total + (favorable ? record.favorableContribution : record.contribution), 0);
    return [capability, round(Math.max(-15, Math.min(15, sum)))];
  })) as Record<Capability, number>;
}
function expertPrimaryMissions(base: any, adjustments: Record<Capability, number>): any[] {
  const scenarioById = new Map((knowledge.scenarios ?? []).map((scenario: any) => [scenario.id, scenario]));
  return (base.primaryMissionScores ?? []).map((mission: any) => {
    const scenario: any = scenarioById.get(mission.id); const capabilities = [...new Set((scenario?.victoryAxes ?? []).flatMap((axis: string) => AXIS_CAPABILITIES[axis] ?? []))] as Capability[];
    return { ...mission, score: round(clamp(mission.score + average(capabilities.map((capability) => adjustments[capability] ?? 0)))) };
  });
}
function expertSecondaryMissions(base: any, capabilities: Record<Capability, number>): any[] {
  const guideByScenario = new Map((knowledge.secondaryMissionGuides ?? []).map((guide: any) => [guide.scenarioId, guide]));
  return (base.secondaryMissionScores ?? []).map((mission: any) => {
    const guide: any = guideByScenario.get(mission.id); const weighted = (guide?.capabilityRequirements ?? []).map((requirement: any) => ({ value: capabilities[requirement.capability as Capability] ?? 0, weight: requirement.importance === 'core' ? 1 : .6 }));
    const score = weighted.length ? weighted.reduce((sum: number, entry: any) => sum + entry.value * entry.weight, 0) / weighted.reduce((sum: number, entry: any) => sum + entry.weight, 0) : mission.score;
    return { ...mission, score: round(clamp(score)), capabilityRequirements: guide?.capabilityRequirements ?? [] };
  });
}
function scoreFrom(base: any, records: ExpertInferenceRecord[], favorable = false): { scores: any; capabilities: Record<Capability, number>; adjustments: Record<Capability, number>; primary: any[]; secondary: any[] } {
  const adjustments = cappedAdjustments(records, favorable);
  const capabilities = Object.fromEntries(CAPABILITIES.map((capability) => [capability, round(clamp((base.capabilityScores?.[capability] ?? 50) + adjustments[capability]))])) as Record<Capability, number>;
  const primary = expertPrimaryMissions(base, adjustments), secondary = expertSecondaryMissions(base, capabilities);
  const sourceContribution = (kinds: SourceKind[]): number => Math.max(-15, Math.min(15, average(records.filter((record) => kinds.includes(record.sourceKind)).map((record) => favorable ? record.favorableContribution : record.contribution))));
  const scores = {
    primary: round(robust(primary.map((mission) => mission.score))), secondary: round(robust(secondary.map((mission) => mission.score))),
    inventory: round(clamp(base.scores.inventory + .3 * average(Object.values(adjustments)) + .2 * adjustments['unit-redundancy'])),
    ruleAndStratagem: round(clamp(base.scores.ruleAndStratagem + sourceContribution(['detachment-rule','stratagem','unit-ability','unit-info','chain']))),
    enhancement: round(clamp(base.scores.enhancement + sourceContribution(['enhancement']))),
    flexibility: round(clamp(base.scores.flexibility + average([adjustments['unit-redundancy'],adjustments['independent-units'],adjustments['action-capacity']]))),
    total: 0
  };
  scores.total = round(WEIGHTS.primary * scores.primary + WEIGHTS.secondary * scores.secondary + WEIGHTS.inventory * scores.inventory + WEIGHTS.ruleAndStratagem * scores.ruleAndStratagem + WEIGHTS.enhancement * scores.enhancement + WEIGHTS.flexibility * scores.flexibility);
  return { scores, capabilities, adjustments, primary, secondary };
}

function relevantRecords(base: any, faction: any, records: ExpertInferenceRecord[]): ExpertInferenceRecord[] {
  const detachmentIds = new Set(base.detachmentIds); const relevantUnits = new Set<string>();
  for (const detachmentId of base.detachmentIds) {
    const detail = faction.detachments.find((entry: any) => entry.id === detachmentId);
    (detail?.topOwnedUnits ?? []).forEach((unit: any) => relevantUnits.add(unit.id));
  }
  return records.filter((record) => record.detachmentId ? detachmentIds.has(record.detachmentId) : record.participants.some((participant) => participant.type === 'unit' && relevantUnits.has(participant.id)));
}
function assess(base: any, faction: any, inferenceData: ReturnType<typeof buildFactionInferences>): ExpertAssessment {
  const records = relevantRecords(base, faction, inferenceData.records); const central = scoreFrom(base, records), favorable = scoreFrom(base, records, true);
  const rawTotal = base.detachmentIds.reduce((sum: number, id: string) => sum + (inferenceData.sourceCounts.get(id) ?? 0), 0);
  const interpreted = records.filter((record) => record.detachmentId).length;
  const unsupported = base.detachmentIds.flatMap((id: string) => inferenceData.unsupportedByDetachment.get(id) ?? []);
  const evidenceConfidence = average(records.map((record) => 100 * record.evidenceFactor));
  const importanceSum = records.reduce((sum, record) => sum + Math.abs(record.baseMagnitude), 0);
  const conditionality = importanceSum ? 100 * records.reduce((sum, record) => sum + Math.abs(record.baseMagnitude) * (1 - record.availabilityFactor), 0) / importanceSum : 0;
  return {
    id: `expert:${base.id}`, factionId: base.factionId, battleSize: base.battleSize, dpBudget: base.dpBudget, kind: base.kind,
    detachmentIds: base.detachmentIds, detachmentNames: base.detachmentNames, detachmentSources: base.detachmentSources, dpCost: base.dpCost, forceDispositions: base.forceDispositions,
    prudentScores: base.scores, expertScores: central.scores, favorableScores: favorable.scores, scoreRange: { prudent: base.scores.total, central: central.scores.total, favorable: favorable.scores.total },
    capabilityScores: central.capabilities, capabilityAdjustments: central.adjustments, favorableCapabilityAdjustments: favorable.adjustments,
    primaryMissionScores: central.primary, secondaryMissionScores: central.secondary,
    interpretationCoverage: round(rawTotal ? 100 * interpreted / rawTotal : 0), evidenceConfidence: round(evidenceConfidence),
    inferenceShare: round(100 * Math.max(0, central.scores.total - base.scores.total) / Math.max(1, central.scores.total)), conditionalityIndex: round(conditionality),
    inferenceIds: records.map((record) => record.id), unsupportedEffects: unsupported,
    warnings: ['Inférences expertes préliminaires : aucune condition de jeu, ressource ou cible n’est supposée satisfaite.', ...(unsupported.length ? [`${unsupported.length} effet(s) restent non interprétés.`] : [])]
  };
}

function comparator(left: ExpertAssessment, right: ExpertAssessment): number {
  return right.expertScores.total - left.expertScores.total || right.scoreRange.prudent - left.scoreRange.prudent || right.evidenceConfidence - left.evidenceConfidence || left.dpCost - right.dpCost || left.id.localeCompare(right.id);
}
function distanceCurve(unitId: string, statsById: Map<string, any>): any[] {
  const stats = statsById.get(unitId); return [0,9,12,18,24,36].map((distance) => {
    const candidates = (stats?.offenseScenarios ?? []).filter((scenario: any) => scenario.targetId === 'infantry' && scenario.distance === distance).sort((left: any, right: any) => right.usefulDamage.mean - left.usefulDamage.mean);
    return { distance, usefulDamage: round(candidates[0]?.usefulDamage.mean ?? 0), mode: candidates[0]?.mode ?? 'hors-portée' };
  });
}
function allocateCore(assessment: ExpertAssessment, faction: any, recordsById: Map<string, ExpertInferenceRecord>, statsById: Map<string, any>): { core: any[]; alternatives: any[] } {
  const owned = faction.ownedUnits.map((unit: any) => ({ ...unit, allFigureIds: [...new Set([...unit.realFigureIds, ...unit.proxyFigureIds])] }));
  const records = assessment.inferenceIds.map((id) => recordsById.get(id)).filter(Boolean) as ExpertInferenceRecord[];
  const relevance = new Map<string, number>();
  for (const record of records) for (const participant of record.participants) if (participant.type === 'unit') relevance.set(participant.id, (relevance.get(participant.id) ?? 0) + Math.abs(record.contribution));
  const candidates = [...owned].sort((left, right) => (relevance.get(right.id) ?? 0) - (relevance.get(left.id) ?? 0) || average(Object.values(right.capabilities) as number[]) - average(Object.values(left.capabilities) as number[]) || left.points - right.points);
  const reserved = new Set<number>(), selected: any[] = [];
  for (const unit of candidates) {
    const available = unit.allFigureIds.filter((id: number) => !reserved.has(id)).slice(0, unit.minimumModels);
    if (available.length < unit.minimumModels) continue;
    available.forEach((id: number) => reserved.add(id));
    const assigned = assessment.detachmentIds.map((id, index) => ({ id, name: assessment.detachmentNames[index], score: records.filter((record) => record.detachmentId === id && record.participants.some((participant) => participant.id === unit.id)).reduce((sum, record) => sum + Math.abs(record.contribution), 0) })).sort((left, right) => right.score - left.score)[0];
    const caps = CAPABILITIES.filter((capability) => unit.capabilities[capability] >= 65).sort((left, right) => unit.capabilities[right] - unit.capabilities[left]).slice(0, 3);
    selected.push({ unitId: unit.id, name: unit.name, assignedDetachmentId: assigned.id, assignedDetachmentName: assigned.name, points: unit.points, minimumModels: unit.minimumModels, figureIds: available, realCount: available.filter((id: number) => unit.realFigureIds.includes(id)).length, proxyCount: available.filter((id: number) => !unit.realFigureIds.includes(id)).length, capabilities: caps, weaponKeywords: unit.weaponKeywords, imageAsset: unit.imageAsset, distanceCurve: distanceCurve(unit.id, statsById), inferenceContribution: round(relevance.get(unit.id) ?? 0) });
    if (selected.length >= 8 || (selected.length >= 4 && new Set(selected.flatMap((entry) => entry.capabilities)).size >= 8)) break;
  }
  const selectedIds = new Set(selected.map((unit) => unit.unitId));
  const alternatives = candidates.filter((unit) => !selectedIds.has(unit.id)).slice(0, 4).map((unit) => ({ unitId: unit.id, name: unit.name, points: unit.points, reason: `Alternative possédée, contribution experte potentielle ${round(relevance.get(unit.id) ?? 0)}.` }));
  return { core: selected, alternatives };
}

function csvCell(value: unknown): string { const valueText = Array.isArray(value) ? value.join(' + ') : String(value ?? ''); return /[",\r\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText; }
function expertCsv(factions: any[]): string {
  const rows = [['faction','rank','kind','detachments','dp_cost','score_prudent','score_central','score_favorable','primary','secondary','inventory','rule_stratagem','enhancement','flexibility','interpretation_coverage_pct','evidence_confidence_pct','inference_share_pct','conditionality_pct','inference_count','unsupported_count']];
  for (const faction of factions) for (const item of faction.assessments) rows.push([item.factionId,item.rank,item.kind,item.detachmentNames,item.dpCost,item.scoreRange.prudent,item.scoreRange.central,item.scoreRange.favorable,item.expertScores.primary,item.expertScores.secondary,item.expertScores.inventory,item.expertScores.ruleAndStratagem,item.expertScores.enhancement,item.expertScores.flexibility,item.interpretationCoverage,item.evidenceConfidence,item.inferenceShare,item.conditionalityIndex,item.inferenceIds.length,item.unsupportedEffects.length]);
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

const statisticsPath = resolve(workspaceRoot, baseline.sources.statistics.path);
const statistics = JSON.parse(gunzipSync(readFileSync(statisticsPath)).toString('utf8'));
const statsById = new Map(statistics.units.map((unit: any) => [unit.id, unit]));
const allInferenceRecords: ExpertInferenceRecord[] = [];
const expertFactions = baseline.factions.filter((faction: any) => EXPERT_TARGET_FACTIONS.has(faction.factionId)).map((faction: any) => {
  process.stdout.write(`Inférences expertes ${faction.factionId}…\n`);
  const inferenceData = buildFactionInferences(faction); allInferenceRecords.push(...inferenceData.records);
  const recordsById = new Map(inferenceData.records.map((record) => [record.id, record]));
  const assessments = faction.assessments.map((base: any) => assess(base, faction, inferenceData)).sort(comparator);
  assessments.forEach((item, index) => { item.rank = index + 1; });
  const singles = assessments.filter((item) => item.kind === 'single'), combinations = assessments.filter((item) => item.kind === 'combination');
  const bestSingle = singles[0], bestCombination = combinations[0] ?? bestSingle; const dispositions = new Set(bestCombination.forceDispositions);
  const alternative = assessments.find((item) => item.id !== bestSingle.id && item.id !== bestCombination.id && item.forceDispositions.some((value) => !dispositions.has(value))) ?? assessments.find((item) => item.id !== bestSingle.id && item.id !== bestCombination.id) ?? bestSingle;
  const featured = [...new Map([bestSingle,bestCombination,alternative].map((item) => [item.id,item])).values()];
  for (const item of featured) { const allocation = allocateCore(item, faction, recordsById, statsById); item.core = allocation.core; item.alternatives = allocation.alternatives; }
  const sensitivity = faction.sensitivity.map((entry: any) => {
    const adjusted = entry.top.map((base: any) => assess(base, faction, inferenceData)).sort(comparator); adjusted.forEach((item, index) => { item.rank = index + 1; });
    return { battleSize: entry.battleSize, dpBudget: entry.dpBudget, evaluated: entry.evaluated, top: adjusted };
  });
  const detachmentDetails = faction.detachments.map((detail: any) => ({ ...detail, inferenceIds: inferenceData.records.filter((record) => record.detachmentId === detail.id).map((record) => record.id), unsupportedEffects: inferenceData.unsupportedByDetachment.get(detail.id) ?? [], expertAssessmentId: assessments.find((item) => item.detachmentIds.length === 1 && item.detachmentIds[0] === detail.id)?.id }));
  return { ...faction, detachmentDetails, featuredIds: featured.map((item) => item.id), assessments, sensitivity, inferenceSummary: { records: inferenceData.records.length, direct: inferenceData.records.filter((record) => record.evidenceKind === 'direct-inference').length, chained: inferenceData.records.filter((record) => record.evidenceKind === 'chained-inference').length, structured: inferenceData.records.filter((record) => record.evidenceKind === 'fact-structured').length } };
});

const inferenceRecords = [...new Map(allInferenceRecords.map((record) => [record.id, record])).values()];
const expertReport = {
  schemaVersion: EXPERT_SCHEMA, inferenceSchemaVersion: INFERENCE_SCHEMA, methodologyVersion: METHODOLOGY_VERSION,
  generatedAt: new Date().toISOString(), snapshotDate: SNAPSHOT_DATE, battleSize: baseline.battleSize, sensitivityBattleSizes: baseline.sensitivityBattleSizes,
  scoreWeights: WEIGHTS, adjustmentCapPerCapability: 15, evidenceFactors: EVIDENCE_FACTORS, availabilityFactors: AVAILABILITY_FACTORS,
  status: 'draft', sourceTier: 'inference', assumptions: [...baseline.assumptions, 'Lecture experte conditionnelle de tous les textes locaux classifiables.', 'Aucune source web ou donnée compétitive externe.'],
  sources: baseline.sources, secondaryMissionFamilies: baseline.secondaryMissionFamilies, factions: expertFactions
};

mkdirSync(outputDirectory, { recursive: true });
const assessmentPath = resolve(outputDirectory, 'expert-assessments.json');
writeFileSync(assessmentPath, `${JSON.stringify(expertReport, null, 2)}\n`, 'utf8');
writeFileSync(resolve(outputDirectory, 'expert-inferences.json'), `${JSON.stringify({ schemaVersion: INFERENCE_SCHEMA, methodologyVersion: METHODOLOGY_VERSION, generatedAt: expertReport.generatedAt, status: 'draft', records: inferenceRecords }, null, 2)}\n`, 'utf8');
writeFileSync(resolve(outputDirectory, 'expert-scores.csv'), expertCsv(expertFactions), 'utf8');
writeFileSync(resolve(outputDirectory, 'methodologie-experte.md'), `# Méthodologie experte conditionnelle\n\nVersion : \`${METHODOLOGY_VERSION}\`  \nCatalogue : ${baseline.sources.catalog.version}  \nSnapshot : ${SNAPSHOT_DATE}\n\n## Principe\n\nCe second rapport conserve les pondérations du rapport prudent mais interprète les textes bruts locaux. Chaque inférence reste \`draft\`, cite un chemin et une empreinte de texte, expose ses participants, conditions, contre-jeu et compromis.\n\n## Contribution\n\n\`importance × facteur de preuve × facteur de disponibilité\` : importance 3/6/9 ; preuve 1/0,8/0,6 ; disponibilité 1/0,75/0,5/0,35. Chaque capacité est plafonnée à ±15 points.\n\n## Indicateurs\n\n- couverture : part des effets du détachement ayant reçu une interprétation ;\n- confiance : qualité des preuves interprétées, indépendante de la couverture ;\n- part inférée : hausse du score central par rapport au score prudent ;\n- conditionnalité : dépendance pondérée aux conditions, PC et réactions adverses ;\n- plage : score prudent, central et favorable.\n\nAucune condition de jeu n’est supposée satisfaite et aucun score n’est un taux de victoire.\n`, 'utf8');
const manifest = { schemaVersion: 'warforge-expert-report-manifest/v1', generatedAt: expertReport.generatedAt, snapshotDate: SNAPSHOT_DATE, reportSchema: EXPERT_SCHEMA, inferenceSchema: INFERENCE_SCHEMA, methodologyVersion: METHODOLOGY_VERSION, inputs: { ...baseline.sources, prudentReport: { path: baselinePath.replace(`${workspaceRoot}\\`, '').replaceAll('\\','/'), sha256: hash(readFileSync(baselinePath,'utf8')) } }, outputs: ['00-synthese-experte.pdf','01-space-marines-expert.pdf','02-salamanders-expert.pdf','03-dark-angels-expert.pdf','04-blood-angels-expert.pdf','expert-assessments.json','expert-inferences.json','expert-scores.csv','methodologie-experte.md','chart-audit.json'], qualityGates: { applicationChanged: false, gameDataChanged: false, externalSourcesUsed: false, preliminaryInferences: true, winProbabilityReported: false } };
writeFileSync(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const bundledPython = resolve(process.env.USERPROFILE ?? '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python = process.env.WARFORGE_REPORT_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python');
const renderer = resolve(projectRoot, 'scripts/render-expert-detachment-report.py');
const rendered = spawnSync(python, [renderer, '--input', assessmentPath, '--inferences', resolve(outputDirectory, 'expert-inferences.json'), '--output', outputDirectory, '--public-root', resolve(projectRoot, 'public')], { cwd: projectRoot, stdio: 'inherit', env: process.env });
if (rendered.status !== 0) throw new Error(`Le rendu expert a échoué avec le code ${rendered.status ?? 'inconnu'}.`);
process.stdout.write(`Rapports experts générés dans ${outputDirectory}\n`);
