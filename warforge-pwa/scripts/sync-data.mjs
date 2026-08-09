import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildCatalog } from './build-catalog.mjs';
import { buildCatalogLocales } from './build-locales.mjs';
import { syncMissionData } from './sync-missions.mjs';
import { syncStrategyKnowledge } from './strategy-knowledge.mjs';

function fingerprintRaw(raw) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${raw.length}`;
}

try {
  const { outputPath } = await buildCatalog();
  await buildCatalogLocales();
  await syncMissionData();
  await syncStrategyKnowledge();
  await import('./build-unit-image-manifest.mjs');
  const source = resolve(import.meta.dirname, '../data/inventory/datasheet_x_figs.csv');
  const destination = resolve(import.meta.dirname, '../public/data/datasheet_x_figs.csv');
  const rulesSource = resolve(import.meta.dirname, '../data/rules/core-rules-fr.json');
  const rulesDestination = resolve(import.meta.dirname, '../public/data/rules/core-rules-fr.json');
  await stat(source);
  await stat(rulesSource);
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(dirname(rulesDestination), { recursive: true });

  const catalogRaw = await readFile(outputPath, 'utf8');
  const catalogFp = fingerprintRaw(catalogRaw);
  let inventoryCsv = await readFile(source, 'utf8');
  inventoryCsv = inventoryCsv.replace(/"fnv1a-[^"]+"/g, `"${catalogFp}"`);
  await writeFile(source, inventoryCsv, 'utf8');

  await copyFile(source, destination);
  await copyFile(rulesSource, rulesDestination);
  await import('./validate-rules.mjs');
  console.log('Catalogue V11 et inventaire synchronisés pour la PWA.');
} catch (error) {
  console.error(`Impossible de synchroniser les données: ${error.message}`);
  process.exitCode = 1;
}
