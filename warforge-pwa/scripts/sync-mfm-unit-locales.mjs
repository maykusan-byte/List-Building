import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const unitsDirectory = resolve(import.meta.dirname, '../data/units');
const localeSourcePath = resolve(import.meta.dirname, '../data/locales/fr/official.json');
const reportPath = resolve(import.meta.dirname, '../data/locales/fr/mfm-unit-localization-report.json');
const MFM_ROOT = 'https://mfm.warhammer-community.com';

const MFM_SLUG_BY_SOURCE = {
  'Adepta Sororitas': 'adepta-sororitas',
  'Adeptus Custodes': 'adeptus-custodes',
  'Adeptus Mechanicus': 'adeptus-mechanicus',
  'Adeptus Titanicus': 'titan-legions',
  Aeldari: 'aeldari',
  'Astra Militarum': 'astra-militarum',
  'Black Templars': 'black-templars',
  'Blood Angels': 'blood-angels',
  'Chaos Daemons': 'chaos-daemons',
  'Chaos Knights': 'chaos-knights',
  'Chaos Space Marines': 'chaos-space-marines',
  'Dark Angels': 'dark-angels',
  'Death Guard': 'death-guard',
  Deathwatch: 'deathwatch',
  Drukhari: 'drukhari',
  "Emperor's Children": 'emperors-children',
  'Genestealer Cults': 'genestealer-cults',
  'Grey Knights': 'grey-knights',
  'Imperial Agents': 'imperial-agents',
  'Imperial Knights': 'imperial-knights',
  'Leagues of Votann': 'leagues-of-votann',
  Necrons: 'necrons',
  Orks: 'orks',
  'Space Marines': 'space-marines',
  'Space Wolves': 'space-wolves',
  'Tau Empire': 'tau-empire',
  'Thousand Sons': 'thousand-sons',
  Tyranids: 'tyranids',
  'World Eaters': 'world-eaters',
  'Imperial Fists': 'space-marines',
  'Iron Hands': 'space-marines',
  'Raven Guard': 'space-marines',
  Salamanders: 'space-marines',
  Ultramarines: 'space-marines',
  'White Scars': 'space-marines'
};

/**
 * The local catalog uses singular/plural variants for these three datasheets,
 * while the MFM publishes the official title with the alternate number.
 * Each value was verified against the paired MFM EN/FR page and is retained
 * here rather than using a loose fuzzy match.
 */
const MFM_NAME_VARIANTS_BY_SOURCE = {
  Aeldari: {
    'WAR WALKER': 'MARCHEURS DE GUERRE',
    VYPERS: 'VYPER'
  },
  'Death Guard': {
    'MYPHITIC BLIGHT-HAULER': 'SEMI-CHENILLÉS MÉPHITIQUES'
  }
};

function titleEntries(document) {
  const titlesByStreamId = new Map(
    [...document.querySelectorAll('div[hidden][id^="S:"]')]
      .map((node) => [node.id, node.querySelector('.text-xl')?.textContent?.trim()])
      .filter((entry) => Boolean(entry[1]))
  );
  const titles = [];
  for (const script of document.querySelectorAll('script')) {
    for (const match of script.textContent?.matchAll(/\$RS\("(S:[^"]+)","P:[^"]+"\)/g) ?? []) {
      const title = titlesByStreamId.get(match[1]);
      if (title) titles.push(title);
    }
  }
  return titles;
}

export function pairMfmTitles(englishTitles, frenchTitles, sourceKey) {
  if (englishTitles.length !== frenchTitles.length) {
    throw new Error(`${sourceKey}: les pages MFM EN/FR n'ont pas le même nombre de titres d'unités (${englishTitles.length}/${frenchTitles.length}).`);
  }
  const translations = new Map();
  const ambiguous = new Set();
  englishTitles.forEach((englishTitle, index) => {
    const frenchTitle = frenchTitles[index];
    const previous = translations.get(englishTitle);
    if (previous && previous !== frenchTitle) ambiguous.add(englishTitle);
    else translations.set(englishTitle, frenchTitle);
  });
  ambiguous.forEach((name) => translations.delete(name));
  return { translations, ambiguous: [...ambiguous].sort((left, right) => left.localeCompare(right, 'en')) };
}

async function fetchMfmTitles(locale, slug) {
  const response = await fetch(`${MFM_ROOT}/${locale}/${slug}`);
  if (!response.ok) throw new Error(`${slug}: MFM ${locale.toUpperCase()} indisponible (${response.status}).`);
  return titleEntries(new JSDOM(await response.text()).window.document);
}

async function readBooks() {
  const fileNames = (await readdir(unitsDirectory))
    .filter((fileName) => fileName.endsWith('.json') && !['DataInfo.json', 'FactionInfoData.json'].includes(fileName))
    .sort((left, right) => left.localeCompare(right, 'en'));
  return Promise.all(fileNames.map(async (fileName) => {
    const book = JSON.parse((await readFile(resolve(unitsDirectory, fileName), 'utf8')).replace(/^\uFEFF/, ''));
    const sourceKey = fileName.replace(/\.json$/u, '');
    const slug = MFM_SLUG_BY_SOURCE[book.Name];
    if (!slug) throw new Error(`${sourceKey}: aucune page MFM n'est configurée pour ${book.Name ?? 'cette source'}.`);
    return { sourceKey, factionName: book.Name, slug, units: book.Units ?? [] };
  }));
}

function sourceUnitKey(sourceKey, sourceIndex) {
  return `${sourceKey}::${sourceIndex}`;
}

export async function collectMfmUnitTranslations() {
  const books = await readBooks();
  const slugs = [...new Set(books.map((book) => book.slug))];
  const titlePairs = new Map(await Promise.all(slugs.map(async (slug) => {
    const [englishTitles, frenchTitles] = await Promise.all([fetchMfmTitles('en', slug), fetchMfmTitles('fr', slug)]);
    return [slug, pairMfmTitles(englishTitles, frenchTitles, slug)];
  })));

  const units = {};
  const unmatched = [];
  const ambiguous = [];
  const variants = [];
  let catalogUnitCount = 0;
  for (const book of books) {
    const titles = titlePairs.get(book.slug);
    for (const [sourceIndex, unit] of book.units.entries()) {
      catalogUnitCount += 1;
      const englishName = unit.Name?.trim();
      if (!englishName) {
        unmatched.push({ sourceKey: book.sourceKey, sourceIndex, name: '' });
        continue;
      }
      if (titles.ambiguous.includes(englishName)) {
        ambiguous.push({ sourceKey: book.sourceKey, sourceIndex, name: englishName });
        continue;
      }
      const frenchName = titles.translations.get(englishName)
        ?? MFM_NAME_VARIANTS_BY_SOURCE[book.factionName]?.[englishName];
      if (!frenchName) {
        unmatched.push({ sourceKey: book.sourceKey, sourceIndex, name: englishName });
        continue;
      }
      if (!titles.translations.has(englishName)) {
        variants.push({ sourceKey: book.sourceKey, sourceIndex, name: englishName, frenchName });
      }
      units[sourceUnitKey(book.sourceKey, sourceIndex)] = { name: frenchName };
    }
  }

  return {
    units: Object.fromEntries(Object.entries(units).sort(([left], [right]) => left.localeCompare(right, 'en'))),
    report: {
      schemaVersion: 'warforge-mfm-unit-localization-report/v1',
      source: `${MFM_ROOT}/fr`,
      retrievedAt: new Date().toISOString().slice(0, 10),
      catalogUnitCount,
      mfmEnglishMatchCount: catalogUnitCount - unmatched.length,
      translatedCount: Object.keys(units).length,
      ambiguous,
      variants,
      unmatched
    }
  };
}

export async function syncMfmUnitTranslations() {
  const [sourceText, result] = await Promise.all([
    readFile(localeSourcePath, 'utf8'),
    collectMfmUnitTranslations()
  ]);
  const source = JSON.parse(sourceText.replace(/^\uFEFF/, ''));
  const nextSource = {
    ...source,
    provenance: {
      ...source.provenance,
      source: `${MFM_ROOT}/fr`,
      version: 'MFM V1.1',
      retrievedAt: result.report.retrievedAt,
      scope: 'Noms d’unités et terminologie structurée publiés par le MFM. Aucun coût du MFM n’est importé ; règles et profils sans source française structurée restent en anglais.'
    },
    units: result.units
  };
  await Promise.all([
    writeFile(localeSourcePath, `${JSON.stringify(nextSource, null, 2)}\n`, 'utf8'),
    writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8')
  ]);
  console.log(`MFM FR synchronisé : ${result.report.translatedCount}/${result.report.catalogUnitCount} traductions, ${result.report.ambiguous.length} ambiguë(s), ${result.report.unmatched.length} non rapprochée(s).`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncMfmUnitTranslations().catch((error) => {
    console.error(`Impossible de synchroniser les noms d'unités MFM : ${error.message}`);
    process.exitCode = 1;
  });
}
