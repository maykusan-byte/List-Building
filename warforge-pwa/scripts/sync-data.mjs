import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildCatalog } from './build-catalog.mjs';

try {
  await buildCatalog();
  const source = resolve(import.meta.dirname, '../../datasheet_x_figs.csv');
  const destination = resolve(import.meta.dirname, '../public/data/datasheet_x_figs.csv');
  await stat(source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log('Catalogue V11 et inventaire synchronisés pour la PWA.');
} catch (error) {
  console.error(`Impossible de synchroniser les données: ${error.message}`);
  process.exitCode = 1;
}
