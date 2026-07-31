import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildCatalog } from './build-catalog.mjs';
import { buildCatalogLocales } from './build-locales.mjs';

try {
  await buildCatalog();
  await buildCatalogLocales();
  await import('./build-unit-image-manifest.mjs');
  const source = resolve(import.meta.dirname, '../../datasheet_x_figs.csv');
  const destination = resolve(import.meta.dirname, '../public/data/datasheet_x_figs.csv');
  const rulesSource = resolve(import.meta.dirname, '../data/rules/core-rules-fr.json');
  const rulesDestination = resolve(import.meta.dirname, '../public/data/rules/core-rules-fr.json');
  await stat(source);
  await stat(rulesSource);
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(dirname(rulesDestination), { recursive: true });
  await copyFile(source, destination);
  await copyFile(rulesSource, rulesDestination);
  await import('./validate-rules.mjs');
  console.log('Catalogue V11 et inventaire synchronisés pour la PWA.');
} catch (error) {
  console.error(`Impossible de synchroniser les données: ${error.message}`);
  process.exitCode = 1;
}
