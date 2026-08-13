import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const snapshotDate = process.env.WARFORGE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const outputDirectory = resolve(workspaceRoot, `output/pdf/detachment-inventory-expert-report-${snapshotDate}`);
const reportPath = resolve(outputDirectory, 'expert-assessments.json');
const inferencePath = resolve(outputDirectory, 'expert-inferences.json');
const auditPath = resolve(outputDirectory, 'chart-audit.json');

function invariant(condition, message) { if (!condition) throw new Error(message); }
function close(left, right, tolerance = .02) { return Math.abs(left - right) <= tolerance; }
function finitePercent(value) { return Number.isFinite(value) && value >= 0 && value <= 100; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function quantile(values, probability) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
function robust(values) { return .6 * average(values) + .4 * quantile(values, .25); }

invariant(existsSync(reportPath) && existsSync(inferencePath), 'Exports experts absents.');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const inferenceDocument = JSON.parse(readFileSync(inferencePath, 'utf8'));
invariant(report.schemaVersion === 'warforge-detachment-inventory-expert-report/v1.0.0', 'Schéma expert inattendu.');
invariant(inferenceDocument.schemaVersion === 'warforge-expert-inferences/v1.0.0', 'Schéma d’inférence inattendu.');
invariant(report.status === 'draft' && inferenceDocument.status === 'draft', 'Les conclusions expertes doivent rester draft.');
invariant(report.battleSize.points === 2000 && report.battleSize.detachmentPoints === 3, 'Format principal incorrect.');
invariant(JSON.stringify(report.factions.map((entry) => entry.factionId)) === JSON.stringify(['Space Marines', 'Salamanders', 'Dark Angels', 'Blood Angels']), 'Périmètre faction incorrect.');
invariant(report.adjustmentCapPerCapability === 15, 'Plafond de contribution inattendu.');

const evidenceFactors = report.evidenceFactors;
const availabilityFactors = report.availabilityFactors;
const recordsById = new Map();
for (const record of inferenceDocument.records) {
  invariant(!recordsById.has(record.id), `${record.id}: identifiant d’inférence dupliqué.`);
  recordsById.set(record.id, record);
  invariant(record.status === 'draft', `${record.id}: statut non préliminaire.`);
  invariant(record.sourcePath && /^[a-f0-9]{64}$/.test(record.sourceHash) && record.sourceExcerpt, `${record.id}: trace locale incomplète.`);
  invariant(Array.isArray(record.participants) && record.participants.length > 0, `${record.id}: participants absents.`);
  invariant(record.capabilities.length > 0 && record.prerequisites && record.timing && record.counterplay, `${record.id}: lecture tactique incomplète.`);
  invariant(evidenceFactors[record.evidenceKind] === record.evidenceFactor, `${record.id}: facteur de preuve incorrect.`);
  invariant(availabilityFactors[record.availabilityKind] === record.availabilityFactor, `${record.id}: facteur de disponibilité incorrect.`);
  invariant(close(record.contribution, record.baseMagnitude * record.evidenceFactor * record.availabilityFactor), `${record.id}: contribution non reproductible.`);
  invariant(close(record.favorableContribution, record.baseMagnitude * record.evidenceFactor), `${record.id}: contribution favorable non reproductible.`);
  invariant([3, 6, 9].includes(Math.abs(record.baseMagnitude)), `${record.id}: importance hors barème 3/6/9.`);
  invariant(record.cpCost === null || (Number.isFinite(record.cpCost) && record.cpCost >= 0), `${record.id}: coût PC invalide.`);
}

let assessmentCount = 0;
for (const faction of report.factions) {
  invariant(faction.assessments.length === faction.evaluated.total, `${faction.factionId}: classement non exhaustif.`);
  invariant(faction.assessments.filter((entry) => entry.kind === 'single').length === faction.detachmentDetails.length, `${faction.factionId}: détachements seuls incomplets.`);
  for (const [index, assessment] of faction.assessments.entries()) {
    assessmentCount += 1;
    invariant(assessment.rank === index + 1, `${assessment.id}: rang instable.`);
    invariant(assessment.dpCost <= 3 && new Set(assessment.detachmentIds).size === assessment.detachmentIds.length, `${assessment.id}: combinaison illégale.`);
    invariant(assessment.secondaryMissionScores.length === 18, `${assessment.id}: couverture des 18 secondaires absente.`);
    invariant(assessment.inferenceIds.every((id) => recordsById.has(id)), `${assessment.id}: référence d’inférence orpheline.`);
    invariant(new Set(assessment.inferenceIds).size === assessment.inferenceIds.length, `${assessment.id}: effet équivalent dupliqué.`);
    for (const value of Object.values(assessment.capabilityAdjustments)) invariant(Math.abs(value) <= 15, `${assessment.id}: plafond central dépassé.`);
    for (const value of Object.values(assessment.favorableCapabilityAdjustments)) invariant(Math.abs(value) <= 15, `${assessment.id}: plafond favorable dépassé.`);
    for (const name of ['interpretationCoverage', 'evidenceConfidence', 'inferenceShare', 'conditionalityIndex']) invariant(finitePercent(assessment[name]), `${assessment.id}: ${name} hors échelle.`);
    for (const value of Object.values(assessment.scoreRange)) invariant(finitePercent(value), `${assessment.id}: plage de score invalide.`);
    invariant(close(assessment.expertScores.primary, robust(assessment.primaryMissionScores.map((entry) => entry.score))), `${assessment.id}: primaire non reproductible.`);
    invariant(close(assessment.expertScores.secondary, robust(assessment.secondaryMissionScores.map((entry) => entry.score))), `${assessment.id}: secondaire non reproductible.`);
    const s = assessment.expertScores;
    const total = .20*s.primary + .25*s.secondary + .20*s.inventory + .20*s.ruleAndStratagem + .10*s.enhancement + .05*s.flexibility;
    invariant(close(s.total, total), `${assessment.id}: total central non reproductible.`);
    invariant(close(assessment.scoreRange.central, s.total), `${assessment.id}: score central divergent.`);
  }
  for (const featuredId of faction.featuredIds) {
    const assessment = faction.assessments.find((entry) => entry.id === featuredId);
    invariant(assessment, `${faction.factionId}: option approfondie absente.`);
    invariant(assessment.core.length >= 4 && assessment.core.length <= 8, `${featuredId}: noyau hors limites 4-8.`);
    const figureIds = assessment.core.flatMap((unit) => unit.figureIds);
    invariant(new Set(figureIds).size === figureIds.length, `${featuredId}: figurine physique utilisée deux fois.`);
    for (const unit of assessment.core) {
      invariant(unit.figureIds.length === unit.minimumModels, `${featuredId}: allocation physique incomplète pour ${unit.name}.`);
      invariant(unit.realCount + unit.proxyCount === unit.minimumModels, `${featuredId}: ventilation réel/proxy incohérente.`);
      invariant(unit.distanceCurve.map((point) => point.distance).join(',') === '0,9,12,18,24,36', `${featuredId}: paliers Pistol/Rapid Fire/Melta incomplets.`);
    }
  }
  for (const entry of faction.sensitivity) {
    invariant([1000, 3000].includes(entry.battleSize), `${faction.factionId}: format de sensibilité invalide.`);
    invariant(entry.top.length > 0 && entry.top.length <= 10 && entry.top.every((item) => item.dpCost <= entry.dpBudget), `${faction.factionId}: sensibilité invalide.`);
  }
}
const bloodAngels = report.factions.find((entry) => entry.factionId === 'Blood Angels');
invariant(bloodAngels, 'Analyse Blood Angels absente.');
invariant(bloodAngels.assessments.length === 157, `Blood Angels : ${bloodAngels.assessments.length} options au lieu de 157.`);
invariant(bloodAngels.assessments.filter((entry) => entry.kind === 'single').length === 24, 'Blood Angels : les 24 détachements seuls ne sont pas tous présents.');
invariant(bloodAngels.assessments.filter((entry) => entry.kind === 'combination').length === 133, 'Blood Angels : les 133 combinaisons légales ne sont pas toutes présentes.');
invariant(assessmentCount === 473, `Nombre d’options inattendu : ${assessmentCount}.`);

const csvRows = readFileSync(resolve(outputDirectory, 'expert-scores.csv'), 'utf8').trim().split(/\r?\n/);
invariant(csvRows.length === assessmentCount + 1, 'Le CSV expert ne contient pas toutes les options.');
const manifest = JSON.parse(readFileSync(resolve(outputDirectory, 'manifest.json'), 'utf8'));
invariant(manifest.qualityGates.externalSourcesUsed === false && manifest.qualityGates.preliminaryInferences === true && manifest.qualityGates.winProbabilityReported === false, 'Garde-fous du manifeste incorrects.');

const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
invariant(audit.charts.length > 0, 'Aucun graphique expert audité.');
for (const chart of audit.charts) {
  invariant(chart.title && chart.population, `${chart.id}: titre ou population absent.`);
  for (const axisName of ['xAxis', 'yAxis']) {
    const axis = chart[axisName];
    invariant(axis?.label && axis?.unit && Array.isArray(axis.ticks) && axis.ticks.length > 0, `${chart.id}: ${axisName} sans axe, unité ou graduations.`);
  }
  if (chart.type === 'heatmap') invariant(chart.colorScale?.minimum === 0 && chart.colorScale?.maximum === 100 && chart.colorScale.ticks.join(',') === '0,20,40,60,80,100', `${chart.id}: échelle colorimétrique invalide.`);
  if (chart.type === 'bar') invariant(chart.xAxis.minimum === 0, `${chart.id}: barres sans origine zéro.`);
  if (chart.type === 'line') invariant(chart.xAxis.minimum === 0 && chart.yAxis.minimum === 0, `${chart.id}: courbe sans origine zéro.`);
  if (chart.type === 'waterfall') invariant(Number.isFinite(chart.yAxis.minimum) && Number.isFinite(chart.yAxis.maximum) && chart.yAxis.ticks.length === 6, `${chart.id}: échelle cascade incomplète.`);
}

for (const filename of ['00-synthese-experte.pdf', '01-space-marines-expert.pdf', '02-salamanders-expert.pdf', '03-dark-angels-expert.pdf', '04-blood-angels-expert.pdf']) {
  const path = resolve(outputDirectory, filename);
  invariant(existsSync(path), `PDF absent : ${filename}`);
  invariant(readFileSync(path).subarray(0, 5).toString('ascii') === '%PDF-', `Signature PDF invalide : ${filename}`);
  invariant(statSync(path).size > 10_000, `PDF anormalement petit : ${filename}`);
}

console.log(`Rapport expert valide : ${assessmentCount} options, ${inferenceDocument.records.length} inférences traçables, ${audit.charts.length} graphiques, 5 PDF.`);
