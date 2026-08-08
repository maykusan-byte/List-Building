import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const catalogPath = resolve(projectRoot, 'public/data/catalog.json');
const inventoryPath = resolve(projectRoot, 'data/inventory/datasheet_x_figs.csv');
const seedPath = resolve(projectRoot, 'data/unit-image-seeds.json');
const outputPath = resolve(projectRoot, 'public/data/unit-images.json');
const missingPath = resolve(projectRoot, 'data/unit-image-missing.json');
const publicDataPath = resolve(projectRoot, 'public/data');
const strict = process.argv.includes('--strict');
const check = process.argv.includes('--check');

function fingerprintRaw(raw) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${raw.length}`;
}

function slug(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'inconnu';
}

function csvRows(raw) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quoted) {
      if (character === '"') {
        if (raw[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function inventoryUnitIds(raw) {
  const rows = csvRows(raw.replace(/^\uFEFF/, ''));
  const headers = rows[0] ?? [];
  const unitIdIndex = headers.indexOf('UnitId');
  if (unitIdIndex === -1) throw new Error('Inventaire sans colonne UnitId.');
  return new Set(rows.slice(1).map((row) => row[unitIdIndex]?.trim()).filter(Boolean));
}

function catalogUnits(catalog) {
  return (catalog.Books ?? []).flatMap((book) => {
    const bookId = `book-${slug(String(book.SourceKey ?? book.Name ?? ''))}`;
    return (book.Units ?? []).map((unit, index) => ({
      id: `${bookId}:unit:${index}`,
      name: String(unit.Name ?? '').trim(),
      faction: String(book.Name ?? '').trim()
    }));
  });
}

function seedMatches(seed, unit) {
  return seed.unitNames?.includes(unit.name) && (!seed.factions || seed.factions.includes(unit.faction));
}

async function existingAsset(relativePath) {
  try {
    const path = resolve(publicDataPath, relativePath);
    await access(path);
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

export async function buildUnitImageManifest() {
  const [rawCatalog, rawInventory, rawSeeds] = await Promise.all([
    readFile(catalogPath, 'utf8'),
    readFile(inventoryPath, 'utf8'),
    readFile(seedPath, 'utf8')
  ]);
  const catalog = JSON.parse(rawCatalog.replace(/^\uFEFF/, ''));
  const seeds = JSON.parse(rawSeeds.replace(/^\uFEFF/, ''));
  if (seeds.schemaVersion !== 'warforge-unit-image-seeds/v1' || !Array.isArray(seeds.entries)) throw new Error('Source d’images invalide.');

  const inventoryIds = inventoryUnitIds(rawInventory);
  const units = catalogUnits(catalog);
  const inventoryUnits = units.filter((unit) => inventoryIds.has(unit.id));
  const entries = [];
  const duplicated = [];
  for (const unit of units) {
    const matches = seeds.entries.filter((seed) => seedMatches(seed, unit));
    if (matches.length > 1) {
      duplicated.push(unit.id);
      continue;
    }
    const seed = matches[0];
    if (!seed) continue;
    const asset = `img/units/${seed.asset}`;
    if (!await existingAsset(asset)) continue;
    entries.push({
      unitId: unit.id,
      asset,
      productName: seed.productName ?? unit.name,
      sourceUrl: seed.sourceUrl ?? seed.sourceImageUrl,
      sourceLabel: seed.sourceLabel ?? seeds.sourceLabel,
      licenseReference: seed.licenseReference ?? seeds.licenseReference,
      retrievedAt: seed.retrievedAt ?? seeds.retrievedAt
    });
  }
  if (duplicated.length) throw new Error(`Plusieurs images correspondent à : ${duplicated.join(', ')}.`);

  const manifest = {
    schemaVersion: 'warforge-unit-images/v1',
    databaseFingerprint: fingerprintRaw(rawCatalog),
    generatedAt: seeds.generatedAt,
    entries: entries.sort((left, right) => left.unitId.localeCompare(right.unitId))
  };
  const mapped = new Set(entries.map((entry) => entry.unitId));
  const missing = inventoryUnits.filter((unit) => !mapped.has(unit.id));
  return {
    manifest,
    missing,
    total: inventoryUnits.length,
    mapped: inventoryUnits.length - missing.length,
    catalogTotal: units.length,
    catalogMapped: entries.length
  };
}

const result = await buildUnitImageManifest();
const serialized = `${JSON.stringify(result.manifest, null, 2)}\n`;
const missingReport = `${JSON.stringify({
  schemaVersion: 'warforge-unit-image-missing/v1',
  databaseFingerprint: result.manifest.databaseFingerprint,
  generatedAt: result.manifest.generatedAt,
  total: result.total,
  mapped: result.mapped,
  catalogTotal: result.catalogTotal,
  catalogMapped: result.catalogMapped,
  missing: result.missing
}, null, 2)}\n`;
if (check) {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== serialized) throw new Error('Le manifeste public est périmé. Lancez pnpm images:build.');
} else {
  await writeFile(outputPath, serialized, 'utf8');
  await writeFile(missingPath, missingReport, 'utf8');
}

console.log(`Images d’unités : ${result.mapped}/${result.total} fiches d’inventaire associées (${result.catalogMapped}/${result.catalogTotal} au catalogue).`);
if (result.missing.length) {
  console.log(`À valider : ${result.missing.length} fiche(s), voir data/unit-image-missing.json.`);
  if (strict) throw new Error(`${result.missing.length} fiche(s) d’inventaire sans image validée.`);
}
