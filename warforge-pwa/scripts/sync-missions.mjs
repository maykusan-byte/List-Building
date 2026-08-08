import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadValidatedMissionCatalog } from './mission-data.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const outputPath = resolve(projectRoot, 'public/data/missions.json');
const workspaceRoot = resolve(projectRoot, '..');
const gdmAssetOutputPath = resolve(projectRoot, 'public/assets/gdm-11th');

async function syncTrustedWebAssets(catalog) {
  const source = catalog.packs.find((pack) => pack.source?.kind === 'trusted-web')?.source;
  if (!source?.archivePath) return;
  const assetsSourcePath = resolve(dirname(resolve(workspaceRoot, source.archivePath)), 'assets');
  await rm(gdmAssetOutputPath, { recursive: true, force: true });
  await cp(assetsSourcePath, gdmAssetOutputPath, { recursive: true });
}

export async function syncMissionData() {
  const catalog = await loadValidatedMissionCatalog();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await syncTrustedWebAssets(catalog);
  const active = catalog.packs.find((pack) => pack.id === catalog.activePackId);
  console.log(`Missions synchronisées : ${active?.title ?? catalog.activePackId} (${active?.status ?? 'inconnu'}).`);
}
