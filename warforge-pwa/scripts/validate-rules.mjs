import { readFile } from 'node:fs/promises';

const path = new URL('../data/rules/core-rules-fr.json', import.meta.url);
const document = JSON.parse(await readFile(path, 'utf8'));
const expectedReferences = new Set(Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(2, '0')));
const seenIds = new Set();
const seenReferences = new Set();
const seenPrintedPages = new Set();

function fail(message) {
  throw new Error(`Invalid core rules document: ${message}`);
}

if (document.schemaVersion !== 'warforge-rules/v1') fail('unsupported schema version');
if (document.source?.language !== 'fr' || document.source?.pdfPageCount !== 88) fail('unexpected source metadata');
if (!Array.isArray(document.chapters) || document.chapters.length === 0) fail('missing chapters');

for (const chapter of document.chapters) {
  if (!Array.isArray(chapter.sections) || chapter.sections.length === 0) fail(`chapter ${chapter.id} has no sections`);
  for (const section of chapter.sections) {
    if (!section.id || seenIds.has(section.id)) fail(`duplicate or missing section id ${section.id}`);
    seenIds.add(section.id);
    if (!Array.isArray(section.sourcePages) || section.sourcePages.length !== 2 || section.sourcePages[0] < 1 || section.sourcePages[1] > 88 || section.sourcePages[0] > section.sourcePages[1]) fail(`invalid page range for ${section.id}`);
    if (section.reference) seenReferences.add(section.reference);
    if (!Array.isArray(section.pages) || section.pages.length === 0) fail(`missing pages for ${section.id}`);
    for (const page of section.pages) {
      if (!Number.isInteger(page.printedPage) || page.printedPage < section.sourcePages[0] || page.printedPage > section.sourcePages[1]) fail(`page outside section for ${section.id}`);
      if (seenPrintedPages.has(page.printedPage)) fail(`duplicate source page ${page.printedPage}`);
      seenPrintedPages.add(page.printedPage);
      if (!Array.isArray(page.blocks) || page.blocks.length === 0 || page.blocks.some((block) => !['text', 'callout', 'table', 'diagram'].includes(block.kind))) fail(`invalid blocks for ${section.id}`);
    }
  }
}

for (const reference of expectedReferences) {
  if (!seenReferences.has(reference)) fail(`missing rule reference ${reference}`);
}
for (let page = 1; page <= 88; page += 1) {
  if (!seenPrintedPages.has(page)) fail(`missing source page ${page}`);
}
console.log(`Validated core rules: ${seenIds.size} sections, ${seenReferences.size} numbered references, ${seenPrintedPages.size} source pages.`);
