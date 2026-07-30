import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const source = resolve(import.meta.dirname, '../../master_warorgan.json');
const destination = resolve(import.meta.dirname, '../public/data/master_warorgan.json');

try {
  await stat(source);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  console.log('Base de données synchronisée pour la PWA.');
} catch (error) {
  console.error(`Impossible de synchroniser la base: ${error.message}`);
  process.exitCode = 1;
}
