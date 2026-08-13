import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateSimulatorData } from './validate-simulator-data.mjs';

export async function syncSimulatorData() {
  const { files } = await validateSimulatorData({ validatePublicMirror: false });
  const sourceDirectory = resolve(import.meta.dirname, '../data/simulator');
  const destinationDirectory = resolve(import.meta.dirname, '../public/data/simulator');
  await rm(destinationDirectory, { recursive: true, force: true });
  await mkdir(destinationDirectory, { recursive: true });
  for (const file of files) {
    const destination = resolve(destinationDirectory, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(sourceDirectory, file), destination);
  }
  return { files, destinationDirectory };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  syncSimulatorData()
    .then(({ files }) => console.log(`${files.length} fichiers simulateur synchronisés.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
