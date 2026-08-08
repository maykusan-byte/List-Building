import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadValidatedMissionCatalog } from './mission-data.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const outputPath = resolve(projectRoot, 'public/data/missions.json');

export async function syncMissionData() {
  const catalog = await loadValidatedMissionCatalog();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  const active = catalog.packs.find((pack) => pack.id === catalog.activePackId);
  console.log(`Missions synchronisées : ${active?.title ?? catalog.activePackId} (${active?.status ?? 'inconnu'}).`);
}
