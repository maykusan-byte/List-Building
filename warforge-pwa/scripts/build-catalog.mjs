import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = resolve(import.meta.dirname, '../data/units');
const outputPath = resolve(import.meta.dirname, '../public/data/catalog.json');
const BATTLE_SIZES = [
  { PointsTotal: 1000, DetachmentPoints: 2, EnhancementLimit: 2, UnitLimit: 2 },
  { PointsTotal: 2000, DetachmentPoints: 3, EnhancementLimit: 4, UnitLimit: 3 },
  { PointsTotal: 3000, DetachmentPoints: 4, EnhancementLimit: 6, UnitLimit: 4 }
];

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

function validatePoints(book, sourceKey) {
  for (const unit of book.Units ?? []) {
    if (/\blegends\b/i.test(unit.Name ?? '')) throw new Error(`${sourceKey}: unité Legends interdite (${unit.Name}).`);
    const bySize = new Map();
    for (const point of unit.Points ?? []) {
      if (typeof point.ModelCount !== 'number') throw new Error(`${sourceKey}: ligne de points invalide pour ${unit.Name ?? 'une unité'}.`);
      const values = bySize.get(point.ModelCount) ?? [];
      values.push(point);
      bySize.set(point.ModelCount, values);
    }
    for (const [modelCount, values] of bySize) {
      const fixed = values.filter((point) => point.UnitCount === undefined);
      const thresholds = values.filter((point) => point.UnitCount !== undefined);
      if (fixed.length > 1 || (fixed.length && thresholds.length)) throw new Error(`${sourceKey}: paliers UnitCount ambigus pour ${unit.Name ?? 'une unité'} (${modelCount} figurines).`);
      const seen = new Set();
      for (const point of thresholds) {
        if (typeof point.UnitCount !== 'number' || point.UnitCount < 1 || seen.has(point.UnitCount)) throw new Error(`${sourceKey}: seuil UnitCount invalide pour ${unit.Name ?? 'une unité'}.`);
        seen.add(point.UnitCount);
      }
    }
  }
}

export async function buildCatalog() {
  const fileNames = (await readdir(sourceDirectory)).filter((name) => name.endsWith('.json')).sort((a, b) => a.localeCompare(b, 'en'));
  const dataInfo = await readJson(resolve(sourceDirectory, 'DataInfo.json'));
  const factionInfo = await readJson(resolve(sourceDirectory, 'FactionInfoData.json'));
  const books = [];
  for (const fileName of fileNames) {
    if (fileName === 'DataInfo.json' || fileName === 'FactionInfoData.json') continue;
    const sourceKey = parse(fileName).name;
    const source = await readJson(resolve(sourceDirectory, fileName));
    if (!source || typeof source !== 'object' || !Array.isArray(source.Units)) throw new Error(`${fileName}: fichier de faction invalide.`);
    validatePoints(source, sourceKey);
    const label = sourceKey.endsWith(' Allies') ? `${String(source.Name ?? sourceKey).trim()} (alliés)` : String(source.Name ?? sourceKey).trim();
    books.push({ ...source, SourceKey: sourceKey, SourceLabel: label });
  }
  const keys = new Set(books.map((book) => book.SourceKey));
  const factionSourceForKeyword = (keyword) => (factionInfo.Factions ?? []).find((faction) =>
    faction.FactionKeyword === keyword || (faction.AdditionalFactionKeywords ?? []).includes(keyword)
  )?.Name;
  for (const faction of factionInfo.Factions ?? []) {
    if (faction.Name && !keys.has(faction.Name)) throw new Error(`FactionInfoData: source principal introuvable pour ${faction.Name}.`);
    for (const ally of faction.Allies ?? []) {
      const source = ally.FactionKeyword && (keys.has(ally.FactionKeyword) ? ally.FactionKeyword : factionSourceForKeyword(ally.FactionKeyword));
      if (ally.FactionKeyword && (!source || !keys.has(source))) throw new Error(`FactionInfoData: allié introuvable ${ally.FactionKeyword}.`);
    }
  }
  const catalog = { SchemaVersion: 'warforge-catalog/v2', DataInfo: dataInfo, FactionInfo: factionInfo, BattleSizeDefinitions: BATTLE_SIZES, Books: books };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, 'utf8');
  console.log(`Catalogue V11 généré : ${books.length} sources, ${books.reduce((sum, book) => sum + book.Units.length, 0)} unités.`);
  return { catalog, outputPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCatalog().catch((error) => {
    console.error(`Impossible de générer le catalogue : ${error.message}`);
    process.exitCode = 1;
  });
}
