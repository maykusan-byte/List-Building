import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const snapshotDate = process.env.WARFORGE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const outputDirectory = resolve(workspaceRoot, `output/pdf/detachment-inventory-report-${snapshotDate}`);
const reportPath = resolve(outputDirectory, 'assessments.json');
const auditPath = resolve(outputDirectory, 'chart-audit.json');

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, probability) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function robust(values) {
  return 0.6 * average(values) + 0.4 * quantile(values, 0.25);
}

invariant(existsSync(reportPath), `Rapport absent : ${reportPath}`);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
invariant(report.schemaVersion === 'warforge-detachment-inventory-report/v1.0.0', 'Schéma de rapport inattendu.');
invariant(report.battleSize.points === 2000 && report.battleSize.detachmentPoints === 3, 'Le format principal doit être 2 000 points / 3 DP.');
invariant(JSON.stringify(report.factions.map((entry) => entry.factionId)) === JSON.stringify(['Space Marines', 'Salamanders', 'Dark Angels', 'Blood Angels']), 'Les quatre factions attendues ne sont pas présentes dans l’ordre canonique.');

let assessmentCount = 0;
for (const faction of report.factions) {
  const detachmentById = new Map(faction.detachments.map((entry) => [entry.id, entry]));
  invariant(faction.assessments.length === faction.evaluated.total, `${faction.factionId}: total d’évaluations incohérent.`);
  invariant(new Set(faction.detachments.map((entry) => entry.name.toLocaleLowerCase())).size === faction.detachments.length, `${faction.factionId}: détachements non dédupliqués.`);
  invariant(faction.assessments.filter((entry) => entry.kind === 'single').length === faction.detachments.length, `${faction.factionId}: classement des détachements incomplet.`);
  faction.assessments.forEach((assessment, index) => {
    assessmentCount += 1;
    invariant(assessment.rank === index + 1, `${assessment.id}: rang instable.`);
    invariant(assessment.dpCost <= 3, `${assessment.id}: dépasse le budget de DP.`);
    invariant(new Set(assessment.detachmentIds).size === assessment.detachmentIds.length, `${assessment.id}: détachement dupliqué.`);
    const chapterLocks = new Set(assessment.detachmentIds.map((id) => detachmentById.get(id)?.chapterLock).filter(Boolean));
    invariant(chapterLocks.size <= 1, `${assessment.id}: identités de chapitre incompatibles.`);
    invariant(assessment.forceDispositions.length > 0 && assessment.primaryMissionScores.length > 0, `${assessment.id}: Force Disposition ou missions principales absentes.`);
    invariant(assessment.secondaryMissionScores.length === 18, `${assessment.id}: les 18 secondaires ne sont pas couvertes.`);
    invariant(Math.abs(assessment.scores.primary - Math.round(robust(assessment.primaryMissionScores.map((entry) => entry.score)) * 100) / 100) <= 0.02, `${assessment.id}: score primaire non reproductible.`);
    invariant(Math.abs(assessment.scores.secondary - Math.round(robust(assessment.secondaryMissionScores.map((entry) => entry.score)) * 100) / 100) <= 0.02, `${assessment.id}: score secondaire non reproductible.`);
    const expectedTotal = 0.20 * assessment.scores.primary + 0.25 * assessment.scores.secondary + 0.20 * assessment.scores.inventory
      + 0.20 * assessment.scores.ruleAndStratagem + 0.10 * assessment.scores.enhancement + 0.05 * assessment.scores.flexibility;
    invariant(Math.abs(assessment.scores.total - expectedTotal) <= 0.02, `${assessment.id}: score total non reproductible.`);
    invariant(assessment.analyticalCoverage >= 0 && assessment.analyticalCoverage <= 100, `${assessment.id}: couverture hors échelle.`);
  });
  for (const featuredId of faction.featuredIds) {
    const assessment = faction.assessments.find((entry) => entry.id === featuredId);
    invariant(assessment, `${faction.factionId}: option approfondie introuvable.`);
    invariant(assessment.core.length >= 4 && assessment.core.length <= 8, `${featuredId}: noyau hors limites 4-8.`);
    const figureIds = assessment.core.flatMap((unit) => unit.figureIds);
    invariant(new Set(figureIds).size === figureIds.length, `${featuredId}: une figurine physique est utilisée deux fois.`);
    for (const unit of assessment.core) {
      invariant(unit.figureIds.length === unit.minimumModels, `${featuredId}: noyau incomplet pour ${unit.name}.`);
      invariant(unit.realCount + unit.proxyCount === unit.minimumModels, `${featuredId}: allocation réelle/proxy incohérente.`);
      invariant(unit.distanceCurve.map((point) => point.distance).join(',') === '0,9,12,18,24,36', `${featuredId}: paliers de distance incomplets.`);
    }
  }
  for (const sensitivity of faction.sensitivity) {
    invariant([1000, 3000].includes(sensitivity.battleSize), `${faction.factionId}: format de sensibilité inattendu.`);
    invariant(sensitivity.top.length > 0 && sensitivity.top.length <= 10, `${faction.factionId}: synthèse de sensibilité invalide.`);
    invariant(sensitivity.top.every((entry) => entry.dpCost <= sensitivity.dpBudget), `${faction.factionId}: sensibilité hors budget.`);
  }
}

const bloodAngels = report.factions.find((entry) => entry.factionId === 'Blood Angels');
invariant(bloodAngels.detachments.length === 24, `Blood Angels : 24 détachements dédupliqués attendus, ${bloodAngels.detachments.length} trouvés.`);
invariant(bloodAngels.evaluated.singles === 24 && bloodAngels.evaluated.combinations === 133, 'Blood Angels : classement exhaustif 24 détachements / 133 combinaisons attendu.');
invariant(bloodAngels.ownedUnits.length > 0 && bloodAngels.inventorySummary.physicalFigureIds > 0, 'Blood Angels : inventaire réel/proxy absent.');

const csvRows = readFileSync(resolve(outputDirectory, 'scores.csv'), 'utf8').trim().split(/\r?\n/);
invariant(csvRows.length === assessmentCount + 1, 'Le CSV ne contient pas exactement toutes les évaluations.');

const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
invariant(audit.charts.length > 0, 'Aucun graphique audité.');
for (const chart of audit.charts) {
  invariant(chart.title && chart.population, `${chart.id}: titre ou population manquante.`);
  for (const axisName of ['xAxis', 'yAxis']) {
    const axis = chart[axisName];
    invariant(axis?.label && axis?.unit && Array.isArray(axis.ticks) && axis.ticks.length > 0, `${chart.id}: ${axisName} sans libellé, unité ou graduations.`);
  }
  if (chart.type === 'heatmap') {
    invariant(chart.colorScale?.minimum === 0 && chart.colorScale?.maximum === 100, `${chart.id}: échelle colorimétrique non bornée 0-100.`);
    invariant(chart.colorScale.ticks.join(',') === '0,20,40,60,80,100', `${chart.id}: graduations colorimétriques incomplètes.`);
  }
  if (['bar', 'line'].includes(chart.type)) {
    invariant(chart.xAxis.minimum === 0 || chart.yAxis.minimum === 0, `${chart.id}: l’axe quantitatif ne commence pas à zéro.`);
  }
}

for (const filename of ['00-synthese-comparative.pdf', '01-space-marines.pdf', '02-salamanders.pdf', '03-dark-angels.pdf', '04-blood-angels.pdf']) {
  const path = resolve(outputDirectory, filename);
  invariant(existsSync(path), `PDF absent : ${filename}`);
  invariant(readFileSync(path).subarray(0, 5).toString('ascii') === '%PDF-', `Signature PDF invalide : ${filename}`);
  invariant(statSync(path).size > 10_000, `PDF anormalement petit : ${filename}`);
}

console.log(`Rapport valide : ${assessmentCount} évaluations, ${audit.charts.length} graphiques, 5 PDF.`);
