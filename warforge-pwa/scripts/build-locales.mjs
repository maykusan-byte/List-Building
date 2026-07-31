import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const catalogPath = resolve(import.meta.dirname, '../public/data/catalog.json');
const frenchSourcePath = resolve(import.meta.dirname, '../data/locales/fr/official.json');
const frenchOutputPath = resolve(import.meta.dirname, '../public/data/locales/fr/catalog.json');

function fingerprintRaw(raw) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${raw.length}`;
}

function validateEntries(entries, books, type) {
  for (const key of Object.keys(entries ?? {})) {
    const separator = key.lastIndexOf('::');
    const sourceKey = key.slice(0, separator);
    const sourceIndex = Number(key.slice(separator + 2));
    const book = books.find((candidate) => candidate.SourceKey === sourceKey);
    const collection = type === 'units' ? book?.Units : book?.Dettachments;
    if (separator < 1 || !Number.isInteger(sourceIndex) || sourceIndex < 0 || !collection?.[sourceIndex]) {
      throw new Error(`Traduction française invalide : ${type}.${key} ne cible aucune entrée du catalogue.`);
    }
  }
}

export async function buildCatalogLocales() {
  const [rawCatalog, rawFrenchSource] = await Promise.all([readFile(catalogPath, 'utf8'), readFile(frenchSourcePath, 'utf8')]);
  const catalog = JSON.parse(rawCatalog.replace(/^\uFEFF/, ''));
  const source = JSON.parse(rawFrenchSource.replace(/^\uFEFF/, ''));
  if (source.schemaVersion !== 'warforge-official-locale-source/v1' || source.locale !== 'fr') {
    throw new Error('La source de localisation française est invalide.');
  }
  validateEntries(source.units, catalog.Books ?? [], 'units');
  validateEntries(source.detachments, catalog.Books ?? [], 'detachments');
  const overlay = { ...source, schemaVersion: 'warforge-catalog-locale/v1', catalogFingerprint: fingerprintRaw(rawCatalog) };
  await mkdir(dirname(frenchOutputPath), { recursive: true });
  await writeFile(frenchOutputPath, `${JSON.stringify(overlay)}\n`, 'utf8');
  console.log(`Localisation française générée : ${Object.keys(source.units ?? {}).length} unité(s), ${Object.keys(source.detachments ?? {}).length} détachement(s).`);
  return { overlay, outputPath: frenchOutputPath };
}
