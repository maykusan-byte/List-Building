import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeDatabase } from '../src/domain/normalize';
import { DEFAULT_STATISTICS_REPORT_REQUEST, buildStatisticsReportSnapshot } from '../src/domain/statistics-report';

const projectRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(projectRoot, '..');
const catalogPath = resolve(projectRoot, 'public/data/catalog.json');
const imageManifestPath = resolve(projectRoot, 'public/data/unit-images.json');
const temporaryDirectory = resolve(workspaceRoot, 'tmp/pdfs');

if (!existsSync(catalogPath)) throw new Error('Catalogue généré absent. Exécutez pnpm sync-data.');
mkdirSync(temporaryDirectory, { recursive: true });
const progressPath = resolve(temporaryDirectory, 'statistics-report-progress.log');
writeFileSync(progressPath, '', 'utf8');

const database = normalizeDatabase(readFileSync(catalogPath, 'utf8'));
const request = {
  ...DEFAULT_STATISTICS_REPORT_REQUEST,
  snapshotDate: process.env.WARFORGE_REPORT_DATE ?? DEFAULT_STATISTICS_REPORT_REQUEST.snapshotDate
};
const snapshot = buildStatisticsReportSnapshot(database, request, (message) => {
  process.stdout.write(`${message}\n`);
  appendFileSync(progressPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
});
const version = snapshot.catalogVersion.replace(/[^a-zA-Z0-9.-]+/g, '-');
const engine = snapshot.engineVersion.split('/').at(-1)?.replace(/[^a-zA-Z0-9.-]+/g, '-') ?? 'unknown';
const outputDirectory = resolve(workspaceRoot, `deliverables/statistics-reports/${snapshot.snapshotDate}-catalog-${version}-engine-${engine}`);
mkdirSync(outputDirectory, { recursive: true });

const snapshotPath = resolve(temporaryDirectory, 'statistics-report-snapshot.json');
writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');

const bundledPython = resolve(
  process.env.USERPROFILE ?? '',
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
);
const python = process.env.WARFORGE_REPORT_PYTHON ?? (existsSync(bundledPython) ? bundledPython : 'python');
const renderer = resolve(projectRoot, 'scripts/render-statistics-reports.py');
const render = spawnSync(python, [renderer, '--snapshot', snapshotPath, '--images', imageManifestPath, '--public-root', resolve(projectRoot, 'public'), '--output', outputDirectory], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env
});
if (render.status !== 0) throw new Error(`Le rendu PDF a échoué avec le code ${render.status ?? 'inconnu'}.`);

process.stdout.write(`Rapports statistiques générés : ${outputDirectory}\n`);
