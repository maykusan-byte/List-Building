import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildCatalog } from './build-catalog.mjs';

const output = process.argv[2];
const slug = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'inconnu';
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;

if (!output) {
  console.error('Usage : node scripts/export-catalog-unit-index.mjs <fichier-cible.csv>');
  process.exitCode = 1;
} else {
  const { catalog } = await buildCatalog();
  const rows = ['UnitId,Faction,Source,Nom_datasheet'];
  catalog.Books.forEach((book) => {
    const bookId = `book-${slug(book.SourceKey)}`;
    (book.Units ?? []).forEach((unit, unitIndex) => rows.push([`${bookId}:unit:${unitIndex}`, book.Name ?? '', book.SourceLabel ?? '', unit.Name ?? ''].map(quote).join(',')));
  });
  await writeFile(resolve(output), rows.join('\n').concat('\n'), 'utf8');
  console.log(`Index de catalogue exporté : ${output}.`);
}
