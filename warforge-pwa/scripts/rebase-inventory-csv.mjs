import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildCatalog } from './build-catalog.mjs';

const apply = process.argv.includes('--apply');
const excludeUnavailable = process.argv.includes('--exclude-unavailable');
const inventoryPath = resolve(import.meta.dirname, '../data/inventory/datasheet_x_figs.csv');
const masterPath = resolve(import.meta.dirname, '../../legacy/warorgan/master_warorgan.json');
const unavailablePath = resolve(import.meta.dirname, '../data/inventory-v11-unavailable.csv');
const slug = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'inconnu';
const parseCsv = (raw) => raw.trimEnd().split(/\r?\n/).map((line) => line.split(','));
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const { catalog } = await buildCatalog();
const oldBooks = JSON.parse((await readFile(masterPath, 'utf8')).replace(/^\uFEFF/, ''));
const rows = parseCsv(await readFile(inventoryPath, 'utf8'));
const header = rows.shift();
const columns = new Map(header.map((value, index) => [value.trim(), index]));
for (const required of ['DatabaseFingerprint', 'UnitId', 'ID_figurine', 'Type']) if (!columns.has(required)) throw new Error(`CSV sans colonne ${required}.`);
const oldUnits = new Map();
oldBooks.forEach((book, bookIndex) => (book.Units ?? []).forEach((unit, unitIndex) => oldUnits.set(
  `book-${bookIndex}-${slug(String(book.Id ?? book.Name ?? '').trim())}:unit:${unitIndex}`,
  { unit, sourceKey: typeof book.Name === 'string' ? book.Name : '' }
)));
const targetsBySourceAndName = new Map();
catalog.Books.forEach((book) => (book.Units ?? []).forEach((unit, unitIndex) => {
  const unitId = `book-${slug(book.SourceKey)}:unit:${unitIndex}`;
  const nameValues = targetsBySourceAndName.get(`${book.SourceKey}\u0000${unit.Name ?? ''}`) ?? [];
  nameValues.push(unitId);
  targetsBySourceAndName.set(`${book.SourceKey}\u0000${unit.Name ?? ''}`, nameValues);
}));
const output = [];
const unresolved = [];
const reviewed = new Map();
const strategies = { sourceName: 0 };
const fingerprint = catalogFingerprint(catalog);
for (let line = 0; line < rows.length; line += 1) {
  const row = rows[line];
  const oldId = row[columns.get('UnitId')];
  let resolution = reviewed.get(oldId);
  if (!resolution) {
    const oldRecord = oldUnits.get(oldId);
    const sourceName = oldRecord ? targetsBySourceAndName.get(`${oldRecord.sourceKey}\u0000${oldRecord.unit.Name ?? ''}`) ?? [] : [];
    resolution = { candidates: sourceName, strategy: 'sourceName' };
    reviewed.set(oldId, resolution);
  }
  if (resolution.candidates.length !== 1) {
    unresolved.push({ line: line + 2, unitId: oldId, candidates: resolution.candidates.length, figureId: row[columns.get('ID_figurine')], type: row[columns.get('Type')] });
    continue;
  }
  strategies[resolution.strategy] += 1;
  output.push([fingerprint, resolution.candidates[0], row[columns.get('ID_figurine')], row[columns.get('Type')]]);
}
if (unresolved.length && !(apply && excludeUnavailable)) throw new Error(`Rebase annulé : ${unresolved.length} ligne(s) non résolue(s), notamment ${unresolved.slice(0, 5).map((item) => `ligne ${item.line} (${item.unitId})`).join(', ')}. Relancez avec --apply --exclude-unavailable pour préserver ces lignes hors du CSV actif.`);
if (!apply) {
  console.log(`Rebase vérifié : ${output.length} ligne(s) à valider par contexte de fiche. Nom_datasheet n'est jamais lu. Relancez avec --apply après validation humaine.`);
} else {
  await writeFile(inventoryPath, ['DatabaseFingerprint,UnitId,ID_figurine,Type', ...output.map((row) => row.map(quote).join(','))].join('\n').concat('\n'), 'utf8');
  if (unresolved.length) await writeFile(unavailablePath, ['LegacyUnitId,ID_figurine,Type,Reason', ...unresolved.map((row) => [row.unitId, row.figureId, row.type, 'Datasheet absent du catalogue V11'].map(quote).join(','))].join('\n').concat('\n'), 'utf8');
  console.log(`Inventaire rebased : ${output.length} ligne(s). ${unresolved.length ? `${unresolved.length} ligne(s) indisponible(s) ont été préservées dans ${unavailablePath}.` : ''}`);
}

function catalogFingerprint(value) {
  const raw = `${JSON.stringify(value)}\n`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) { hash ^= raw.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${raw.length}`;
}
