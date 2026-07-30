import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const files = [
  ['../../master_warorgan.json', '../public/data/master_warorgan.json'],
  ['../../datasheet_x_figs.csv', '../public/data/datasheet_x_figs.csv']
];

try {
  for (const [sourcePath, destinationPath] of files) {
    const source = resolve(import.meta.dirname, sourcePath);
    const destination = resolve(import.meta.dirname, destinationPath);
    await stat(source);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  console.log('Base de données et inventaire synchronisés pour la PWA.');
} catch (error) {
  console.error(`Impossible de synchroniser les données: ${error.message}`);
  process.exitCode = 1;
}
