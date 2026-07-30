import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = process.argv[2];
if (!output) {
  console.error('Usage : node scripts/export-catalog-unit-index.mjs <fichier-cible.csv>');
  process.exitCode = 1;
} else {
  const masterPath = resolve(import.meta.dirname, '../../master_warorgan.json');
  const raw = new TextDecoder().decode(await readFile(masterPath));
  const books = JSON.parse(raw);
  const slug = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'inconnu';
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = ['UnitId,Faction,Nom_datasheet'];
  books.forEach((book, bookIndex) => {
    const bookId = `book-${bookIndex}-${slug((book.Id ?? book.Name ?? '').trim())}`;
    (book.Units ?? []).forEach((unit, unitIndex) => rows.push([`${bookId}:unit:${unitIndex}`, book.Name ?? '', unit.Name ?? ''].map(quote).join(',')));
  });
  await writeFile(resolve(output), rows.join('\n').concat('\n'), 'utf8');
  console.log(`Index de catalogue exporté : ${output}.`);
}
