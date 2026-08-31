import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

const appDirectory = resolve(import.meta.dirname, '..');
const referencesDirectory = resolve(appDirectory, '../references');
const defaultDataDirectory = resolve(import.meta.dirname, '../data/simulator');
const defaultPublicDirectory = resolve(import.meta.dirname, '../public/data/simulator');
const coreRulesPath = resolve(import.meta.dirname, '../data/rules/core-rules-fr.json');
const officialAppFaqPath = resolve(import.meta.dirname, '../data/rules/official-app-faq-fr-2026-07.json');
const officialAppReferencesPath = resolve(import.meta.dirname, '../data/rules/official-app-references-fr-2026-07.json');
const officialAppErrataPath = resolve(import.meta.dirname, '../data/rules/official-app-errata-fr-2026-07.json');
const officialAppSupplementalRulesPath = resolve(import.meta.dirname, '../data/rules/official-app-supplemental-rules-fr-2026-08.json');

const COVER_RULE_ID = 'core.benefit-of-cover';
const COVER_SOURCE_ID = 'warforge-core-rules-fr-2026-07';
const COVER_REFERENCE = '13.08';
const COVER_PRINTED_PAGE = 50;
const OFFICIAL_APP_FAQ_SOURCE_ID = 'warforge-official-app-faq-fr-2026-07';
const OFFICIAL_APP_FAQ_ARCHIVE_SCHEMA = 'warforge-official-app-faq-screenshot-archive/v1';
const OFFICIAL_APP_FAQ_RESOURCE_SCHEMA = 'warforge-official-app-faq-fr/v1';
const OFFICIAL_APP_REFERENCES_SOURCE_ID = 'warforge-official-app-references-fr-2026-07';
const OFFICIAL_APP_REFERENCES_ARCHIVE_SCHEMA = 'warforge-official-app-reference-screenshot-archive/v1';
const OFFICIAL_APP_REFERENCES_RESOURCE_SCHEMA = 'warforge-official-app-references-fr/v1';
const OFFICIAL_APP_ERRATA_SOURCE_ID = 'warforge-official-app-errata-fr-2026-07';
const OFFICIAL_APP_ERRATA_ARCHIVE_SCHEMA = 'warforge-official-app-errata-screenshot-archive/v1';
const OFFICIAL_APP_ERRATA_RESOURCE_SCHEMA = 'warforge-official-app-errata-fr/v1';
const OFFICIAL_APP_SUPPLEMENTAL_RULES_SOURCE_ID = 'warforge-official-app-supplemental-rules-fr-2026-08';
const OFFICIAL_APP_SUPPLEMENTAL_RULES_RESOURCE_SCHEMA = 'warforge-official-app-supplemental-rules-fr/v1';
const APPROVED_SCENARIO_ID = 'closed-core-shooting-duel-v1';
const APPROVED_PROFILE_ID = 'training-infantry-32mm-v1';
const APPROVED_CONVENTION_ID = 'closed-core-infantry-geometry-v1';
const APPROVED_WEAPON_ID = 'closed-core-training-rifle-v1';
const APPROVED_FIXTURE_IDS = ['closed-core-red-unit-v1', 'closed-core-blue-unit-v1'];
const M4_DRAFT_FILENAME = 'm4-real-roster-facts.json';
const M4_DRAFT_SCHEMA = 'warforge-simulator-m4-real-roster-facts/v2';
const M4_SCENARIO_ID = 'real-roster-shooting-duel-v1';
const FULL_GAME_COVERAGE_SCHEMA = 'warforge-simulator-full-game-coverage/v1';
const FULL_GAME_SCOPE = 'closed-complete-game-pilot-v1';
const CORE_POC_COVERAGE_SCHEMA = 'warforge-simulator-core-poc-coverage/v1';
const CORE_POC_SCOPE = 'closed-complete-game-core-poc-v1';
const CORE_POC_LAYOUT_SCHEMA = 'warforge-simulator-core-poc-layout/v1';
const CORE_POC_LAYOUT_ID = 'disruption-mirror-1-core-poc-v1';
const CORE_POC_FIXTURES_SCHEMA = 'warforge-simulator-core-poc-fixtures/v1';
const CORE_POC_FIXTURE_SOURCE_ID = 'warforge-core-poc-fixtures-v1';
const CORE_POC_PHYSICAL_CONVENTION_ID = 'closed-core-poc-infantry-geometry-v1';
const CLOSED_MISSION_FILENAME = 'closed-complete-game-mission.json';
const CLOSED_MISSION_SCHEMA = 'warforge-simulator-closed-mission/v1';
const CLOSED_MISSION_ID = 'closed-complete-game-disruption-v1';
const APPROVED_GDM_SOURCE_ID = 'approved-gdm-2026-11th-archive';
const APPROVED_GDM_ARCHIVE_SCHEMA = 'warforge-gdmissions-11th/v1';
const APPROVED_GDM_ARCHIVE_SHA256 = 'a8320287a3fbdde6fb126dee241374110a086383fd2b1cd5012e5a09bb3ccc71';
const APPROVED_GDM_LAYOUT_SOURCE_ID = 'approved-gdm-2026-layout-images';
const APPROVED_GDM_LAYOUT_INVENTORY_SCHEMA = 'warforge-layout-source-inventory/v1';
const APPROVED_GDM_LAYOUT_MEASUREMENTS_SCHEMA = 'warforge-layout-measurements/v1';
const APPROVED_GDM_LAYOUT_SOURCE_SHA256 = 'eb14ab96304ee6db152995f8704f5f1c80e73e432e2aa0e7989aacf4eb859c45';
const APPROVED_GDM_LAYOUT_CANDIDATES_SHA256 = 'de466f2776d12e86e4ed5403d929a83cb2a90b04f52ddf62374e518de8a7bf22';
const APPROVED_GDM_LAYOUT_REVIEW_QUEUE_SHA256 = '7d73597fec69bce974034e9c63b4c82431b7e0eb6decd51394e18774bd916849';
const APPROVED_GDM_LAYOUT_REVIEW_DECISIONS_SHA256 = 'b33ffe81302d1356008d1f6e0a58f850ce050761b2e8617bf2fb3b7345121cd3';
const APPROVED_GDM_LAYOUT_MEASUREMENTS_SHA256 = '4a84d1e7ff40cbb2c40b9184e53af239df1d96bdaa845c8f0ed1a024ef1f15cf';
const GDM_LAYOUT_CANDIDATES_PATH = resolve(appDirectory, 'data/missions/gdmissions-11th/layout-measurements/extraction-candidates.json');
const GDM_LAYOUT_PRE_REVIEW_QUEUE_PATH = resolve(appDirectory, 'data/missions/gdmissions-11th/layout-measurements/review-queue.pre-review.json');
const GDM_LAYOUT_REVIEW_QUEUE_PATH = resolve(appDirectory, 'data/missions/gdmissions-11th/layout-measurements/review-queue.json');
const GDM_LAYOUT_REVIEW_DECISIONS_PATH = resolve(appDirectory, 'data/missions/gdmissions-11th/layout-measurements/review-decisions.json');
const GDM_LAYOUT_COUNT = 45;
const GDM_LAYOUT_CALLOUT_COUNT = 32;
const COMMAND_PHASE_COVERAGE_SOURCE_REFS = [
  {
    sourceId: 'warforge-core-rules-fr-2026-07',
    references: ['01.06', '01.07', '08.01', '08.02', '08.03', '08.04', '08.05', '09.07'],
    printedPages: [9, 30, 31, 33]
  },
  {
    sourceId: 'warforge-official-app-supplemental-rules-fr-2026-08',
    references: ['01.02.01', '01.02.02', '08.03', '08.03.01']
  }
];
const OBJECTIVE_COVERAGE_SOURCE_REFS = [
  {
    sourceId: 'warforge-core-rules-fr-2026-07',
    references: ['13', '14', '14.01', '14.02'],
    printedPages: [44, 52, 53]
  },
  {
    sourceId: 'warforge-official-app-supplemental-rules-fr-2026-08',
    references: ['14.01', '14.01.01']
  },
  {
    sourceId: APPROVED_GDM_SOURCE_ID,
    references: ['/11th/layouts/disruption/disruption#layout-1']
  }
];
const MISSION_COVERAGE_SOURCE_REFS = [
  {
    sourceId: APPROVED_GDM_SOURCE_ID,
    references: [
      '/11th/force-disposition/disruption',
      '/11th/layouts/disruption/disruption#layout-1',
      '/11th/primary-missions/disruption/outmanoeuvre',
      '/11th/secondary-missions/assassination-defender#fixed',
      '/11th/secondary-missions/engage-on-all-fronts-defender#fixed'
    ]
  },
  {
    sourceId: 'warforge-event-companion-fr-2026-07',
    references: ['event-mission-sequence.2', 'event-mission-sequence.3', 'event-mission-sequence.4', 'event-mission-sequence.5', 'event-mission-sequence.6', 'event-mission-sequence.7', 'event-mission-sequence.9', 'event-mission-sequence.13', 'event-mission-sequence.14', 'card-terminology.cumulative-or'],
    printedPages: [2, 3]
  }
];
const STRATAGEM_COVERAGE_SOURCE_REFS = [
  {
    sourceId: 'warforge-core-rules-fr-2026-07',
    references: ['15.01', '15.04', '15.12'],
    printedPages: [54, 56, 57]
  },
  {
    sourceId: 'warforge-universal-rules-updates-en-2026-07',
    references: ['stratagem-updates']
  },
  {
    sourceId: 'warforge-official-app-supplemental-rules-fr-2026-08',
    references: ['15.01', '15.01.01']
  }
];
const M4_PROPOSAL_PATH = resolve(appDirectory, 'docs/simulator/roster-pilots/real-roster-shooting-duel-v1.proposal.json');
const M4_CATALOG_DIRECTORY = resolve(appDirectory, 'data/units');
const PISTOL_REFERENCE = '24.27';
const PISTOL_PRINTED_PAGE = 84;
const PISTOL_FORMALIZED_CONSTRAINT = "[PISTOLET] est fonctionnellement identique à [COMBAT RAPPROCHÉ] pour l'éligibilité et le choix des armes en tir engagé.";
const PISTOL_M4_DISPOSITION = "Le scénario empêche toute fin de mouvement en Engagement Range ; le garde [PISTOLET] est exécuté avant toute résolution de tir M4.";
const M4_PHYSICAL_CONVENTION_STATEMENT = 'Convention locale limitée au pilote M4 : diamètre du socle repris du catalogue actif et hauteur conventionnelle approuvée par le propriétaire le 2026-08-21. Ces valeurs ne constituent pas des dimensions officielles et ne couvrent aucune session M4 avant T07 et T04.';
const M4_HUMAN_REVIEW = {
  scope: M4_SCENARIO_ID,
  reviewedBy: 'project-owner',
  reviewedAt: '2026-08-21'
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATALOG_IDENTITY_KEYS = new Set([
  'unitid',
  'supportedunitid',
  'catalogunitid',
  'catalogid',
  'sourcekey',
  'databasefingerprint'
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(dataDirectory, name) {
  const raw = await readFile(resolve(dataDirectory, name), 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name}: JSON invalide (${error.message})`);
  }
}

function assertNoCatalogIdentity(value, label, path = '', allowedPaths = new Set()) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path ? `${path}.${key}` : key;
    assert(!CATALOG_IDENTITY_KEYS.has(key.toLowerCase()) || allowedPaths.has(nestedPath), `${label}: identité catalogue interdite (${nestedPath})`);
    assertNoCatalogIdentity(nested, label, nestedPath, allowedPaths);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: objet requis`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label}: clés exactes requises (${expected.join(', ')})`);
}

function assertExactKeysAbsent(value, forbiddenPattern, label) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert(!forbiddenPattern.test(key), `${label}: champ interdit ${key}`);
    assertExactKeysAbsent(nested, forbiddenPattern, label);
  }
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const left = polygon[index];
    const right = polygon[previous];
    const crosses = (left.y > point.y) !== (right.y > point.y)
      && point.x < ((right.x - left.x) * (point.y - left.y)) / (right.y - left.y) + left.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

async function assertOfficialCoverSource() {
  const coreRules = JSON.parse(await readFile(coreRulesPath, 'utf8'));
  const pages = coreRules.chapters
    .flatMap((chapter) => chapter.sections ?? [])
    .flatMap((section) => section.pages ?? []);
  const printedPage = pages.find((page) => page.printedPage === COVER_PRINTED_PAGE);
  const sourceText = printedPage?.blocks?.map((block) => block.text ?? '').join('\n') ?? '';
  assert(sourceText.includes(`BÉNÉFICE DUCOUVERT ${COVER_REFERENCE}`), `source officielle: référence ${COVER_REFERENCE} absente de la page ${COVER_PRINTED_PAGE}`);
  assert(sourceText.includes('dégradez de 1 la caractéristique de CT'), 'source officielle: effet de couvert attendu absent');
}

async function assertOfficialPdfSource(source) {
  assert(!isAbsolute(source.path ?? ''), `source ${source.id}: chemin PDF relatif requis`);
  const declaredPath = resolve(appDirectory, source.path ?? '');
  let canonicalReferencesDirectory;
  let canonicalSourcePath;
  try {
    [canonicalReferencesDirectory, canonicalSourcePath] = await Promise.all([
      realpath(referencesDirectory),
      realpath(declaredPath)
    ]);
  } catch {
    throw new Error(`source ${source.id}: PDF local introuvable`);
  }
  const referencesPrefix = `${canonicalReferencesDirectory.toLowerCase()}${sep}`;
  assert(canonicalSourcePath.toLowerCase().startsWith(referencesPrefix), `source ${source.id}: PDF hors du répertoire references`);
  const actualHash = createHash('sha256').update(await readFile(canonicalSourcePath)).digest('hex');
  assert(actualHash === source.sha256, `source ${source.id}: sha256 ne correspond pas au PDF local`);
}

async function assertOfficialAppScreenshotArchiveSource(source, { archiveSchema, expectedScreenshotCount }) {
  assert(!isAbsolute(source.path ?? ''), `source ${source.id}: chemin d'archive relatif requis`);
  const declaredPath = resolve(appDirectory, source.path ?? '');
  let canonicalReferencesDirectory;
  let canonicalArchivePath;
  try {
    [canonicalReferencesDirectory, canonicalArchivePath] = await Promise.all([
      realpath(referencesDirectory),
      realpath(declaredPath)
    ]);
  } catch {
    throw new Error(`source ${source.id}: archive locale introuvable`);
  }
  const referencesPrefix = `${canonicalReferencesDirectory.toLowerCase()}${sep}`;
  assert(canonicalArchivePath.toLowerCase().startsWith(referencesPrefix), `source ${source.id}: archive hors du répertoire references`);
  const archiveRaw = await readFile(canonicalArchivePath);
  const archiveHash = createHash('sha256').update(archiveRaw).digest('hex');
  assert(archiveHash === source.sha256, `source ${source.id}: sha256 ne correspond pas à l'archive locale`);
  const archive = JSON.parse(archiveRaw.toString('utf8'));
  assert(archive.schemaVersion === archiveSchema, `source ${source.id}: schéma d'archive incompatible`);
  assert(archive.id === source.id && archive.authority === 'official-app' && archive.locale === 'fr-FR', `source ${source.id}: provenance de l'application officielle invalide`);
  assert(archive.visibleLastUpdated === '2026-07-22' && archive.capturedAt === source.retrievedAt, `source ${source.id}: dates d'archive incohérentes`);
  assert(Array.isArray(archive.screenshots) && archive.screenshots.length === expectedScreenshotCount, `source ${source.id}: ${expectedScreenshotCount} captures horodatées requises`);
  const screenshotIds = archive.screenshots.map((screenshot) => screenshot.id);
  uniqueStrings(screenshotIds, `source ${source.id}.screenshots`);
  const archiveDirectory = resolve(canonicalArchivePath, '..');
  for (const screenshot of archive.screenshots) {
    assert(typeof screenshot.file === 'string' && !screenshot.file.includes('/') && !screenshot.file.includes('\\'), `source ${source.id}: nom de capture invalide`);
    assert(typeof screenshot.driveFileId === 'string' && screenshot.driveFileId.length > 0, `source ${source.id}: identifiant Drive requis`);
    assert(Number.isInteger(screenshot.bytes) && screenshot.bytes > 0 && /^[a-f0-9]{64}$/.test(screenshot.sha256 ?? ''), `source ${source.id}: métadonnées de capture invalides`);
    const screenshotPath = resolve(archiveDirectory, screenshot.file);
    const canonicalScreenshotPath = await realpath(screenshotPath).catch(() => null);
    assert(canonicalScreenshotPath && canonicalScreenshotPath.toLowerCase().startsWith(`${archiveDirectory.toLowerCase()}${sep}`), `source ${source.id}: capture locale introuvable ou hors archive`);
    const screenshotRaw = await readFile(canonicalScreenshotPath);
    assert(screenshotRaw.length === screenshot.bytes, `source ${source.id}: taille incohérente pour ${screenshot.id}`);
    assert(createHash('sha256').update(screenshotRaw).digest('hex') === screenshot.sha256, `source ${source.id}: sha256 incohérent pour ${screenshot.id}`);
  }
  return { archive, screenshotIds: new Set(screenshotIds) };
}

function parseOfficialAppSupplementalSections(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headingPattern = /^(\d{2}\.\d{2}(?:\.\d{2})?)(?:\s+-\s+(.+))?\s*$/;
  const headings = lines.flatMap((line, index) => {
    const match = line.trim().match(headingPattern);
    return match ? [{ index, id: match[1], inlineTitle: match[2] ?? null }] : [];
  });
  return headings.map((heading, index) => {
    const nextIndex = headings[index + 1]?.index ?? lines.length;
    const bodyLines = lines.slice(heading.index + 1, nextIndex);
    while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
    while (bodyLines.length > 0 && bodyLines.at(-1).trim() === '') bodyLines.pop();
    let title = heading.inlineTitle;
    if (title === null) {
      const titleIndex = bodyLines.findIndex((line) => line.trim() !== '');
      if (titleIndex >= 0) {
        title = bodyLines[titleIndex].trim();
        bodyLines.splice(titleIndex, 1);
        while (bodyLines.length > 0 && bodyLines[0].trim() === '') bodyLines.shift();
      }
    }
    return {
      id: heading.id,
      title: title ?? heading.id,
      sourceLineStart: heading.index + 1,
      sourceLineEnd: nextIndex,
      text: bodyLines.join('\n').trim()
    };
  });
}

async function assertOfficialAppOwnerTranscriptionSource(source) {
  assert(!isAbsolute(source.path ?? ''), `source ${source.id}: chemin de transcription relatif requis`);
  const declaredPath = resolve(appDirectory, source.path ?? '');
  let canonicalReferencesDirectory;
  let canonicalSourcePath;
  try {
    [canonicalReferencesDirectory, canonicalSourcePath] = await Promise.all([
      realpath(referencesDirectory),
      realpath(declaredPath)
    ]);
  } catch {
    throw new Error(`source ${source.id}: transcription locale introuvable`);
  }
  assert(canonicalSourcePath.toLowerCase().startsWith(`${canonicalReferencesDirectory.toLowerCase()}${sep}`), `source ${source.id}: transcription hors du répertoire references`);
  const raw = await readFile(canonicalSourcePath);
  const hash = createHash('sha256').update(raw).digest('hex');
  assert(hash === source.sha256, `source ${source.id}: sha256 ne correspond pas à la transcription locale`);
  const resource = JSON.parse(await readFile(officialAppSupplementalRulesPath, 'utf8'));
  assert(resource.schemaVersion === OFFICIAL_APP_SUPPLEMENTAL_RULES_RESOURCE_SCHEMA, 'Règles supplémentaires application officielle: schéma incompatible');
  assert(resource.id === source.id && resource.status === 'reference-only' && resource.authority === 'official-app-owner-transcription', 'Règles supplémentaires application officielle: provenance invalide');
  assert(resource.version === source.version && resource.transcribedAt === source.retrievedAt && resource.reviewedBy === source.reviewedBy, 'Règles supplémentaires application officielle: version ou revue incohérente');
  assert(resource.sourceFile?.path === '../../../references/warhammer-40k/rules/app-transcriptions/official-app-2026-08-28/app_only_rules.txt'
    && resource.sourceFile?.driveFileId === source.driveFileId
    && resource.sourceFile?.sha256 === source.sha256
    && resource.sourceFile?.normalizedLocalBytes === raw.length, 'Règles supplémentaires application officielle: fichier source incohérent');
  const parsedSections = parseOfficialAppSupplementalSections(raw.toString('utf8'));
  assert(parsedSections.length === 40, 'Règles supplémentaires application officielle: 40 sections numérotées requises');
  uniqueStrings(parsedSections.map((section) => section.id), 'Règles supplémentaires application officielle.sections');
  assertSameJson(resource.sections, parsedSections, 'Règles supplémentaires application officielle.sections');
  assertSameJson(resource.simulatorReadiness, {
    executableNow: [],
    indexedSectionIds: parsedSections.map((section) => section.id),
    activationPolicy: 'reference-only-until-formalized-and-tested'
  }, 'Règles supplémentaires application officielle.simulatorReadiness');
}

async function assertApprovedGdmMissionArchiveSource(source) {
  assert(source.id === APPROVED_GDM_SOURCE_ID && source.kind === 'trusted-mission-archive', 'manifest.json: archive GDM approuvée requise');
  assert(source.authority === 'project-owner-approved' && source.status === 'project-approved', `source ${source.id}: autorité propriétaire requise`);
  assert(source.version === 'archive-2026-08-08' && source.effectiveDate === null && source.retrievedAt === '2026-08-08', `source ${source.id}: version ou date d'archive incohérente`);
  assert(source.reviewedBy === 'project-owner' && source.reviewedAt === '2026-08-30' && source.decisionReference === 'ADR-019', `source ${source.id}: approbation propriétaire incomplète`);
  assert(source.officialGwPublication === false, `source ${source.id}: l'archive GDM ne doit pas être présentée comme officielle GW`);
  assert(source.url === 'https://gdmissions.app/11th' && source.sha256 === APPROVED_GDM_ARCHIVE_SHA256, `source ${source.id}: URL ou empreinte déclarée incohérente`);
  assert(!isAbsolute(source.path ?? ''), `source ${source.id}: chemin d'archive relatif requis`);
  const declaredPath = resolve(appDirectory, source.path ?? '');
  const missionsDirectory = await realpath(resolve(appDirectory, 'data/missions'));
  const archivePath = await realpath(declaredPath).catch(() => null);
  assert(archivePath && archivePath.toLowerCase().startsWith(`${missionsDirectory.toLowerCase()}${sep}`), `source ${source.id}: archive locale introuvable ou hors data/missions`);
  const raw = await readFile(archivePath);
  assert(createHash('sha256').update(raw).digest('hex') === source.sha256, `source ${source.id}: sha256 ne correspond pas à l'archive locale`);
  const archive = JSON.parse(raw.toString('utf8'));
  assert(archive.schemaVersion === APPROVED_GDM_ARCHIVE_SCHEMA, `source ${source.id}: schéma d'archive incompatible`);
  assert(archive.source?.baseUrl === source.url && archive.source?.retrievedAt?.startsWith(`${source.retrievedAt}T`), `source ${source.id}: provenance d'archive incohérente`);
  assert(Array.isArray(archive.pages) && archive.pages.length === 93 && Array.isArray(archive.assets) && archive.assets.length === 149, `source ${source.id}: archive GDM incomplète`);
  return { archive, archiveDirectory: resolve(archivePath, '..') };
}

async function assertApprovedGdmLayoutImageSource(source) {
  assertExactKeys(source, [
    'id', 'kind', 'authority', 'title', 'version', 'effectiveDate', 'retrievedAt',
    'status', 'path', 'url', 'sha256', 'extractionCandidatesSha256',
    'reviewQueueSha256', 'reviewDecisionsSha256', 'measurementArtifactSha256',
    'reviewedBy', 'reviewedAt',
    'decisionReference', 'officialGwPublication', 'expectedImageCount'
  ], `source ${APPROVED_GDM_LAYOUT_SOURCE_ID}`);
  assert(source.id === APPROVED_GDM_LAYOUT_SOURCE_ID && source.kind === 'trusted-layout-image-archive', 'manifest.json: archive d’images de layouts GDM approuvée requise');
  assert(source.authority === 'project-owner-approved' && source.status === 'project-approved', `source ${source.id}: autorité propriétaire requise`);
  assert(source.version === 'drive-snapshot-2026-08-30' && source.effectiveDate === null && source.retrievedAt === '2026-08-30', `source ${source.id}: version ou date de snapshot incohérente`);
  assert(source.reviewedBy === 'project-owner' && source.reviewedAt === '2026-08-30' && source.decisionReference === 'ADR-020', `source ${source.id}: approbation propriétaire incomplète`);
  assert(source.officialGwPublication === false, `source ${source.id}: les images GDM ne doivent pas être présentées comme une publication officielle GW`);
  assert(source.url === 'https://drive.google.com/drive/folders/1clE0hvtnbtTN2xGdcR9scyrLcKQiMI0Z'
    && source.sha256 === APPROVED_GDM_LAYOUT_SOURCE_SHA256
    && source.extractionCandidatesSha256 === APPROVED_GDM_LAYOUT_CANDIDATES_SHA256
    && source.reviewQueueSha256 === APPROVED_GDM_LAYOUT_REVIEW_QUEUE_SHA256
    && source.reviewDecisionsSha256 === APPROVED_GDM_LAYOUT_REVIEW_DECISIONS_SHA256
    && source.measurementArtifactSha256 === APPROVED_GDM_LAYOUT_MEASUREMENTS_SHA256
    && source.expectedImageCount === GDM_LAYOUT_COUNT,
  `source ${source.id}: URL, empreinte ou cardinalité incohérente`);
  assert(!isAbsolute(source.path ?? ''), `source ${source.id}: chemin d’inventaire relatif requis`);

  const missionsDirectory = await realpath(resolve(appDirectory, 'data/missions'));
  const inventoryPath = await realpath(resolve(appDirectory, source.path ?? '')).catch(() => null);
  assert(inventoryPath && inventoryPath.toLowerCase().startsWith(`${missionsDirectory.toLowerCase()}${sep}`), `source ${source.id}: inventaire local introuvable ou hors data/missions`);
  const raw = await readFile(inventoryPath);
  assert(createHash('sha256').update(raw).digest('hex') === source.sha256, `source ${source.id}: sha256 ne correspond pas à l’inventaire local`);
  const inventory = JSON.parse(raw.toString('utf8'));
  assert(inventory.schemaVersion === APPROVED_GDM_LAYOUT_INVENTORY_SCHEMA, `source ${source.id}: schéma d’inventaire incompatible`);
  assertSameJson(inventory.source, {
    sourceId: APPROVED_GDM_LAYOUT_SOURCE_ID,
    title: 'GDM 2026 — 45 terrain layouts with displayed measurements',
    authority: 'project-approved',
    approvedBy: 'project-owner',
    approvedAt: '2026-08-30',
    folderId: '1clE0hvtnbtTN2xGdcR9scyrLcKQiMI0Z',
    folderUrl: source.url
  }, `source ${source.id}: provenance d’inventaire`);
  assert(inventory.expectedFileCount === GDM_LAYOUT_COUNT && Array.isArray(inventory.files) && inventory.files.length === GDM_LAYOUT_COUNT, `source ${source.id}: 45 images inventoriées requises`);
  uniqueStrings(inventory.files.map((entry) => entry.fileName), `${source.id}.files.fileName`);
  uniqueStrings(inventory.files.map((entry) => entry.driveFileId), `${source.id}.files.driveFileId`);
  assertSameJson(inventory.files.map((entry) => entry.fileName), [...inventory.files.map((entry) => entry.fileName)].sort(), `source ${source.id}: ordre stable des fichiers`);

  const inventoryByFileName = new Map();
  for (const entry of inventory.files) {
    assertExactKeys(entry, [
      'fileName', 'driveFileId', 'driveUrl', 'mimeType', 'upstreamSizeBytes',
      'upstreamSha256', 'widthPx', 'heightPx', 'localMeasuredPath',
      'localMeasuredSha256', 'localPlainPath', 'localPlainSha256'
    ], `${source.id}.${entry.fileName}`);
    assert(entry.fileName.endsWith('.png') && entry.mimeType === 'image/png', `${source.id}.${entry.fileName}: image PNG requise`);
    assert(entry.driveUrl === `https://drive.google.com/file/d/${entry.driveFileId}/view?usp=drivesdk`, `${source.id}.${entry.fileName}: URL Drive incohérente`);
    assert(Number.isInteger(entry.upstreamSizeBytes) && entry.upstreamSizeBytes > 0
      && Number.isInteger(entry.widthPx) && entry.widthPx > 0
      && Number.isInteger(entry.heightPx) && entry.heightPx > 0,
    `${source.id}.${entry.fileName}: métadonnées d’image invalides`);
    for (const [pathKey, hashKey] of [
      ['localMeasuredPath', 'localMeasuredSha256'],
      ['localPlainPath', 'localPlainSha256']
    ]) {
      assert(!isAbsolute(entry[pathKey]) && /^[a-f0-9]{64}$/.test(entry[hashKey] ?? ''), `${source.id}.${entry.fileName}: chemin ou sha256 local invalide`);
      const imagePath = await realpath(resolve(appDirectory, entry[pathKey])).catch(() => null);
      assert(imagePath && imagePath.toLowerCase().startsWith(`${missionsDirectory.toLowerCase()}${sep}`), `${source.id}.${entry.fileName}: image locale introuvable ou hors data/missions`);
      const image = await readFile(imagePath);
      assert(createHash('sha256').update(image).digest('hex') === entry[hashKey], `${source.id}.${entry.fileName}: sha256 local incohérent`);
    }
    inventoryByFileName.set(entry.fileName, entry);
  }
  return { inventory, inventoryByFileName, source };
}

async function validateGdmLayoutMeasurements(document, manifest, sourceContext, dataDirectory) {
  const measurementArtifactBytes = await readFile(resolve(dataDirectory, manifest.artifacts.gdmLayoutMeasurements));
  assertExactKeys(document, [
    'schemaVersion', 'manifestVersion', 'version', 'source', 'board',
    'expectedLayoutCount', 'expectedCalloutsPerLayout', 'layouts', 'quality'
  ], 'gdm-2026-layout-measurements.json');
  assert(document.schemaVersion === APPROVED_GDM_LAYOUT_MEASUREMENTS_SCHEMA
    && document.manifestVersion === manifest.version && document.version === '1.0.0',
  'gdm-2026-layout-measurements.json: schéma ou version incompatible');
  assertSameJson(document.source, sourceContext.inventory.source, 'gdm-2026-layout-measurements.json.source');
  assertSameJson(document.board, {
    widthTenthsInch: 440,
    heightTenthsInch: 600,
    origin: 'top-left',
    xDirection: 'right',
    yDirection: 'down'
  }, 'gdm-2026-layout-measurements.json.board');
  assert(document.expectedLayoutCount === GDM_LAYOUT_COUNT
    && document.expectedCalloutsPerLayout === GDM_LAYOUT_CALLOUT_COUNT
    && Array.isArray(document.layouts) && document.layouts.length === GDM_LAYOUT_COUNT,
  'gdm-2026-layout-measurements.json: 45 layouts et 32 mesures par layout requis');
  uniqueStrings(document.layouts.map((layout) => layout.layoutId), 'gdm-2026-layout-measurements.json.layouts');
  assertSameJson(document.layouts.map((layout) => layout.layoutId), [...document.layouts.map((layout) => layout.layoutId)].sort(), 'gdm-2026-layout-measurements.json: ordre stable des layouts');
  assertSameJson(document.layouts.map((layout) => `${layout.layoutId}.png`), sourceContext.inventory.files.map((entry) => entry.fileName), 'gdm-2026-layout-measurements.json: couverture exacte de l’inventaire');

  for (const layout of document.layouts) {
    assertExactKeys(layout, [
      'layoutId', 'sourceImage', 'boardRectPx', 'expectedCalloutCount',
      'measurementCount', 'status', 'extractionDiagnostics', 'measurements'
    ], `layout ${layout.layoutId}`);
    const inventoryEntry = sourceContext.inventoryByFileName.get(`${layout.layoutId}.png`);
    assertSameJson(layout.sourceImage, inventoryEntry, `layout ${layout.layoutId}.sourceImage`);
    assertExactKeys(layout.boardRectPx, ['left', 'right', 'top', 'bottom'], `layout ${layout.layoutId}.boardRectPx`);
    const { left, right, top, bottom } = layout.boardRectPx;
    assert([left, right, top, bottom].every(Number.isInteger)
      && left >= 0 && top >= 0 && left < right && top < bottom
      && right <= layout.sourceImage.widthPx && bottom <= layout.sourceImage.heightPx,
    `layout ${layout.layoutId}: rectangle de plateau invalide`);
    assert(layout.expectedCalloutCount === GDM_LAYOUT_CALLOUT_COUNT
      && layout.measurementCount === GDM_LAYOUT_CALLOUT_COUNT
      && layout.status === 'verified'
      && Array.isArray(layout.measurements) && layout.measurements.length === GDM_LAYOUT_CALLOUT_COUNT,
    `layout ${layout.layoutId}: 32 mesures vérifiées requises`);
    assertExactKeys(layout.extractionDiagnostics, ['regionDiagnostics', 'unassignedCandidateIds'], `layout ${layout.layoutId}.extractionDiagnostics`);
    assert(Array.isArray(layout.extractionDiagnostics.regionDiagnostics), `layout ${layout.layoutId}: diagnostics de régions requis`);
    uniqueStrings(layout.extractionDiagnostics.unassignedCandidateIds, `layout ${layout.layoutId}.unassignedCandidateIds`);
    assertSameJson(layout.measurements.map((measurement) => measurement.measurementId),
      Array.from({ length: GDM_LAYOUT_CALLOUT_COUNT }, (_, index) => `m${String(index + 1).padStart(3, '0')}`),
      `layout ${layout.layoutId}: identifiants de mesures stables`);

    for (const item of layout.measurements) {
      assertExactKeys(item, [
        'measurementId', 'sourceCandidateIds', 'printedTenthsOfInch', 'fromEdge',
        'axis', 'coordinateTenthsOfInch', 'worldCoordinate', 'labelCenterPx',
        'valueStatus', 'edgeStatus', 'status', 'evidence'
      ], `layout ${layout.layoutId}.${item.measurementId}`);
      uniqueStrings(item.sourceCandidateIds, `layout ${layout.layoutId}.${item.measurementId}.sourceCandidateIds`);
      assert(Number.isInteger(item.printedTenthsOfInch) && item.printedTenthsOfInch > 0, `layout ${layout.layoutId}.${item.measurementId}: mesure imprimée invalide`);
      assert(['left', 'right', 'top', 'bottom'].includes(item.fromEdge), `layout ${layout.layoutId}.${item.measurementId}: bord invalide`);
      const expectedAxis = item.fromEdge === 'left' || item.fromEdge === 'right' ? 'x' : 'y';
      const axisLength = expectedAxis === 'x' ? document.board.widthTenthsInch : document.board.heightTenthsInch;
      const expectedCoordinate = item.fromEdge === 'left' || item.fromEdge === 'top'
        ? item.printedTenthsOfInch
        : axisLength - item.printedTenthsOfInch;
      assert(item.axis === expectedAxis && item.printedTenthsOfInch <= axisLength
        && item.coordinateTenthsOfInch === expectedCoordinate,
      `layout ${layout.layoutId}.${item.measurementId}: conversion bord/axe incohérente`);
      assertSameJson(item.worldCoordinate, {
        numerator: expectedCoordinate * 254,
        denominator: 10,
        roundedWorldUnits: Math.round(expectedCoordinate * 254 / 10)
      }, `layout ${layout.layoutId}.${item.measurementId}.worldCoordinate`);
      assert(Number.isFinite(item.labelCenterPx?.x) && Number.isFinite(item.labelCenterPx?.y)
        && item.labelCenterPx.x >= 0 && item.labelCenterPx.x <= layout.sourceImage.widthPx
        && item.labelCenterPx.y >= 0 && item.labelCenterPx.y <= layout.sourceImage.heightPx,
      `layout ${layout.layoutId}.${item.measurementId}: centre de libellé invalide`);
      assert(item.valueStatus === 'verified' && item.edgeStatus === 'verified' && item.status === 'verified', `layout ${layout.layoutId}.${item.measurementId}: revue incomplète`);
      assertExactKeys(item.evidence, [
        'passIds', 'engineFamilies', 'printedTextCandidates', 'edgeSource',
        'templateArrow', 'geometry', 'qualityScore', 'labelRegion', 'reviewDecision'
      ], `layout ${layout.layoutId}.${item.measurementId}.evidence`);
      assert(typeof item.evidence.labelRegion?.regionId === 'string' && item.evidence.labelRegion.regionId.length > 0,
        `layout ${layout.layoutId}.${item.measurementId}: région de preuve absente`);
      if (item.sourceCandidateIds.length === 0 || item.evidence.labelRegion.kind === 'direct-visual-review') {
        assert(item.evidence.edgeSource === 'direct-visual-review'
          && ['confirm', 'replace'].includes(item.evidence.reviewDecision?.action),
        `layout ${layout.layoutId}.${item.measurementId}: lecture visuelle non tracée`);
      } else {
        assert(item.sourceCandidateIds.length > 0 && item.evidence.passIds.length > 0,
          `layout ${layout.layoutId}.${item.measurementId}: preuve machine ou visuelle requise`);
      }
    }
  }
  assertSameJson(document.quality, {
    verifiedLayoutCount: GDM_LAYOUT_COUNT,
    reviewRequiredLayoutCount: 0,
    reviewItemCount: 0
  }, 'gdm-2026-layout-measurements.json.quality');

  const [candidatesBytes, preReviewQueueBytes, reviewQueue, reviewDecisionsBytes] = await Promise.all([
    readFile(GDM_LAYOUT_CANDIDATES_PATH),
    readFile(GDM_LAYOUT_PRE_REVIEW_QUEUE_PATH),
    readFile(GDM_LAYOUT_REVIEW_QUEUE_PATH, 'utf8').then(JSON.parse),
    readFile(GDM_LAYOUT_REVIEW_DECISIONS_PATH)
  ]);
  assert(createHash('sha256').update(candidatesBytes).digest('hex') === sourceContext.source.extractionCandidatesSha256,
    'candidats d’extraction des layouts GDM: empreinte incompatible');
  assert(createHash('sha256').update(preReviewQueueBytes).digest('hex') === sourceContext.source.reviewQueueSha256,
    'file de pré-revue des layouts GDM: empreinte incompatible');
  assert(createHash('sha256').update(reviewDecisionsBytes).digest('hex') === sourceContext.source.reviewDecisionsSha256,
    'décisions de revue des layouts GDM: empreinte incompatible');
  const preReviewQueue = JSON.parse(preReviewQueueBytes.toString('utf8'));
  const reviewDecisions = JSON.parse(reviewDecisionsBytes.toString('utf8'));
  assertSameJson(reviewQueue, {
    schemaVersion: 'warforge-layout-measurement-review/v1',
    sourceId: APPROVED_GDM_LAYOUT_SOURCE_ID,
    items: []
  }, 'file de revue des layouts GDM');
  assert(reviewDecisions.schemaVersion === 'warforge-layout-measurement-decisions/v1'
    && reviewDecisions.sourceId === APPROVED_GDM_LAYOUT_SOURCE_ID
    && reviewDecisions.review?.reviewedAt === '2026-08-31'
    && reviewDecisions.review?.reviewer === 'gpt-5.6-sol/direct-visual-review'
    && reviewDecisions.review?.reviewedItemCount === 119
    && reviewDecisions.review?.reviewedQueueSha256 === sourceContext.source.reviewQueueSha256
    && reviewDecisions.defaultAction === 'confirm-current-reading'
    && Array.isArray(reviewDecisions.decisions) && reviewDecisions.decisions.length > 0,
  'décisions de revue visuelle des layouts GDM incomplètes');
  assert(preReviewQueue.schemaVersion === 'warforge-layout-measurement-review/v1'
    && preReviewQueue.sourceId === APPROVED_GDM_LAYOUT_SOURCE_ID
    && Array.isArray(preReviewQueue.items) && preReviewQueue.items.length === reviewDecisions.review.reviewedItemCount,
  'file de pré-revue des layouts GDM incohérente avec les décisions');
  const reviewedKeys = new Set(preReviewQueue.items.map((item) => `${item.layoutId}/${item.regionId}`));
  assert(reviewedKeys.size === preReviewQueue.items.length
    && reviewDecisions.decisions.every((decision) => reviewedKeys.has(`${decision.layoutId}/${decision.regionId}`)),
  'décisions de revue visuelle orphelines de la file liée');
  assert(createHash('sha256').update(measurementArtifactBytes).digest('hex') === sourceContext.source.measurementArtifactSha256,
    'gdm-2026-layout-measurements.json: empreinte canonique incompatible');
}

async function assertApprovedGdmAsset(context, assetRef, sourcePath, label) {
  assertExactKeys(assetRef, ['relativePath', 'sha256'], label);
  const archivedAsset = context.archive.assets.find((asset) => asset.sourcePath === sourcePath);
  assert(archivedAsset?.relativePath === assetRef.relativePath && archivedAsset.sha256 === assetRef.sha256, `${label}: ressource ou hash incohérent avec l'archive`);
  const assetPath = await realpath(resolve(context.archiveDirectory, assetRef.relativePath)).catch(() => null);
  assert(assetPath && assetPath.toLowerCase().startsWith(`${context.archiveDirectory.toLowerCase()}${sep}`), `${label}: ressource locale introuvable`);
  const raw = await readFile(assetPath);
  assert(createHash('sha256').update(raw).digest('hex') === assetRef.sha256, `${label}: sha256 ne correspond pas à la ressource locale`);
}

async function validateClosedCompleteGameMission(dataDirectory, manifest, gdmContext) {
  const mission = await readJson(dataDirectory, CLOSED_MISSION_FILENAME);
  assertExactKeys(mission, [
    'schemaVersion', 'version', 'manifestVersion', 'id', 'status', 'approval', 'sourceRefs',
    'forceDisposition', 'layout', 'primaryMission', 'fixedSecondaryMissions',
    'globalScoringLimits', 'executionReadiness'
  ], CLOSED_MISSION_FILENAME);
  assert(mission.schemaVersion === CLOSED_MISSION_SCHEMA && mission.version === '1.0.0', `${CLOSED_MISSION_FILENAME}: schéma ou version incompatible`);
  assert(mission.manifestVersion === manifest.version && mission.id === CLOSED_MISSION_ID && mission.status === 'source-covered', `${CLOSED_MISSION_FILENAME}: identité ou statut incompatible`);
  assertSameJson(mission.approval, {
    authority: 'project-owner-approved-trusted-web',
    reviewedBy: 'project-owner',
    reviewedAt: '2026-08-30',
    decisionReference: 'ADR-019',
    officialGwPublication: false,
    note: "L'archive GDM 2026 est approuvée comme source fiable du projet. Elle ne doit pas être présentée comme une publication officielle Games Workshop."
  }, `${CLOSED_MISSION_FILENAME}.approval`);
  assertSameJson(mission.sourceRefs, [
    { sourceId: APPROVED_GDM_SOURCE_ID, role: 'mission-cards-and-layout', references: MISSION_COVERAGE_SOURCE_REFS[0].references },
    { sourceId: 'warforge-event-companion-fr-2026-07', role: 'general-mission-sequence-and-scoring-limits', references: MISSION_COVERAGE_SOURCE_REFS[1].references, printedPages: [2, 3] }
  ], `${CLOSED_MISSION_FILENAME}.sourceRefs`);

  const disposition = gdmContext.archive.cards?.forceDispositions?.find((entry) => entry.sourcePath === '/11th/force-disposition/disruption');
  assert(disposition?.title === 'Disruption - Force Disposition | GDM 2026' && disposition.asset === '/assets/11th/force-disposition/disruption.png', `${CLOSED_MISSION_FILENAME}: carte de disposition Disruption absente`);
  assert(mission.forceDisposition?.id === 'disruption' && mission.forceDisposition.name === 'Disruption'
    && mission.forceDisposition.sourcePath === disposition.sourcePath && mission.forceDisposition.mirrorPrimaryMissionId === 'outmanoeuvre', `${CLOSED_MISSION_FILENAME}: disposition incorrecte`);
  await assertApprovedGdmAsset(gdmContext, mission.forceDisposition.asset, disposition.asset, `${CLOSED_MISSION_FILENAME}.forceDisposition.asset`);

  const layoutGroup = gdmContext.archive.cards?.layouts?.find((entry) => entry.sourcePath === '/11th/layouts/disruption/disruption');
  const layout = layoutGroup?.layouts?.find((entry) => entry.number === 1);
  assert(layout?.measurementsImage === '/assets/11th/layouts/with-measurements/disruption-mirror-1.png', `${CLOSED_MISSION_FILENAME}: layout Disruption Mirror 1 absent`);
  assert(mission.layout?.id === 'mirror-layout-1' && mission.layout.name === 'Disruption Mirror · 1'
    && mission.layout.sourcePath === layoutGroup.sourcePath && mission.layout.layoutNumber === 1
    && mission.layout.board?.width === 11_176 && mission.layout.board?.height === 15_240 && mission.layout.board?.worldUnit === '0.1mm'
    && mission.layout.attackerEdge === 'top' && mission.layout.defenderEdge === 'bottom', `${CLOSED_MISSION_FILENAME}: contrat du layout incorrect`);
  assertSameJson(mission.layout.objectiveRoles, ['attacker-home', 'defender-home', 'no-mans-land-1', 'no-mans-land-2', 'centre-1', 'centre-2'], `${CLOSED_MISSION_FILENAME}.layout.objectiveRoles`);
  assertSameJson(mission.layout.deterministicGeometry, {
    status: 'compiled-human-reviewed',
    measurementArtifact: 'gdm-2026-layout-measurements.json',
    measurementLayoutId: 'disruption-mirror-1',
    geometryArtifact: 'core-poc-layout.json',
    geometryLayoutId: CORE_POC_LAYOUT_ID,
    requiredFor: 'SIM-M9-T03',
    note: 'Les 32 repères sont liés aux treize baseplates ; objectifs, zones et 28 volumes physiques sont compilés selon la convention propriétaire ADR-023.'
  }, `${CLOSED_MISSION_FILENAME}.layout.deterministicGeometry`);
  await assertApprovedGdmAsset(gdmContext, mission.layout.measuredAsset, layout.measurementsImage, `${CLOSED_MISSION_FILENAME}.layout.measuredAsset`);

  const outmanoeuvre = gdmContext.archive.cards?.primary?.find((entry) => entry.sourcePath === '/11th/primary-missions/disruption/outmanoeuvre');
  assert(outmanoeuvre?.name === 'Outmanoeuvre' && outmanoeuvre.deck === 'disruption' && outmanoeuvre.vs === 'disruption', `${CLOSED_MISSION_FILENAME}: carte Outmanoeuvre absente`);
  assertSameJson(outmanoeuvre.sections.map((section) => ({ when: section.when, trigger: section.trigger, vp: section.tiers?.[0]?.vp, perUnit: section.tiers?.[0]?.perUnit ?? false })), [
    { when: 'ANY BATTLE ROUND', trigger: 'End of your turn', vp: 10, perUnit: false },
    { when: 'FIRST BATTLE ROUND', trigger: 'End of your turn', vp: 4, perUnit: true },
    { when: 'SECOND & THIRD BATTLE ROUND', trigger: 'End of your Command phase', vp: 5, perUnit: true },
    { when: 'FOURTH BATTLE ROUND ONWARDS', trigger: 'End of your turn', vp: 6, perUnit: true }
  ], `${CLOSED_MISSION_FILENAME}: barème source Outmanoeuvre`);
  assert(mission.primaryMission?.id === 'outmanoeuvre' && mission.primaryMission.name === outmanoeuvre.name && mission.primaryMission.sourcePath === outmanoeuvre.sourcePath, `${CLOSED_MISSION_FILENAME}: mission principale incorrecte`);
  assertSameJson(mission.primaryMission.scoringWindows, [
    { id: 'control-opponent-home', battleRounds: [1, 2, 3, 4, 5], checkpoint: 'end-of-own-turn', condition: { kind: 'control-objective', objectiveRole: 'opponent-home' }, award: { kind: 'flat', vp: 10 } },
    { id: 'round-1-non-home-objectives', battleRounds: [1], checkpoint: 'end-of-own-turn', condition: { kind: 'control-each-objective-excluding-own-home' }, award: { kind: 'per-objective', vp: 4 } },
    { id: 'rounds-2-3-non-home-objectives', battleRounds: [2, 3], checkpoint: 'end-of-own-command-phase', condition: { kind: 'control-each-objective-excluding-own-home' }, award: { kind: 'per-objective', vp: 5 } },
    { id: 'rounds-4-5-non-home-objectives', battleRounds: [4, 5], checkpoint: 'end-of-own-turn', condition: { kind: 'control-each-objective-excluding-own-home' }, award: { kind: 'per-objective', vp: 6 } }
  ], `${CLOSED_MISSION_FILENAME}.primaryMission.scoringWindows`);
  await assertApprovedGdmAsset(gdmContext, mission.primaryMission.asset, outmanoeuvre.asset, `${CLOSED_MISSION_FILENAME}.primaryMission.asset`);

  const assassinationSource = gdmContext.archive.cards?.secondary?.find((entry) => entry.sourcePath === '/11th/secondary-missions/assassination-defender');
  const engageSource = gdmContext.archive.cards?.secondary?.find((entry) => entry.sourcePath === '/11th/secondary-missions/engage-on-all-fronts-defender');
  assert(assassinationSource?.sections?.[0]?.chip === 'FIXED'
    && assassinationSource.sections[0].rows?.[0]?.vp === '3' && assassinationSource.sections[0].rows?.[1]?.vp === '+1'
    && assassinationSource.sections[0].rows?.[1]?.cumulative === true, `${CLOSED_MISSION_FILENAME}: branche Fixed d'Assassination incorrecte`);
  assert(engageSource?.sections?.[0]?.chip === 'FIXED'
    && engageSource.sections[0].rows?.[0]?.vp === '2' && engageSource.sections[0].rows?.[1]?.vp === '4'
    && engageSource.whenDrawn?.includes('not within 6" of the centre'), `${CLOSED_MISSION_FILENAME}: branche Fixed d'Engage on All Fronts incorrecte`);
  assert(Array.isArray(mission.fixedSecondaryMissions) && mission.fixedSecondaryMissions.length === 2, `${CLOSED_MISSION_FILENAME}: deux secondaires fixes requis`);
  const assassination = mission.fixedSecondaryMissions[0];
  const engage = mission.fixedSecondaryMissions[1];
  assert(assassination?.id === 'assassination' && assassination.name === assassinationSource.name && assassination.sourcePath === assassinationSource.sourcePath && assassination.checkpoint === 'end-of-each-player-turn', `${CLOSED_MISSION_FILENAME}: Assassination incorrecte`);
  assertSameJson(assassination.conditions, [
    { id: 'destroyed-enemy-character', kind: 'per-enemy-character-model-destroyed-this-turn', vp: 3 },
    { id: 'destroyed-enemy-character-wounds-4-plus', kind: 'cumulative-per-matching-model', woundsCharacteristicAtLeast: 4, vp: 1 }
  ], `${CLOSED_MISSION_FILENAME}.assassination.conditions`);
  await assertApprovedGdmAsset(gdmContext, assassination.asset, assassinationSource.asset, `${CLOSED_MISSION_FILENAME}.assassination.asset`);
  assert(engage?.id === 'engage-on-all-fronts' && engage.name === engageSource.name && engage.sourcePath === engageSource.sourcePath && engage.checkpoint === 'end-of-own-turn', `${CLOSED_MISSION_FILENAME}: Engage on All Fronts incorrecte`);
  assertSameJson(engage.presence, { kind: 'unit-wholly-within-table-quarter', excludedKeywords: ['AIRCRAFT'], excludeBattleShockedUnits: true, minimumDistanceFromBattlefieldCentre: 1_524, boundary: 'not-within' }, `${CLOSED_MISSION_FILENAME}.engage.presence`);
  assertSameJson(engage.conditions, [
    { id: 'presence-three-quarters', kind: 'or-tier', tableQuarterCount: 3, vp: 2 },
    { id: 'presence-four-quarters', kind: 'or-tier', tableQuarterCount: 4, vp: 4 }
  ], `${CLOSED_MISSION_FILENAME}.engage.conditions`);
  await assertApprovedGdmAsset(gdmContext, engage.asset, engageSource.asset, `${CLOSED_MISSION_FILENAME}.engage.asset`);

  assertSameJson(mission.globalScoringLimits, {
    primaryMissionMaximumVp: 45,
    primaryMissionMaximumVpPerBattleRound: 15,
    secondaryMissionsMaximumVp: 45,
    secondaryMissionsMaximumVpPerBattleRound: 15,
    maximumVpPerFixedSecondaryMission: 20,
    battleReadyArmyVp: 10,
    battleEndsAfterRound: 5
  }, `${CLOSED_MISSION_FILENAME}.globalScoringLimits`);
  assertSameJson(mission.executionReadiness, {
    sourceDataCovered: true,
    scoringEngine: 'implemented-SIM-M9-T02',
    deterministicSpatialLayout: 'compiled-human-reviewed',
    playable: false
  }, `${CLOSED_MISSION_FILENAME}.executionReadiness`);
  return mission;
}

async function assertOfficialAppFaqResource(source, archiveScreenshotIds) {
  const resource = JSON.parse(await readFile(officialAppFaqPath, 'utf8'));
  assert(resource.schemaVersion === OFFICIAL_APP_FAQ_RESOURCE_SCHEMA, 'FAQ application officielle: schéma incompatible');
  assert(resource.id === source.id && resource.status === 'reference-only' && resource.authority === 'official-app', 'FAQ application officielle: provenance invalide');
  assert(resource.version === source.version && resource.visibleLastUpdated === '2026-07-22' && resource.capturedAt === source.retrievedAt, 'FAQ application officielle: version ou dates incohérentes');
  assert(resource.sourceArchive?.id === source.id && resource.sourceArchive?.path === '../../../references/warhammer-40k/rules/commentary/official-app-2026-08-24/archive.json', 'FAQ application officielle: archive de provenance incorrecte');
  assert(Array.isArray(resource.entries) && resource.entries.length === 47, 'FAQ application officielle: 47 entrées transcrites requises');
  uniqueStrings(resource.entries.map((entry) => entry.id), 'FAQ application officielle.entries');
  for (const entry of resource.entries) {
    assert(typeof entry.question === 'string' && entry.question.length > 0 && typeof entry.answer === 'string' && entry.answer.length > 0, `FAQ application officielle: texte incomplet pour ${entry.id}`);
    assert(Array.isArray(entry.captureIds) && entry.captureIds.length > 0 && entry.captureIds.every((id) => archiveScreenshotIds.has(id)), `FAQ application officielle: capture inconnue pour ${entry.id}`);
    uniqueStrings(entry.references, `FAQ application officielle.references.${entry.id}`);
    uniqueStrings(entry.topics, `FAQ application officielle.topics.${entry.id}`);
  }
  assert(Array.isArray(resource.simulatorReadiness?.executableNow) && resource.simulatorReadiness.executableNow.length === 0, 'FAQ application officielle: aucune règle ne doit être activée implicitement');
  assert(resource.simulatorReadiness?.knownGapsForM5T02?.length === 3, 'FAQ application officielle: lacunes M5-T02 explicites requises');
}

function uniqueStrings(values, label) {
  assert(Array.isArray(values), `${label}: tableau requis`);
  assert(values.every((value) => typeof value === 'string' && value.length > 0), `${label}: identifiants non vides requis`);
  assert(new Set(values).size === values.length, `${label}: doublon détecté`);
}

function assertSameJson(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label}: valeur incohérente avec la source`);
}

function validateFullGameCoverage(fullGameCoverage, manifest, knownSourceReferencesById = new Map()) {
  assertExactKeys(fullGameCoverage, [
    'schemaVersion',
    'version',
    'manifestVersion',
    'scope',
    'status',
    'activationPolicy',
    'canonicalSourceIds',
    'rosterCandidates',
    'missionCandidate',
    'nodes',
    'gaps',
    'arbitrationIds',
    'readiness'
  ], 'full-game-coverage.json');
  assert(fullGameCoverage.schemaVersion === FULL_GAME_COVERAGE_SCHEMA, 'full-game-coverage.json: schemaVersion incompatible');
  assert(fullGameCoverage.version === '0.8.0' && fullGameCoverage.manifestVersion === manifest.version, 'full-game-coverage.json: version incompatible');
  assert(fullGameCoverage.scope === FULL_GAME_SCOPE && fullGameCoverage.status === 'draft-blocked', 'full-game-coverage.json: le pilote doit rester draft-blocked');
  assert(typeof fullGameCoverage.activationPolicy === 'string' && fullGameCoverage.activationPolicy.length > 0, 'full-game-coverage.json: politique d’activation requise');

  const manifestSourceIds = manifest.sources.map((source) => source.id);
  uniqueStrings(fullGameCoverage.canonicalSourceIds, 'full-game-coverage.canonicalSourceIds');
  for (const sourceId of fullGameCoverage.canonicalSourceIds) {
    assert(manifestSourceIds.includes(sourceId), `full-game-coverage: source canonique orpheline ${sourceId}`);
  }

  assert(Array.isArray(fullGameCoverage.rosterCandidates) && fullGameCoverage.rosterCandidates.length === 2, 'full-game-coverage: deux rosters candidats requis');
  uniqueStrings(fullGameCoverage.rosterCandidates.map((roster) => roster.id), 'full-game-coverage.rosterCandidates');
  const rosterInstanceIds = [];
  for (const roster of fullGameCoverage.rosterCandidates) {
    assert(roster.status === 'human-review-required', `roster ${roster.id}: revue humaine requise`);
    assert(Array.isArray(roster.units) && roster.units.length === 3, `roster ${roster.id}: trois unités candidates requises`);
    uniqueStrings(roster.units.map((unit) => unit.instanceId), `roster ${roster.id}.units`);
    assert(roster.units.every((unit) => typeof unit.unitId === 'string' && unit.unitId.length > 0
      && Number.isInteger(unit.modelCount) && unit.modelCount > 0
      && Number.isInteger(unit.points) && unit.points > 0), `roster ${roster.id}: unités candidates invalides`);
    assert(roster.units.reduce((total, unit) => total + unit.points, 0) === roster.expectedPoints, `roster ${roster.id}: total de points incohérent`);
    assert(roster.attachmentPolicy === 'all-characters-unattached', `roster ${roster.id}: personnages non attachés requis`);
    uniqueStrings(roster.blockingGapIds, `roster ${roster.id}.blockingGapIds`);
    rosterInstanceIds.push(...roster.units.map((unit) => unit.instanceId));
  }
  uniqueStrings(rosterInstanceIds, 'full-game-coverage.rosterInstanceIds');
  assertSameJson(
    fullGameCoverage.rosterCandidates.map(({ id, side, expectedPoints }) => ({ id, side, expectedPoints })),
    [
      { id: 'closed-complete-game-salamanders-v1', side: 'salamanders', expectedPoints: 235 },
      { id: 'closed-complete-game-blood-angels-v1', side: 'blood-angels', expectedPoints: 240 }
    ],
    'full-game-coverage.rosterCandidates'
  );

  const mission = fullGameCoverage.missionCandidate;
  assert(mission?.id === CLOSED_MISSION_ID && mission.status === 'covered', 'full-game-coverage: mission candidate source-covered requise');
  assert(mission.primaryMission === 'Disruption' && mission.deploymentLayout === 'mirror-layout-1', 'full-game-coverage: identifiants de mission candidats incohérents');
  assertSameJson(mission.missionRuleBySide, { salamanders: 'Outmanoeuvre', 'blood-angels': 'Outmanoeuvre' }, 'full-game-coverage.missionCandidate.missionRuleBySide');
  assertSameJson(mission.fixedSecondaryIds, ['Assassination', 'Engage on All Fronts'], 'full-game-coverage.missionCandidate.fixedSecondaryIds');
  uniqueStrings(mission.blockingGapIds, 'full-game-coverage.missionCandidate.blockingGapIds');
  assert(typeof mission.authorityNote === 'string' && mission.authorityNote.length > 0, 'full-game-coverage: note d’autorité de mission requise');

  assert(Array.isArray(fullGameCoverage.nodes) && fullGameCoverage.nodes.length > 0, 'full-game-coverage: nœuds requis');
  assert(Array.isArray(fullGameCoverage.gaps) && fullGameCoverage.gaps.length > 0, 'full-game-coverage: gaps requis');
  const nodeIds = fullGameCoverage.nodes.map((node) => node.id);
  const gapIds = fullGameCoverage.gaps.map((gap) => gap.id);
  uniqueStrings(nodeIds, 'full-game-coverage.nodes');
  uniqueStrings(gapIds, 'full-game-coverage.gaps');
  const requiredNodeIds = [
    'coverage.core-foundations',
    'coverage.battle-round',
    'coverage.command-phase',
    'coverage.movement-phase',
    'coverage.shooting-phase',
    'coverage.charge-phase',
    'coverage.fight-phase',
    'coverage.terrain-objectives',
    'coverage.stratagems',
    'coverage.rosters',
    'coverage.mission',
    'coverage.persistence-v6',
    'coverage.complete-game',
    'coverage.out-of-scope-zones'
  ];
  const requiredGapIds = [
    'GAP-M6-ROSTER-001',
    'GAP-M6-ROSTER-002',
    'GAP-M6-PHYSICAL-001',
    'GAP-M6-DETACHMENT-001',
    'GAP-M6-NONCORE-001',
    'GAP-M6-MISSION-001',
    'GAP-M6-MISSION-002',
    'GAP-M6-MISSION-003',
    'GAP-M6-MISSION-004',
    'GAP-M6-MISSION-005'
  ];
  for (const nodeId of requiredNodeIds) assert(nodeIds.includes(nodeId), `full-game-coverage: nœud obligatoire absent ${nodeId}`);
  for (const gapId of requiredGapIds) assert(gapIds.includes(gapId), `full-game-coverage: gap obligatoire absent ${gapId}`);
  const nodesById = new Map(fullGameCoverage.nodes.map((node) => [node.id, node]));
  const gapsById = new Map(fullGameCoverage.gaps.map((gap) => [gap.id, gap]));
  const allowedNodeStatuses = new Set(['covered', 'partial', 'source-available', 'missing-source', 'human-review-required', 'planned', 'deferred']);
  const allowedGapStatuses = new Set(['open-human-review', 'open-source-request', 'resolved']);

  for (const node of fullGameCoverage.nodes) {
    assert(typeof node.kind === 'string' && node.kind.length > 0 && typeof node.title === 'string' && node.title.length > 0, `nœud ${node.id}: kind et title requis`);
    assert(allowedNodeStatuses.has(node.status), `nœud ${node.id}: statut invalide`);
    uniqueStrings(node.ownerMilestones, `nœud ${node.id}.ownerMilestones`);
    uniqueStrings(node.dependsOn, `nœud ${node.id}.dependsOn`);
    uniqueStrings(node.blockingGapIds, `nœud ${node.id}.blockingGapIds`);
    assert(Array.isArray(node.sourceRefs), `nœud ${node.id}.sourceRefs: tableau requis`);
    for (const dependencyId of node.dependsOn) assert(nodesById.has(dependencyId), `nœud ${node.id}: dépendance orpheline ${dependencyId}`);
    for (const gapId of node.blockingGapIds) assert(gapsById.has(gapId), `nœud ${node.id}: gap orphelin ${gapId}`);
    if (node.status === 'covered') assert(node.blockingGapIds.length === 0, `nœud ${node.id}: un nœud covered ne peut conserver de gap bloquant`);
    for (const sourceRef of node.sourceRefs) {
      assert(fullGameCoverage.canonicalSourceIds.includes(sourceRef.sourceId), `nœud ${node.id}: source non canonique ${sourceRef.sourceId}`);
      uniqueStrings(sourceRef.references, `nœud ${node.id}.sourceRefs.${sourceRef.sourceId}.references`);
      const knownReferences = knownSourceReferencesById.get(sourceRef.sourceId);
      if (knownReferences !== undefined) {
        for (const reference of sourceRef.references) assert(knownReferences.has(reference), `nœud ${node.id}: référence orpheline ${sourceRef.sourceId}#${reference}`);
      }
      if (sourceRef.printedPages !== undefined) {
        assert(Array.isArray(sourceRef.printedPages) && sourceRef.printedPages.length > 0
          && sourceRef.printedPages.every((page) => Number.isInteger(page) && page > 0), `nœud ${node.id}: pages imprimées invalides`);
      }
    }
    assert(typeof node.note === 'string' && node.note.length > 0, `nœud ${node.id}: note requise`);
  }

  const commandPhaseNode = nodesById.get('coverage.command-phase');
  assert(commandPhaseNode.status === 'covered', 'full-game-coverage: coverage.command-phase doit être covered après M8-T01');
  assertSameJson(
    commandPhaseNode.sourceRefs,
    COMMAND_PHASE_COVERAGE_SOURCE_REFS,
    'full-game-coverage: provenance exacte de coverage.command-phase'
  );
  const objectiveNode = nodesById.get('coverage.terrain-objectives');
  assert(objectiveNode.status === 'partial', 'full-game-coverage: coverage.terrain-objectives doit rester partial avant M9');
  assertSameJson(
    objectiveNode.sourceRefs,
    OBJECTIVE_COVERAGE_SOURCE_REFS,
    'full-game-coverage: provenance exacte de coverage.terrain-objectives'
  );
  const missionNode = nodesById.get('coverage.mission');
  assert(missionNode.status === 'covered' && missionNode.blockingGapIds.length === 0, 'full-game-coverage: coverage.mission doit être covered après le moteur ScoreEvent M9-T02');
  assertSameJson(missionNode.sourceRefs, MISSION_COVERAGE_SOURCE_REFS, 'full-game-coverage: provenance exacte de coverage.mission');
  const stratagemNode = nodesById.get('coverage.stratagems');
  assert(stratagemNode.status === 'partial', 'full-game-coverage: coverage.stratagems doit rester partial après les deux verticales M8-T03');
  assertSameJson(
    stratagemNode.dependsOn,
    ['coverage.command-phase', 'coverage.fight-phase'],
    'full-game-coverage: dépendances exactes de coverage.stratagems'
  );
  assertSameJson(
    stratagemNode.sourceRefs,
    STRATAGEM_COVERAGE_SOURCE_REFS,
    'full-game-coverage: provenance exacte de coverage.stratagems'
  );

  for (const gap of fullGameCoverage.gaps) {
    assert(typeof gap.category === 'string' && gap.category.length > 0 && typeof gap.title === 'string' && gap.title.length > 0, `gap ${gap.id}: catégorie et titre requis`);
    assert(allowedGapStatuses.has(gap.status), `gap ${gap.id}: statut invalide`);
    uniqueStrings(gap.blocksNodeIds, `gap ${gap.id}.blocksNodeIds`);
    assert(typeof gap.requiredAction === 'string' && gap.requiredAction.length > 0, `gap ${gap.id}: action requise absente`);
    assert(typeof gap.manualOwnerAction === 'string' && gap.manualOwnerAction.length > 0, `gap ${gap.id}: alternative manuelle absente`);
    for (const nodeId of gap.blocksNodeIds) {
      const node = nodesById.get(nodeId);
      assert(node, `gap ${gap.id}: nœud orphelin ${nodeId}`);
      assert(node.blockingGapIds.includes(gap.id), `gap ${gap.id}: relation inverse absente sur ${nodeId}`);
    }
  }
  const missionGapIds = ['GAP-M6-MISSION-001', 'GAP-M6-MISSION-002', 'GAP-M6-MISSION-003', 'GAP-M6-MISSION-004', 'GAP-M6-MISSION-005'];
  for (const gapId of missionGapIds) {
    const gap = gapsById.get(gapId);
    assert(gap.status === 'resolved' && gap.blocksNodeIds.length === 0, `full-game-coverage: ${gapId} doit être résolu par ADR-019`);
  }
  for (const node of fullGameCoverage.nodes) {
    for (const gapId of node.blockingGapIds) {
      assert(gapsById.get(gapId).blocksNodeIds.includes(node.id), `nœud ${node.id}: relation inverse absente sur ${gapId}`);
    }
  }
  for (const roster of fullGameCoverage.rosterCandidates) {
    for (const gapId of roster.blockingGapIds) assert(gapsById.has(gapId), `roster ${roster.id}: gap orphelin ${gapId}`);
  }
  for (const gapId of mission.blockingGapIds) assert(gapsById.has(gapId), `mission candidate: gap orphelin ${gapId}`);

  uniqueStrings(fullGameCoverage.arbitrationIds, 'full-game-coverage.arbitrationIds');
  assert(fullGameCoverage.arbitrationIds.length === 0, 'full-game-coverage: aucun arbitrage actif ne doit être inventé');
  const readiness = fullGameCoverage.readiness;
  assert(readiness?.compatible === false, 'full-game-coverage: le pilote incomplet ne doit pas être compatible');
  uniqueStrings(readiness.blockingNodeIds, 'full-game-coverage.readiness.blockingNodeIds');
  for (const nodeId of readiness.blockingNodeIds) assert(nodesById.has(nodeId), `full-game-coverage.readiness: nœud orphelin ${nodeId}`);
  const expectedBlockingNodeIds = fullGameCoverage.nodes
    .filter((node) => node.status !== 'covered' && node.status !== 'deferred')
    .map((node) => node.id);
  assertSameJson(readiness.blockingNodeIds, expectedBlockingNodeIds, 'full-game-coverage.readiness: tous les nœuds reachable non couverts doivent être bloquants');
  assert(Array.isArray(readiness.nextOwnerActions) && readiness.nextOwnerActions.length > 0
    && readiness.nextOwnerActions.every((action) => typeof action === 'string' && action.length > 0), 'full-game-coverage: prochaines actions propriétaire requises');
  const completeGameNode = nodesById.get('coverage.complete-game');
  assert(completeGameNode && completeGameNode.status !== 'covered', 'full-game-coverage: la partie complète ne doit pas être annoncée couverte');
  const openGapIds = gapIds.filter((gapId) => gapsById.get(gapId).status !== 'resolved');
  assertSameJson([...completeGameNode.blockingGapIds].sort(), [...openGapIds].sort(), 'full-game-coverage: tous les gaps ouverts doivent bloquer la partie complète');
}

function validateCorePocCoverage(document, manifest) {
  assertExactKeys(document, [
    'schemaVersion', 'version', 'manifestVersion', 'scope', 'status', 'decisionReference', 'technicalDecisionReference',
    'catalogPolicy', 'canonicalSourceIds', 'excludedContent', 'technicalLimitations', 'physicalConvention',
    'forces', 'requirements', 'readiness'
  ], 'core-poc-coverage.json');
  assert(document.schemaVersion === CORE_POC_COVERAGE_SCHEMA, 'core-poc-coverage.json: schemaVersion incompatible');
  assert(document.version === '1.1.0' && document.manifestVersion === manifest.version, 'core-poc-coverage.json: version incompatible');
  assert(document.scope === CORE_POC_SCOPE && document.status === 'covered'
    && document.decisionReference === 'ADR-022' && document.technicalDecisionReference === 'ADR-025',
  'core-poc-coverage.json: identité POC technique invalide');

  assertExactKeys(document.catalogPolicy, [
    'coverageClaim', 'supportedUnitIds', 'supportedFactionIds', 'unitSubjectType',
    'allowsRosterDraftImport', 'statement'
  ], 'core-poc-coverage.catalogPolicy');
  assert(document.catalogPolicy.coverageClaim === 'none'
    && document.catalogPolicy.unitSubjectType === 'fixture-unit'
    && document.catalogPolicy.allowsRosterDraftImport === false
    && document.catalogPolicy.supportedUnitIds.length === 0
    && document.catalogPolicy.supportedFactionIds.length === 0,
  'core-poc-coverage: aucune couverture de catalogue, faction ou RosterDraft n’est autorisée');
  assert(typeof document.catalogPolicy.statement === 'string' && document.catalogPolicy.statement.length > 0, 'core-poc-coverage: déclaration de limite catalogue requise');

  const manifestSourceIds = manifest.sources.map((source) => source.id);
  uniqueStrings(document.canonicalSourceIds, 'core-poc-coverage.canonicalSourceIds');
  assert(document.canonicalSourceIds.every((sourceId) => manifestSourceIds.includes(sourceId)), 'core-poc-coverage: source orpheline');
  assert(document.canonicalSourceIds.every((sourceId) => !/(?:faction-pack|catalog|codex)/i.test(sourceId)), 'core-poc-coverage: source de codex, faction ou catalogue interdite');

  const requiredExclusionIds = [
    'army-codex-data', 'army-rules', 'catalog-points-and-legality', 'datasheet-abilities',
    'detachment-rules', 'enhancements', 'faction-stratagems'
  ];
  assert(Array.isArray(document.excludedContent), 'core-poc-coverage.excludedContent: tableau requis');
  uniqueStrings(document.excludedContent.map((entry) => entry.id), 'core-poc-coverage.excludedContent');
  assertSameJson(document.excludedContent.map((entry) => entry.id).sort(), requiredExclusionIds, 'core-poc-coverage: exclusions de codex exactes requises');
  for (const exclusion of document.excludedContent) {
    assertExactKeys(exclusion, ['id', 'status', 'reason'], `core-poc-coverage.excludedContent.${exclusion.id}`);
    assert(exclusion.status === 'excluded-from-poc' && typeof exclusion.reason === 'string' && exclusion.reason.length > 0, `core-poc-coverage: exclusion invalide ${exclusion.id}`);
  }

  const requiredTechnicalLimitations = [
    ['core-stratagem.command-reroll', ['15.02']],
    ['core-stratagem.epic-challenge', ['15.03']],
    ['core-stratagem.overwatch', ['15.08', '15.09']],
    ['core-stratagem.heroic-intervention', ['15.11']]
  ];
  assert(Array.isArray(document.technicalLimitations), 'core-poc-coverage.technicalLimitations: tableau requis');
  uniqueStrings(document.technicalLimitations.map((entry) => entry.id), 'core-poc-coverage.technicalLimitations');
  assertSameJson(document.technicalLimitations.map((entry) => entry.id).sort(), requiredTechnicalLimitations.map(([id]) => id).sort(),
    'core-poc-coverage: quatre limites techniques exactes requises');
  for (const [limitationId, references] of requiredTechnicalLimitations) {
    const limitation = document.technicalLimitations.find((entry) => entry.id === limitationId);
    assertExactKeys(limitation, ['id', 'status', 'ruleReferences', 'reason'], `core-poc-coverage.technicalLimitations.${limitationId}`);
    assert(limitation.status === 'unsupported-in-technical-poc' && typeof limitation.reason === 'string' && limitation.reason.length > 0,
      `core-poc-coverage: limite technique invalide ${limitationId}`);
    assertSameJson(limitation.ruleReferences, references, `core-poc-coverage: références invalides pour ${limitationId}`);
  }

  assertExactKeys(document.physicalConvention, [
    'status', 'requestedScope', 'profileIds', 'basis', 'reviewedBy', 'reviewedAt'
  ], 'core-poc-coverage.physicalConvention');
  assert(document.physicalConvention.status === 'human-reviewed'
    && document.physicalConvention.requestedScope === CORE_POC_SCOPE
    && document.physicalConvention.reviewedBy === 'project-owner'
    && document.physicalConvention.reviewedAt === '2026-08-31',
  'core-poc-coverage: la convention physique approuvée doit rester liée à ADR-023');
  uniqueStrings(document.physicalConvention.profileIds, 'core-poc-coverage.physicalConvention.profileIds');
  assertSameJson(document.physicalConvention.profileIds, [APPROVED_PROFILE_ID], 'core-poc-coverage: proposition physique bornée requise');

  assert(Array.isArray(document.forces) && document.forces.length === 2, 'core-poc-coverage: exactement deux forces requises');
  uniqueStrings(document.forces.map((force) => force.id), 'core-poc-coverage.forces');
  uniqueStrings(document.forces.map((force) => force.playerId), 'core-poc-coverage.players');
  const fixtureUnits = document.forces.flatMap((force) => force.units);
  uniqueStrings(fixtureUnits.map((unit) => unit.id), 'core-poc-coverage.fixtureUnits');
  assert(document.forces.every((force) => force.units.length === 3
    && force.units.filter((unit) => unit.role === 'character').length === 1),
  'core-poc-coverage: trois fixtures et un personnage par force requis');
  for (const unit of fixtureUnits) {
    assertExactKeys(unit, ['id', 'subjectType', 'role', 'modelCount', 'physicalProfileId', 'runtimeStatus'], `core-poc-coverage.fixture.${unit.id}`);
    assert(unit.subjectType === 'fixture-unit'
      && (unit.role === 'line' || unit.role === 'character')
      && Number.isInteger(unit.modelCount) && unit.modelCount > 0
      && unit.physicalProfileId === APPROVED_PROFILE_ID
      && unit.runtimeStatus === 'ready', `core-poc-coverage: fixture invalide ${unit.id}`);
  }

  assert(Array.isArray(document.requirements) && document.requirements.length > 0, 'core-poc-coverage.requirements: tableau requis');
  uniqueStrings(document.requirements.map((requirement) => requirement.id), 'core-poc-coverage.requirements');
  const allowedKinds = new Set(['core-rule', 'core-stratagem', 'mission-rule', 'project-physical-convention', 'runtime', 'persistence', 'ui']);
  const allowedStatuses = new Set(['covered', 'partial', 'planned']);
  for (const requirement of document.requirements) {
    assertExactKeys(requirement, ['id', 'kind', 'required', 'status', 'sourceIds', 'note'], `core-poc-coverage.requirement.${requirement.id}`);
    assert(allowedKinds.has(requirement.kind) && typeof requirement.required === 'boolean' && allowedStatuses.has(requirement.status), `core-poc-coverage: exigence invalide ${requirement.id}`);
    assert(requirement.required === true || (requirement.id === 'poc.common-stratagems' && requirement.status === 'partial'),
      `core-poc-coverage: seule la limite ADR-025 peut être non bloquante (${requirement.id})`);
    uniqueStrings(requirement.sourceIds, `core-poc-coverage.requirement.${requirement.id}.sourceIds`);
    assert(requirement.sourceIds.every((sourceId) => document.canonicalSourceIds.includes(sourceId)), `core-poc-coverage: source d’exigence orpheline ${requirement.id}`);
    assert(typeof requirement.note === 'string' && requirement.note.length > 0, `core-poc-coverage: note absente ${requirement.id}`);
  }
  const expectedBlockingIds = document.requirements.filter((requirement) => requirement.required && requirement.status !== 'covered').map((requirement) => requirement.id);
  assertExactKeys(document.readiness, ['compatible', 'blockingRequirementIds', 'pendingOwnerActions'], 'core-poc-coverage.readiness');
  assert(document.readiness.compatible === true, 'core-poc-coverage: le POC technique validé doit être compatible dans son périmètre ADR-025');
  assertSameJson(document.readiness.blockingRequirementIds, expectedBlockingIds, 'core-poc-coverage: blockers incomplets');
  assert(Array.isArray(document.readiness.pendingOwnerActions) && document.readiness.pendingOwnerActions.length === 0,
    'core-poc-coverage: aucune action propriétaire physique ne doit rester après ADR-023');
}

function validateCorePocLayout(document, measurements, manifest) {
  assertExactKeys(document, [
    'schemaVersion', 'version', 'manifestVersion', 'scope', 'id', 'status', 'source',
    'board', 'deploymentZones', 'objectives', 'terrain', 'measurementBindings', 'physicalConvention'
  ], 'core-poc-layout.json');
  assert(document.schemaVersion === CORE_POC_LAYOUT_SCHEMA
    && document.version === '1.0.0'
    && document.manifestVersion === manifest.version
    && document.scope === CORE_POC_SCOPE
    && document.id === CORE_POC_LAYOUT_ID
    && document.status === 'covered', 'core-poc-layout.json: identité ou statut incompatible');
  assertSameJson(document.board, {
    widthTenthsInch: 440,
    heightTenthsInch: 600,
    origin: 'top-left',
    worldUnitsPerInch: 254
  }, 'core-poc-layout.json.board');

  const measuredLayout = measurements.layouts.find((layout) => layout.layoutId === 'disruption-mirror-1');
  assert(measuredLayout?.status === 'verified' && measuredLayout.measurementCount === 32,
    'core-poc-layout.json: layout mesuré vérifié requis');
  assertExactKeys(document.source, [
    'sourceId', 'measurementArtifact', 'measurementLayoutId', 'measuredImageSha256',
    'plainImageSha256', 'boardRectPx', 'transcription'
  ], 'core-poc-layout.json.source');
  assert(document.source.sourceId === APPROVED_GDM_LAYOUT_SOURCE_ID
    && document.source.measurementArtifact === manifest.artifacts.gdmLayoutMeasurements
    && document.source.measurementLayoutId === measuredLayout.layoutId
    && document.source.measuredImageSha256 === measuredLayout.sourceImage.localMeasuredSha256
    && document.source.plainImageSha256 === measuredLayout.sourceImage.localPlainSha256,
  'core-poc-layout.json: provenance image ou mesures incohérente');
  assertSameJson(document.source.boardRectPx, measuredLayout.boardRectPx, 'core-poc-layout.json.source.boardRectPx');
  assertExactKeys(document.source.transcription, ['baseplates', 'features', 'objectives', 'deployment'], 'core-poc-layout.json.source.transcription');
  assert(Object.values(document.source.transcription).every((value) => typeof value === 'string' && value.length > 0),
    'core-poc-layout.json: méthode de transcription requise');

  const pointInsideBoard = (point) => Number.isInteger(point?.x) && Number.isInteger(point?.y)
    && point.x >= 0 && point.x <= 440 && point.y >= 0 && point.y <= 600;
  const validatePolygon = (polygon, label) => {
    assert(Array.isArray(polygon) && polygon.length >= 3 && polygon.every(pointInsideBoard), `${label}: polygone entier dans le plateau requis`);
  };
  const boundsFor = (polygon) => ({
    minX: Math.min(...polygon.map((point) => point.x)),
    minY: Math.min(...polygon.map((point) => point.y)),
    maxX: Math.max(...polygon.map((point) => point.x)),
    maxY: Math.max(...polygon.map((point) => point.y))
  });

  assert(Array.isArray(document.deploymentZones) && document.deploymentZones.length === 2,
    'core-poc-layout.json: deux zones de déploiement requises');
  uniqueStrings(document.deploymentZones.map((zone) => zone.id), 'core-poc-layout.deploymentZones');
  assertSameJson(document.deploymentZones.map((zone) => zone.role).sort(), ['attacker', 'defender'],
    'core-poc-layout.json: rôles de déploiement exacts requis');
  document.deploymentZones.forEach((zone) => validatePolygon(zone.polygonTenthsInch, `core-poc-layout.zone.${zone.id}`));

  const objectiveRoles = ['attacker-home', 'defender-home', 'no-mans-land-1', 'no-mans-land-2', 'centre-1', 'centre-2'];
  assert(Array.isArray(document.objectives) && document.objectives.length === 6,
    'core-poc-layout.json: six objectifs requis');
  uniqueStrings(document.objectives.map((objective) => objective.id), 'core-poc-layout.objectives');
  assertSameJson(document.objectives.map((objective) => objective.role).sort(), objectiveRoles.sort(),
    'core-poc-layout.json: rôles objectifs exacts requis');
  const rect = document.source.boardRectPx;
  for (const objective of document.objectives) {
    assert(pointInsideBoard(objective.centerTenthsInch)
      && Number.isFinite(objective.sourceCenterPx?.x) && Number.isFinite(objective.sourceCenterPx?.y),
    `core-poc-layout.objective.${objective.id}: centre invalide`);
    assertSameJson(objective.centerTenthsInch, {
      x: Math.round((objective.sourceCenterPx.x - rect.left) * 440 / (rect.right - rect.left)),
      y: Math.round((objective.sourceCenterPx.y - rect.top) * 600 / (rect.bottom - rect.top))
    }, `core-poc-layout.objective.${objective.id}: projection pixel/plateau`);
  }

  assert(Array.isArray(document.terrain) && document.terrain.length === 13,
    'core-poc-layout.json: treize baseplates requises');
  uniqueStrings(document.terrain.map((terrain) => terrain.id), 'core-poc-layout.terrain');
  const featureIds = document.terrain.flatMap((terrain) => terrain.features.map((feature) => feature.id));
  uniqueStrings(featureIds, 'core-poc-layout.features');
  assert(featureIds.length === 28, 'core-poc-layout.json: vingt-huit aplats de caractéristiques requis');
  const terrainById = new Map();
  for (const terrain of document.terrain) {
    validatePolygon(terrain.baseplateTenthsInch, `core-poc-layout.terrain.${terrain.id}`);
    uniqueStrings((terrain.anchors ?? []).map((anchor) => anchor.id), `core-poc-layout.terrain.${terrain.id}.anchors`);
    uniqueStrings((terrain.subregions ?? []).map((subregion) => subregion.id), `core-poc-layout.terrain.${terrain.id}.subregions`);
    assert((terrain.anchors ?? []).every((anchor) => pointInsideBoard(anchor.pointTenthsInch)),
      `core-poc-layout.terrain.${terrain.id}: ancre hors plateau`);
    for (const feature of terrain.features) {
      assert(feature.kind === 'ruin-wall' || feature.kind === 'obstacle', `core-poc-layout.feature.${feature.id}: type invalide`);
      validatePolygon(feature.polygonTenthsInch, `core-poc-layout.feature.${feature.id}`);
    }
    terrainById.set(terrain.id, terrain);
  }

  const measurementById = new Map(measuredLayout.measurements.map((measurement) => [measurement.measurementId, measurement]));
  assert(Array.isArray(document.measurementBindings) && document.measurementBindings.length === 32,
    'core-poc-layout.json: 32 liaisons de mesures requises');
  uniqueStrings(document.measurementBindings.map((binding) => binding.measurementId), 'core-poc-layout.measurementBindings');
  assertSameJson(document.measurementBindings.map((binding) => binding.measurementId),
    Array.from({ length: 32 }, (_, index) => `m${String(index + 1).padStart(3, '0')}`),
    'core-poc-layout.json: ordre complet des liaisons de mesures');
  for (const binding of document.measurementBindings) {
    const measurement = measurementById.get(binding.measurementId);
    const terrain = terrainById.get(binding.subjectId);
    assert(measurement?.status === 'verified' && terrain, `core-poc-layout.binding.${binding.measurementId}: liaison orpheline`);
    const [subject, property] = binding.target.split('.');
    let value;
    if (subject === 'baseplate') {
      const bounds = boundsFor(terrain.baseplateTenthsInch);
      value = bounds[property];
    } else if (subject?.startsWith('anchor:')) {
      const anchor = (terrain.anchors ?? []).find((candidate) => candidate.id === subject.slice('anchor:'.length));
      value = anchor?.pointTenthsInch?.[property];
    } else if (subject?.startsWith('subregion:')) {
      const subregion = (terrain.subregions ?? []).find((candidate) => candidate.id === subject.slice('subregion:'.length));
      value = subregion?.boundsTenthsInch?.[property];
    }
    const expectedAxis = property?.endsWith('X') || property === 'x' ? 'x' : 'y';
    assert(Number.isInteger(value) && expectedAxis === measurement.axis && value === measurement.coordinateTenthsOfInch,
      `core-poc-layout.binding.${binding.measurementId}: cible incompatible avec la mesure vérifiée`);
  }

  assertExactKeys(document.physicalConvention, [
    'status', 'baseplateRuleIds', 'featureSemantics', 'ruinWallHeightWorldUnits',
    'obstacleHeightWorldUnits', 'reviewedBy', 'reviewedAt', 'reviewRequest'
  ], 'core-poc-layout.physicalConvention');
  assert(document.physicalConvention.status === 'human-reviewed'
    && document.physicalConvention.featureSemantics === 'executable'
    && document.physicalConvention.ruinWallHeightWorldUnits === 1_270
    && document.physicalConvention.obstacleHeightWorldUnits === 508
    && document.physicalConvention.reviewedBy === 'project-owner'
    && document.physicalConvention.reviewedAt === '2026-08-31'
    && Array.isArray(document.physicalConvention.reviewRequest)
    && document.physicalConvention.reviewRequest.length === 0,
  'core-poc-layout.json: propriétés physiques approuvées par ADR-023 requises');
  assertSameJson(document.physicalConvention.baseplateRuleIds, [COVER_RULE_ID],
    'core-poc-layout.json: règle de baseplate attendue');
}

function validateCorePocFixtures(document, coverage, physicalProfiles, manifest) {
  assertExactKeys(document, [
    'schemaVersion', 'version', 'manifestVersion', 'scope', 'status', 'sourceId',
    'coverageClaim', 'statement', 'templates', 'unitTemplateByFixtureId'
  ], 'core-poc-fixtures.json');
  assert(document.schemaVersion === CORE_POC_FIXTURES_SCHEMA
    && document.version === '1.0.0'
    && document.manifestVersion === manifest.version
    && document.scope === CORE_POC_SCOPE
    && document.status === 'ready'
    && document.sourceId === CORE_POC_FIXTURE_SOURCE_ID
    && document.coverageClaim === 'none', 'core-poc-fixtures.json: identité ou statut incompatible');
  const source = manifest.sources.find((candidate) => candidate.id === document.sourceId);
  assert(source?.kind === 'project-fixture-convention'
    && source.version === document.version
    && source.status === 'reference-only'
    && source.decisionReference === 'ADR-022'
    && source.coverageClaim === 'none', 'core-poc-fixtures.json: source de convention locale invalide');
  assert(typeof document.statement === 'string' && document.statement.includes('synthétiques')
    && document.statement.includes('aucune datasheet') && document.statement.includes('aucune') && document.statement.includes('codex'),
  'core-poc-fixtures.json: limite synthétique explicite requise');

  const pocPhysicalConvention = physicalProfiles.conventions.find((candidate) => candidate.id === CORE_POC_PHYSICAL_CONVENTION_ID);
  assertExactKeys(pocPhysicalConvention, [
    'id', 'kind', 'title', 'version', 'effectiveDate', 'decisionReference', 'scope',
    'reviewedBy', 'reviewedAt', 'statement'
  ], `physical-profiles.conventions.${CORE_POC_PHYSICAL_CONVENTION_ID}`);
  assert(pocPhysicalConvention.kind === 'local-reviewed-decision'
    && pocPhysicalConvention.version === '1.0.0'
    && pocPhysicalConvention.effectiveDate === '2026-08-31'
    && pocPhysicalConvention.decisionReference === 'ADR-023'
    && pocPhysicalConvention.scope === CORE_POC_SCOPE
    && pocPhysicalConvention.reviewedBy === 'project-owner'
    && pocPhysicalConvention.reviewedAt === '2026-08-31'
    && pocPhysicalConvention.statement.includes(APPROVED_PROFILE_ID)
    && pocPhysicalConvention.statement.includes('sans codex'),
  `physical-profiles.conventions.${CORE_POC_PHYSICAL_CONVENTION_ID}: extension POC approuvée requise`);

  assert(Array.isArray(document.templates) && document.templates.length === 2,
    'core-poc-fixtures.json: deux templates requis');
  uniqueStrings(document.templates.map((template) => template.id), 'core-poc-fixtures.templates');
  assertSameJson(document.templates.map((template) => template.role).sort(), ['character', 'line'],
    'core-poc-fixtures.json: rôles line/character requis');
  const profileIds = new Set(physicalProfiles.profiles.map((profile) => profile.id));
  const sharedWeapons = new Map();
  for (const template of document.templates) {
    assertExactKeys(template, ['id', 'role', 'physicalProfileId', 'keywords', 'characteristics', 'weapons'],
      `core-poc-fixtures.template.${template.id}`);
    assert(profileIds.has(template.physicalProfileId) && template.physicalProfileId === APPROVED_PROFILE_ID,
      `core-poc-fixtures.template.${template.id}: profil physique invalide`);
    uniqueStrings(template.keywords, `core-poc-fixtures.template.${template.id}.keywords`);
    assert(template.keywords.includes('INFANTRY')
      && (template.role !== 'character' || template.keywords.includes('CHARACTER')),
    `core-poc-fixtures.template.${template.id}: mots-clés incompatibles`);
    assertExactKeys(template.characteristics, [
      'movement', 'toughness', 'save', 'wounds', 'leadership', 'objectiveControl'
    ], `core-poc-fixtures.template.${template.id}.characteristics`);
    assert(Object.values(template.characteristics).every((value) => Number.isInteger(value) && value > 0)
      && template.characteristics.save <= 6 && template.characteristics.leadership <= 12,
    `core-poc-fixtures.template.${template.id}: caractéristiques invalides`);
    assert(Array.isArray(template.weapons) && template.weapons.length === 2
      && template.weapons.some((weapon) => weapon.weaponType === 'ranged')
      && template.weapons.some((weapon) => weapon.weaponType === 'melee'),
    `core-poc-fixtures.template.${template.id}: une arme de tir et une arme de mêlée requises`);
    for (const weapon of template.weapons) {
      assertExactKeys(weapon, [
        'id', 'name', 'weaponType', 'range', 'attacks', 'skill', 'strength', 'armourPenetration', 'damage'
      ], `core-poc-fixtures.weapon.${weapon.id}`);
      assert(typeof weapon.id === 'string' && weapon.id.startsWith('core-poc-')
        && typeof weapon.name === 'string' && weapon.name.length > 0
        && (weapon.weaponType === 'ranged' || weapon.weaponType === 'melee')
        && Number.isInteger(weapon.range) && weapon.range >= 0
        && (weapon.weaponType === 'melee' ? weapon.range === 0 : weapon.range > 0)
        && Number.isInteger(weapon.attacks) && weapon.attacks > 0
        && Number.isInteger(weapon.skill) && weapon.skill >= 2 && weapon.skill <= 6
        && Number.isInteger(weapon.strength) && weapon.strength > 0
        && Number.isInteger(weapon.armourPenetration)
        && Number.isInteger(weapon.damage) && weapon.damage > 0,
      `core-poc-fixtures.weapon.${weapon.id}: profil numérique invalide`);
      const existing = sharedWeapons.get(weapon.id);
      assert(existing === undefined || JSON.stringify(existing) === JSON.stringify(weapon),
        `core-poc-fixtures.weapon.${weapon.id}: copies partagées incohérentes`);
      sharedWeapons.set(weapon.id, weapon);
    }
  }
  assertSameJson([...sharedWeapons.keys()].sort(), [
    'core-poc-command-blade-v1', 'core-poc-training-blade-v1', 'core-poc-training-rifle-v1'
  ], 'core-poc-fixtures.json: inventaire d’armes exact requis');

  const fixtureUnits = coverage.forces.flatMap((force) => force.units);
  const fixtureIds = fixtureUnits.map((unit) => unit.id).sort();
  assertSameJson(Object.keys(document.unitTemplateByFixtureId).sort(), fixtureIds,
    'core-poc-fixtures.json: association exhaustive aux six fixtures requise');
  const templateById = new Map(document.templates.map((template) => [template.id, template]));
  for (const fixture of fixtureUnits) {
    const template = templateById.get(document.unitTemplateByFixtureId[fixture.id]);
    assert(template?.role === fixture.role, `core-poc-fixtures.json: rôle de template incohérent pour ${fixture.id}`);
  }
}

function assertNoLegacyPointFields(value, label) {
  const forbiddenKeys = new Set([
    'sampling',
    'samplingstrategy',
    'visibilitypoints',
    'normalizedpoints',
    'samplepoints',
    'endpointsamples',
    'pointselectionstrategy'
  ]);
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    assert(!forbiddenKeys.has(normalizedKey), `${label}: champ de points legacy interdit (${key})`);
    assertNoLegacyPointFields(nested, `${label}.${key}`);
  }
}

async function assertOfficialAppReferencesResource(source, archiveScreenshotIds) {
  const resource = JSON.parse(await readFile(officialAppReferencesPath, 'utf8'));
  assert(resource.schemaVersion === OFFICIAL_APP_REFERENCES_RESOURCE_SCHEMA, 'Références application officielle: schéma incompatible');
  assert(resource.id === source.id && resource.status === 'reference-only' && resource.authority === 'official-app', 'Références application officielle: provenance invalide');
  assert(resource.version === source.version && resource.visibleLastUpdated === '2026-07-22' && resource.capturedAt === source.retrievedAt, 'Références application officielle: version ou dates incohérentes');
  assert(resource.sourceArchive?.id === source.id && resource.sourceArchive?.path === '../../../references/warhammer-40k/rules/app-references/official-app-2026-08-24/archive.json', 'Références application officielle: archive de provenance incorrecte');
  assert(Array.isArray(resource.sections) && resource.sections.length === 6, 'Références application officielle: six sections transcrites requises');
  uniqueStrings(resource.sections.map((section) => section.id), 'Références application officielle.sections');
  for (const section of resource.sections) {
    assert(typeof section.title === 'string' && section.title.length > 0, `Références application officielle: titre absent pour ${section.id}`);
    assert(Array.isArray(section.captureIds) && section.captureIds.length > 0 && section.captureIds.every((id) => archiveScreenshotIds.has(id)), `Références application officielle: capture inconnue pour ${section.id}`);
    assert(Array.isArray(section.statements) && section.statements.length > 0 && section.statements.every((statement) => typeof statement === 'string' && statement.length > 0), `Références application officielle: transcription incomplète pour ${section.id}`);
  }
}

async function assertOfficialAppErrataResource(source, archiveScreenshotIds) {
  const resource = JSON.parse(await readFile(officialAppErrataPath, 'utf8'));
  assert(resource.schemaVersion === OFFICIAL_APP_ERRATA_RESOURCE_SCHEMA, 'Errata application officielle: schéma incompatible');
  assert(resource.id === source.id && resource.status === 'reference-only' && resource.authority === 'official-app', 'Errata application officielle: provenance invalide');
  assert(resource.version === source.version && resource.visibleLastUpdated === '2026-07-22' && resource.capturedAt === source.retrievedAt, 'Errata application officielle: version ou dates incohérentes');
  assert(resource.sourceArchive?.id === source.id && resource.sourceArchive?.path === '../../../references/warhammer-40k/rules/errata/official-app-2026-08-24/archive.json', 'Errata application officielle: archive de provenance incorrecte');
  assert(Array.isArray(resource.entries) && resource.entries.length === 5, 'Errata application officielle: cinq entrées transcrites requises');
  uniqueStrings(resource.entries.map((entry) => entry.id), 'Errata application officielle.entries');
  for (const entry of resource.entries) {
    assert(typeof entry.kind === 'string' && entry.kind.length > 0 && typeof entry.text === 'string' && entry.text.length > 0 && typeof entry.scope === 'string' && entry.scope.length > 0, `Errata application officielle: texte incomplet pour ${entry.id}`);
    assert(Array.isArray(entry.captureIds) && entry.captureIds.length > 0 && entry.captureIds.every((id) => archiveScreenshotIds.has(id)), `Errata application officielle: capture inconnue pour ${entry.id}`);
    assert(entry.reference === null || typeof entry.reference === 'string', `Errata application officielle: référence invalide pour ${entry.id}`);
  }
}

function integerCharacteristic(value, suffix, label) {
  const normalized = String(value ?? '').trim();
  const expression = suffix ? new RegExp(`^(\\d+)${suffix}$`) : /^(\d+)$/;
  const match = normalized.match(expression);
  assert(match, `${label}: caractéristique entière attendue`);
  return Number(match[1]);
}

function rangedWeapon(unit, name, label) {
  const profiles = (unit.Weapons ?? [])
    .filter((group) => group.IsMelee !== true)
    .flatMap((group) => group.Weapons ?? []);
  const matches = profiles.filter((weapon) => weapon.Name === name);
  assert(matches.length === 1, `${label}: profil d'arme ${name} unique requis`);
  return matches[0];
}

function normalizedWeaponKeywords(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return [];
  return value.split(',').map((keyword) => keyword.trim()).filter(Boolean);
}

async function assertCatalogSnapshot(snapshot) {
  assertExactKeys(snapshot, ['id', 'path', 'sha256'], `snapshot catalogue ${snapshot?.id ?? 'inconnu'}`);
  assert(typeof snapshot.id === 'string' && snapshot.id.length > 0, 'snapshot catalogue: id requis');
  assert(typeof snapshot.path === 'string' && snapshot.path.startsWith('data/units/') && !snapshot.path.includes('..'), `snapshot ${snapshot.id}: chemin catalogue invalide`);
  assert(/^[a-f0-9]{64}$/.test(snapshot.sha256 ?? ''), `snapshot ${snapshot.id}: sha256 requis`);
  const declaredPath = resolve(appDirectory, snapshot.path);
  const [catalogDirectory, sourcePath] = await Promise.all([realpath(M4_CATALOG_DIRECTORY), realpath(declaredPath)]);
  assert(sourcePath.toLowerCase().startsWith(`${catalogDirectory.toLowerCase()}${sep}`), `snapshot ${snapshot.id}: source hors data/units`);
  const sourceRaw = await readFile(sourcePath);
  const actualHash = createHash('sha256').update(sourceRaw).digest('hex');
  assert(actualHash === snapshot.sha256, `snapshot ${snapshot.id}: sha256 ne correspond pas au catalogue local`);
  return JSON.parse(sourceRaw.toString('utf8'));
}

async function assertOfficialPistolSource(rule) {
  assert(rule.source?.sourceId === COVER_SOURCE_ID, 'weapon.pistol: source officielle incorrecte');
  assert(rule.source?.version === 'archive-2026-07-28', 'weapon.pistol: version de source incorrecte');
  assert(rule.source?.effectiveDate === null && rule.source?.retrievedAt === '2026-07-28', 'weapon.pistol: date de source incorrecte');
  assert(rule.source?.reference === PISTOL_REFERENCE && rule.source?.printedPage === PISTOL_PRINTED_PAGE, `weapon.pistol: référence ${PISTOL_REFERENCE} page ${PISTOL_PRINTED_PAGE} requise`);
  assertSameJson(rule.source?.relatedReferences, [
    { reference: '24.07', printedPage: 81 },
    { reference: '10.06', printedPage: 35 }
  ], 'weapon.pistol.relatedReferences');
  const coreRules = JSON.parse(await readFile(coreRulesPath, 'utf8'));
  const pages = coreRules.chapters
    .flatMap((chapter) => chapter.sections ?? [])
    .flatMap((section) => section.pages ?? []);
  const page = pages.find((candidate) => candidate.printedPage === PISTOL_PRINTED_PAGE);
  const sourceText = page?.blocks?.map((block) => block.text ?? '').join('\n') ?? '';
  assert(sourceText.includes(`[PISTOLET] ${PISTOL_REFERENCE}`), `source officielle: référence ${PISTOL_REFERENCE} absente de la page ${PISTOL_PRINTED_PAGE}`);
  assert(sourceText.includes('[PISTOLET]  et [COMBAT RAPPROCHÉ]') && sourceText.includes('fonctionnellement les mêmes'), 'source officielle: équivalence PISTOLET/COMBAT RAPPROCHÉ absente');
}

async function validateM4DraftFacts(dataDirectory, manifest) {
  const facts = await readJson(dataDirectory, M4_DRAFT_FILENAME);
  const proposal = JSON.parse(await readFile(M4_PROPOSAL_PATH, 'utf8'));
  assertExactKeys(facts, [
    'schemaVersion',
    'version',
    'status',
    'effectiveDate',
    'scope',
    'proposalReference',
    'baseManifestVersion',
    'coverageClaim',
    'catalog',
    'catalogSnapshots',
    'physicalConventions',
    'physicalProfiles',
    'lineOfSightConvention',
    'terrainLayout',
    'unitFacts',
    'mandatoryRules',
    'legalityAndPhaseDispositions',
    'humanReview',
    'sampledLineOfSightReview'
  ], M4_DRAFT_FILENAME);
  assert(facts.schemaVersion === M4_DRAFT_SCHEMA, `${M4_DRAFT_FILENAME}: schemaVersion incompatible`);
  assert(facts.version === '2.2.0' && facts.effectiveDate === '2026-08-21', `${M4_DRAFT_FILENAME}: version et date requises`);
  assert(facts.status === 'draft' && facts.coverageClaim === 'none', `${M4_DRAFT_FILENAME}: doit rester draft sans revendication de couverture`);
  assert(facts.scope === M4_SCENARIO_ID && facts.baseManifestVersion === manifest.version, `${M4_DRAFT_FILENAME}: portée ou manifest de base incorrect`);
  assert(facts.proposalReference === 'docs/simulator/roster-pilots/real-roster-shooting-duel-v1.proposal.json', `${M4_DRAFT_FILENAME}: proposition approuvée requise`);
  assert(proposal.id === facts.scope && proposal.status === 'human-approved' && proposal.approval?.status === 'human-approved', `${M4_DRAFT_FILENAME}: proposition M4 non approuvée`);
  assertSameJson(facts.catalog, {
    sourceId: 'warforge-catalog-1.2.13.0',
    version: proposal.catalog.version,
    publishDate: proposal.catalog.publishDate,
    fingerprint: proposal.catalog.fingerprint
  }, `${M4_DRAFT_FILENAME}.catalog`);
  assertNoLegacyPointFields(facts, M4_DRAFT_FILENAME);

  uniqueStrings(facts.catalogSnapshots?.map((snapshot) => snapshot.id), `${M4_DRAFT_FILENAME}.catalogSnapshots`);
  assert(facts.catalogSnapshots.length === 3, `${M4_DRAFT_FILENAME}: trois snapshots catalogue requis`);
  assertSameJson(facts.catalogSnapshots.map((snapshot) => snapshot.path), [
    'data/units/Space Marines.json',
    'data/units/Blood Angels.json',
    'data/units/Salamanders.json'
  ], `${M4_DRAFT_FILENAME}.catalogSnapshots.paths`);
  const catalogsBySourceId = new Map();
  for (const snapshot of facts.catalogSnapshots) catalogsBySourceId.set(snapshot.id, await assertCatalogSnapshot(snapshot));

  assert(Array.isArray(facts.physicalConventions) && facts.physicalConventions.length === 1, `${M4_DRAFT_FILENAME}: une convention physique locale requise`);
  const convention = facts.physicalConventions[0];
  assertExactKeys(convention, ['id', 'kind', 'version', 'effectiveDate', 'scope', 'reviewStatus', 'reviewedBy', 'reviewedAt', 'statement'], `${M4_DRAFT_FILENAME}.physicalConventions[0]`);
  assert(convention.id === 'm4-real-infantry-geometry-draft-v1' && convention.kind === 'local-draft-convention', `${M4_DRAFT_FILENAME}: convention locale M4 requise`);
  assert(convention.scope === facts.scope && convention.version === '1.0.0' && convention.effectiveDate === facts.effectiveDate, `${M4_DRAFT_FILENAME}: provenance de convention incohérente`);
  assert(convention.reviewStatus === 'human-reviewed', `${M4_DRAFT_FILENAME}: convention physique revue humainement requise`);
  assertSameJson({
    scope: convention.scope,
    reviewedBy: convention.reviewedBy,
    reviewedAt: convention.reviewedAt
  }, M4_HUMAN_REVIEW, `${M4_DRAFT_FILENAME}.physicalConventions[0]: approbation humaine requise`);
  assert(convention.statement === M4_PHYSICAL_CONVENTION_STATEMENT, `${M4_DRAFT_FILENAME}: statement de convention physique exact requis`);

  uniqueStrings(facts.physicalProfiles?.map((profile) => profile.id), `${M4_DRAFT_FILENAME}.physicalProfiles`);
  assert(facts.physicalProfiles.length === 2, `${M4_DRAFT_FILENAME}: deux profils physiques candidats requis`);
  const expectedProfiles = [
    {
      id: 'm4-real-infantry-32mm-draft-v1',
      displayName: 'Infanterie réelle M4 — 32 mm',
      radius: 160,
      height: 400
    },
    {
      id: 'm4-real-infantry-40mm-draft-v1',
      displayName: 'Infanterie réelle M4 — 40 mm',
      radius: 200,
      height: 450
    }
  ];
  for (const expected of expectedProfiles) {
    const profile = facts.physicalProfiles.find((candidate) => candidate.id === expected.id);
    assertExactKeys(profile, ['id', 'displayName', 'shape', 'height', 'provenance', 'reviewStatus', 'approval'], `profil ${expected.id}`);
    assertExactKeys(profile.shape, ['kind', 'radius'], `profil ${expected.id}.shape`);
    assertExactKeys(profile.provenance, ['kind', 'sourceId', 'version', 'effectiveDate'], `profil ${expected.id}.provenance`);
    assert(profile.displayName === expected.displayName, `profil ${expected.id}: displayName exact requis`);
    assert(profile?.shape?.kind === 'circle' && profile.shape.radius === expected.radius, `profil ${expected.id}: rayon candidat incorrect`);
    assert(profile.height === expected.height && profile.height % 2 === 0, `profil ${expected.id}: hauteur paire candidate incorrecte`);
    assert(profile.provenance?.kind === 'warforge-draft-convention' && profile.provenance.sourceId === convention.id, `profil ${expected.id}: convention draft requise`);
    assert(profile.provenance.version === convention.version && profile.provenance.effectiveDate === convention.effectiveDate, `profil ${expected.id}: provenance incohérente`);
    assert(profile.reviewStatus === 'human-reviewed', `profil ${expected.id}: revue humaine requise`);
    assertExactKeys(profile.approval, ['scope', 'reviewedBy', 'reviewedAt'], `profil ${expected.id}.approval`);
    assertSameJson(profile.approval, M4_HUMAN_REVIEW, `profil ${expected.id}: approbation humaine requise`);
  }

  assertExactKeys(facts.lineOfSightConvention, ['id', 'version', 'decisionReference', 'endpointDomain', 'hitboxKind', 'pointLayout', 'endpointContact', 'terrainBoundaryContact', 'rayWidthWorldUnits', 'blockerDomain', 'modelOcclusion', 'approximation', 'implementationStatus', 'requiredByTask', 'statement'], `${M4_DRAFT_FILENAME}.lineOfSightConvention`);
  assertExactKeys(facts.lineOfSightConvention.pointLayout, ['verticalLevels', 'horizontalPositions', 'pointsPerHitbox', 'candidatePairCount'], `${M4_DRAFT_FILENAME}.lineOfSightConvention.pointLayout`);
  assertSameJson(facts.lineOfSightConvention, {
    id: 'm4-sampled-cylinder-los-v1',
    version: '1.0.0',
    decisionReference: 'ADR-008-sampled-cylinder-line-of-sight',
    endpointDomain: 'finite-representative-points',
    hitboxKind: 'closed-vertical-cylinder',
    pointLayout: {
      verticalLevels: ['bottom', 'middle', 'top'],
      horizontalPositions: ['center', 'east', 'north', 'west', 'south'],
      pointsPerHitbox: 15,
      candidatePairCount: 225
    },
    endpointContact: 'blocks',
    terrainBoundaryContact: 'blocks',
    rayWidthWorldUnits: 0,
    blockerDomain: 'static-terrain-only',
    modelOcclusion: 'excluded',
    approximation: 'finite-representative-points',
    implementationStatus: 'implemented-closed-m4',
    requiredByTask: 'SIM-M4-T08',
    statement: 'La visibilité M4 est décidée par le premier rayon dégagé du produit cartésien ordonné de 15 points représentatifs par hitbox cylindrique. Ce verdict est une approximation locale, versionnée et non officielle ; il ne décide ni le couvert ni la visibilité continue de la figurine.'
  }, `${M4_DRAFT_FILENAME}.lineOfSightConvention`);

  assertExactKeys(facts.terrainLayout, ['id', 'version', 'scope', 'reviewStatus', 'approval', 'board', 'zones'], `${M4_DRAFT_FILENAME}.terrainLayout`);
  assertExactKeys(facts.terrainLayout.board, ['width', 'height'], `${M4_DRAFT_FILENAME}.terrainLayout.board`);
  assert(facts.terrainLayout.id === 'm4-central-light-cover-layout-v1'
    && facts.terrainLayout.version === '1.1.0'
    && facts.terrainLayout.scope === facts.scope
    && facts.terrainLayout.reviewStatus === 'human-reviewed', `${M4_DRAFT_FILENAME}: convention de terrain M4 approuvée requise`);
  assertExactKeys(facts.terrainLayout.approval, ['scope', 'reviewedBy', 'reviewedAt', 'decision'], `${M4_DRAFT_FILENAME}.terrainLayout.approval`);
  assertSameJson(facts.terrainLayout.approval, {
    ...M4_HUMAN_REVIEW,
    decision: 'Le propriétaire approuve le terrain M4 : plateau de 44 × 30 pouces et zone centrale de couvert léger non occlusive.'
  }, `${M4_DRAFT_FILENAME}.terrainLayout.approval`);
  assertSameJson(facts.terrainLayout.board, { width: 11176, height: 7620 }, `${M4_DRAFT_FILENAME}.terrainLayout.board`);
  assert(Array.isArray(facts.terrainLayout.zones) && facts.terrainLayout.zones.length === 1, `${M4_DRAFT_FILENAME}: une zone de terrain locale requise`);
  const terrainZone = facts.terrainLayout.zones[0];
  assertExactKeys(terrainZone, ['id', 'label', 'occlusion', 'ruleIds', 'footprint'], `${M4_DRAFT_FILENAME}.terrainLayout.zones[0]`);
  assertExactKeys(terrainZone.footprint, ['outer'], `${M4_DRAFT_FILENAME}.terrainLayout.zones[0].footprint`);
  assertSameJson(terrainZone, {
    id: 'm4-central-light-cover-zone-v1',
    label: 'Zone centrale — couvert léger local',
    occlusion: 'none',
    ruleIds: ['core.benefit-of-cover'],
    footprint: { outer: [{ x: 4838, y: 2700 }, { x: 6338, y: 2700 }, { x: 6338, y: 4920 }, { x: 4838, y: 4920 }] }
  }, `${M4_DRAFT_FILENAME}.terrainLayout.zones[0]`);

  const approvedUnits = proposal.rosters.flatMap((roster) => roster.resolved.units.map((resolvedUnit) => ({
    side: roster.side,
    resolvedUnit,
    draftItem: roster.draft.items.find((item) => item.unitId === resolvedUnit.id)
  })));
  uniqueStrings(facts.unitFacts?.map((unit) => unit.catalogLink?.unitId), `${M4_DRAFT_FILENAME}.unitFacts`);
  assert(facts.unitFacts.length === approvedUnits.length && approvedUnits.length === 4, `${M4_DRAFT_FILENAME}: exactement quatre unités pilotes requises`);
  for (const approved of approvedUnits) {
    const label = `unité M4 ${approved.resolvedUnit.id}`;
    const unitFact = facts.unitFacts.find((candidate) => candidate.catalogLink?.unitId === approved.resolvedUnit.id);
    assert(unitFact, `${label}: faits absents`);
    assertExactKeys(unitFact, [
      'id',
      'catalogLink',
      'rosterSides',
      'modelCount',
      'physicalProfileId',
      'catalogBaseDiameterMm',
      'factionRuleTitle',
      'keywords',
      'factionKeywords',
      'characteristics',
      'selectedRangedWeapon',
      'unitAbilityDispositions',
      'coreAbilityDispositions',
      'excludedCharacteristics'
    ], label);
    assertExactKeys(unitFact.catalogLink, ['unitId', 'sourceId', 'sourcePath', 'sourceIndex', 'name'], `${label}.catalogLink`);
    assertExactKeys(unitFact.characteristics, ['movement', 'toughness', 'save', 'wounds', 'leadership', 'objectiveControl', 'invulnerableSave'], `${label}.characteristics`);
    assertExactKeys(unitFact.selectedRangedWeapon, ['id', 'catalogName', 'equippedCount', 'range', 'attacks', 'ballisticSkill', 'strength', 'armourPenetration', 'damage', 'keywords'], `${label}.selectedRangedWeapon`);
    for (const ability of unitFact.unitAbilityDispositions) assertExactKeys(ability, ['title', 'status', 'reason'], `${label}.unitAbilityDispositions`);
    for (const ability of unitFact.coreAbilityDispositions) assertExactKeys(ability, ['title', 'status', 'reason'], `${label}.coreAbilityDispositions`);
    for (const characteristic of unitFact.excludedCharacteristics) assertExactKeys(characteristic, ['name', 'sourceValue', 'reason'], `${label}.excludedCharacteristics`);
    assert(unitFact.catalogLink.sourcePath === approved.resolvedUnit.source && unitFact.catalogLink.sourceIndex === approved.resolvedUnit.sourceIndex, `${label}: lien source/index incorrect`);
    const snapshot = facts.catalogSnapshots.find((candidate) => candidate.path === unitFact.catalogLink.sourcePath);
    assert(snapshot && unitFact.catalogLink.sourceId === snapshot.id, `${label}: snapshot catalogue incorrect`);
    const catalog = catalogsBySourceId.get(snapshot.id);
    const sourceUnit = catalog?.Units?.[unitFact.catalogLink.sourceIndex];
    assert(sourceUnit?.Name === approved.resolvedUnit.name && unitFact.catalogLink.name === sourceUnit.Name, `${label}: nom ou index ne correspond pas au catalogue`);
    assertSameJson(unitFact.rosterSides, [approved.side], `${label}.rosterSides`);
    assert(unitFact.modelCount === approved.resolvedUnit.modelCount, `${label}: effectif approuvé incorrect`);
    assert(unitFact.factionRuleTitle === sourceUnit.Faction && unitFact.factionRuleTitle === 'Oath of Moment', `${label}: règle de faction Oath requise`);
    assertSameJson(unitFact.keywords, sourceUnit.Keywords, `${label}.keywords`);
    assertSameJson(unitFact.factionKeywords, sourceUnit.FactionKeywords, `${label}.factionKeywords`);
    const statline = sourceUnit.StatLines?.[0];
    assert(statline && sourceUnit.StatLines.length === 1, `${label}: une ligne de caractéristiques requise`);
    const baseDiameter = integerCharacteristic(statline.BaseInfo?.Size, '', `${label}.BaseInfo.Size`);
    assert(unitFact.catalogBaseDiameterMm === baseDiameter, `${label}: diamètre de socle catalogue incorrect`);
    const expectedProfileId = baseDiameter === 32 ? 'm4-real-infantry-32mm-draft-v1' : baseDiameter === 40 ? 'm4-real-infantry-40mm-draft-v1' : null;
    assert(expectedProfileId && unitFact.physicalProfileId === expectedProfileId, `${label}: profil physique candidat incorrect`);
    const expectedCharacteristics = {
      movement: integerCharacteristic(statline.Movement, '\\"', `${label}.Movement`) * 254,
      toughness: integerCharacteristic(statline.Toughness, '', `${label}.Toughness`),
      save: integerCharacteristic(statline.Save, '\\+', `${label}.Save`),
      wounds: integerCharacteristic(statline.Wounds, '', `${label}.Wounds`),
      leadership: integerCharacteristic(statline.Leadership, '\\+', `${label}.Leadership`),
      objectiveControl: integerCharacteristic(statline.OC, '', `${label}.OC`),
      invulnerableSave: statline.InvulSave ? integerCharacteristic(statline.InvulSave.Save, '\\+', `${label}.InvulSave`) : null
    };
    assertSameJson(unitFact.characteristics, expectedCharacteristics, `${label}.characteristics`);
    const selectedName = approved.resolvedUnit.selectedRangedWeapon;
    const weapon = rangedWeapon(sourceUnit, selectedName, label);
    const expectedWeapon = {
      id: integerCharacteristic(weapon.ToHit, '\\+', `${label}.HeavyBoltPistol.ToHit`) === 2 ? 'm4-heavy-bolt-pistol-ct2-v1' : 'm4-heavy-bolt-pistol-ct3-v1',
      catalogName: weapon.Name,
      equippedCount: approved.resolvedUnit.frozenDefaultLoadout.byComposition
        .flatMap((composition) => composition.weaponProfiles)
        .filter((profile) => profile.name === selectedName && profile.melee === false)
        .reduce((total, profile) => total + profile.count, 0),
      range: integerCharacteristic(weapon.Range, '\\"', `${label}.HeavyBoltPistol.Range`) * 254,
      attacks: integerCharacteristic(weapon.Attacks, '', `${label}.HeavyBoltPistol.Attacks`),
      ballisticSkill: integerCharacteristic(weapon.ToHit, '\\+', `${label}.HeavyBoltPistol.ToHit`),
      strength: integerCharacteristic(weapon.Strength, '', `${label}.HeavyBoltPistol.Strength`),
      armourPenetration: Number(weapon.AP),
      damage: integerCharacteristic(weapon.Damage, '', `${label}.HeavyBoltPistol.Damage`),
      keywords: normalizedWeaponKeywords(weapon.Keywords)
    };
    assertSameJson(unitFact.selectedRangedWeapon, expectedWeapon, `${label}.selectedRangedWeapon`);
    assert(expectedWeapon.equippedCount === unitFact.modelCount && expectedWeapon.keywords.includes('PISTOL'), `${label}: chaque figurine doit conserver son Heavy bolt pistol [PISTOL]`);
    assertSameJson(unitFact.unitAbilityDispositions.map((entry) => entry.title), (sourceUnit.UnitAbilities ?? []).map((ability) => ability.Title), `${label}.unitAbilityDispositions`);
    assert(unitFact.unitAbilityDispositions.every((entry) => entry.status === 'excluded-by-scenario-phase' && typeof entry.reason === 'string' && entry.reason.length > 0), `${label}: disposition d'aptitude d'unité requise`);
    assertSameJson(unitFact.coreAbilityDispositions.map((entry) => entry.title), sourceUnit.CoreAbilities ?? [], `${label}.coreAbilityDispositions`);
    assert(unitFact.coreAbilityDispositions.every((entry) => entry.status === 'not-selected-in-approved-roster' && typeof entry.reason === 'string' && entry.reason.length > 0), `${label}: disposition d'aptitude de base requise`);
    assertSameJson(unitFact.excludedCharacteristics, [], `${label}.excludedCharacteristics`);
  }

  uniqueStrings(facts.mandatoryRules?.map((rule) => rule.id), `${M4_DRAFT_FILENAME}.mandatoryRules`);
  assertSameJson(facts.mandatoryRules.map((rule) => rule.id), ['adeptus-astartes.oath-of-moment', 'weapon.pistol'], `${M4_DRAFT_FILENAME}.mandatoryRules.ids`);
  const oath = facts.mandatoryRules[0];
  assertExactKeys(oath, ['id', 'category', 'implementationStatus', 'requiredByTask', 'sourceReferences', 'timing', 'duration', 'variants'], 'adeptus-astartes.oath-of-moment');
  assert(oath.implementationStatus === 'implemented-closed-m4' && oath.requiredByTask === 'SIM-M4-T08', 'Oath of Moment: implémentation fermée T08 requise');
  assert(oath.timing === 'start-of-command-phase' && oath.duration === 'until-start-of-next-command-phase', 'Oath of Moment: fenêtre temporelle incorrecte');
  assertSameJson(oath.sourceReferences.map(({ sourceId, sourcePath, collection, title }) => ({ sourceId, sourcePath, collection, title })), [
    { sourceId: 'warforge-catalog-salamanders-1.2.13.0', sourcePath: 'data/units/Salamanders.json', collection: 'ArmyRules', title: 'OATH OF MOMENT' },
    { sourceId: 'warforge-catalog-blood-angels-1.2.13.0', sourcePath: 'data/units/Blood Angels.json', collection: 'ArmyRules', title: 'OATH OF MOMENT' }
  ], 'Oath of Moment.sourceReferences');
  for (const source of oath.sourceReferences) {
    assertExactKeys(source, ['sourceId', 'sourcePath', 'collection', 'title'], 'Oath of Moment.sourceReferences');
    const armyRule = catalogsBySourceId.get(source.sourceId)?.ArmyRules?.find((rule) => rule.Title === source.title);
    assert(armyRule?.Text.includes('re-roll the Hit roll') && armyRule.Text.includes('add 1 to the Wound roll'), `Oath of Moment: texte source absent de ${source.sourcePath}`);
  }
  assertSameJson(oath.variants.map(({ side, rerollHit, woundRollModifier }) => ({ side, rerollHit, woundRollModifier })), [
    { side: 'salamanders', rerollHit: true, woundRollModifier: 1 },
    { side: 'blood-angels', rerollHit: true, woundRollModifier: 0 }
  ], 'Oath of Moment.variants');
  for (const variant of oath.variants) assertExactKeys(variant, ['side', 'rerollHit', 'woundRollModifier', 'condition'], 'Oath of Moment.variants');
  assert(oath.variants.every((variant) => typeof variant.condition === 'string' && variant.condition.length > 0), 'Oath of Moment: conditions de variante requises');

  const pistol = facts.mandatoryRules[1];
  assertExactKeys(pistol, ['id', 'category', 'implementationStatus', 'requiredByTask', 'catalogKeyword', 'normalizedCoreKeyword', 'source', 'formalizedConstraint', 'm4Disposition'], 'weapon.pistol');
  assertExactKeys(pistol.source, ['sourceId', 'version', 'effectiveDate', 'retrievedAt', 'reference', 'printedPage', 'relatedReferences'], 'weapon.pistol.source');
  for (const relatedReference of pistol.source.relatedReferences ?? []) assertExactKeys(relatedReference, ['reference', 'printedPage'], 'weapon.pistol.source.relatedReferences');
  assert(pistol.implementationStatus === 'implemented-closed-m4' && pistol.requiredByTask === 'SIM-M4-T08', 'weapon.pistol: garde T08 requise');
  assert(pistol.catalogKeyword === 'PISTOL' && pistol.normalizedCoreKeyword === 'PISTOLET', 'weapon.pistol: normalisation catalogue/règle incorrecte');
  assert(pistol.formalizedConstraint === PISTOL_FORMALIZED_CONSTRAINT, 'weapon.pistol: contrainte formalisée exacte requise');
  assert(pistol.m4Disposition === PISTOL_M4_DISPOSITION, 'weapon.pistol: disposition M4 exacte requise');
  await assertOfficialPistolSource(pistol);

  uniqueStrings(facts.legalityAndPhaseDispositions?.map((entry) => entry.id), `${M4_DRAFT_FILENAME}.legalityAndPhaseDispositions`);
  const expectedDispositions = [
    {
      id: 'army-rule.space-marine-chapters.salamanders',
      sourceId: 'warforge-catalog-salamanders-1.2.13.0',
      sourcePath: 'data/units/Salamanders.json',
      collection: 'ArmyRules',
      title: 'SPACE MARINE CHAPTERS',
      status: 'validated-legality-only'
    },
    {
      id: 'army-rule.the-sons-of-sanguinius.blood-angels',
      sourceId: 'warforge-catalog-blood-angels-1.2.13.0',
      sourcePath: 'data/units/Blood Angels.json',
      collection: 'ArmyRules',
      title: 'The Sons of Sanguinius',
      status: 'validated-legality-only'
    },
    {
      id: 'stormlance.lightning-assault.salamanders',
      sourceId: 'warforge-catalog-space-marines-1.2.13.0',
      sourcePath: 'data/units/Space Marines.json',
      collection: 'Dettachments',
      sourceIndex: 5,
      title: 'STORMLANCE TASK FORCE',
      ruleTitle: 'LIGHTNING ASSAULT',
      status: 'excluded-by-scenario-phase'
    },
    {
      id: 'stormlance.lightning-assault.blood-angels',
      sourceId: 'warforge-catalog-blood-angels-1.2.13.0',
      sourcePath: 'data/units/Blood Angels.json',
      collection: 'Dettachments',
      sourceIndex: 13,
      title: 'STORMLANCE TASK FORCE',
      ruleTitle: 'LIGHTNING ASSAULT',
      status: 'excluded-by-scenario-phase'
    }
  ];
  assertSameJson(facts.legalityAndPhaseDispositions.map((entry) => entry.id), expectedDispositions.map((entry) => entry.id), `${M4_DRAFT_FILENAME}.legalityAndPhaseDispositions.ids`);
  for (const expected of expectedDispositions) {
    const entry = facts.legalityAndPhaseDispositions.find((candidate) => candidate.id === expected.id);
    assert(entry, `${expected.id}: disposition absente`);
    assertExactKeys(entry, [...Object.keys(expected), 'reason'], `${expected.id}`);
    const actualTuple = Object.fromEntries(Object.keys(expected).map((key) => [key, entry[key]]));
    assertSameJson(actualTuple, expected, `${expected.id}.provenance`);
    const snapshot = facts.catalogSnapshots.find((candidate) => candidate.id === entry.sourceId);
    assert(snapshot?.path === entry.sourcePath, `${entry.id}: sourceId et sourcePath doivent désigner le même snapshot`);
    const source = catalogsBySourceId.get(entry.sourceId);
    if (entry.collection === 'ArmyRules') {
      assert(source?.ArmyRules?.some((rule) => rule.Title === entry.title), `${entry.id}: règle d'armée source absente`);
    } else {
      const detachment = source?.Dettachments?.[entry.sourceIndex];
      assert(detachment?.Name === entry.title && detachment.Rule?.Title === entry.ruleTitle, `${entry.id}: détachement source incorrect`);
    }
    assert(typeof entry.reason === 'string' && entry.reason.length > 0, `${entry.id}: justification requise`);
  }

  assertSameJson(facts.humanReview, {
    status: 'human-approved',
    ...M4_HUMAN_REVIEW,
    decision: 'Les profils 32 mm × 40 mm et 40 mm × 45 mm sont approuvés comme conventions locales physiques du pilote M4.'
  }, `${M4_DRAFT_FILENAME}.humanReview`);
  assertSameJson(facts.sampledLineOfSightReview, {
    status: 'human-approved',
    ...M4_HUMAN_REVIEW,
    decision: 'Le propriétaire approuve une convention M4 de ligne de vue par un nombre fini de points représentatifs, versionnée et explicitement approximative.'
  }, `${M4_DRAFT_FILENAME}.sampledLineOfSightReview`);
  assertExactKeysAbsent(facts, /^supported(?:Unit|Scenario|Weapon|PhysicalProfile|Rule)/i, M4_DRAFT_FILENAME);
}

export async function validateSimulatorData(options = {}) {
  const dataDirectory = options.dataDirectory ?? defaultDataDirectory;
  const publicDirectory = options.publicDirectory ?? defaultPublicDirectory;
  const validatePublicMirror = options.validatePublicMirror ?? true;
  const manifest = await readJson(dataDirectory, 'manifest.json');
  assert(manifest.schemaVersion === 'warforge-simulator-manifest/v1', 'manifest.json: schemaVersion incompatible');
  assert(typeof manifest.version === 'string' && manifest.version.length > 0, 'manifest.json: version requise');
  assert(typeof manifest.engineVersion === 'string' && manifest.engineVersion.length > 0, 'manifest.json: engineVersion requise');
  assert(Array.isArray(manifest.sources) && manifest.sources.length > 0, 'manifest.json: sources requises');
  uniqueStrings(manifest.sources.map((source) => source.id), 'manifest.json.sources');
  for (const source of manifest.sources) {
    assert(typeof source.kind === 'string' && typeof source.title === 'string', `source ${source.id}: kind et title requis`);
    assert(typeof source.version === 'string' && source.version.length > 0, `source ${source.id}: version requise`);
    assert(source.status === 'active' || source.status === 'reference-only' || source.status === 'project-approved', `source ${source.id}: status invalide`);
    if (source.status === 'active') assert(typeof source.effectiveDate === 'string' && source.effectiveDate.length > 0, `source ${source.id}: effectiveDate requise`);
    if (source.kind === 'official-pdf') {
      assert(/^[a-f0-9]{64}$/.test(source.sha256 ?? ''), `source ${source.id}: sha256 requis`);
      assert(source.effectiveDate === null || ISO_DATE.test(source.effectiveDate ?? ''), `source ${source.id}: effectiveDate doit être une date officielle ou null`);
      if (source.effectiveDate === null) assert(ISO_DATE.test(source.retrievedAt ?? ''), `source ${source.id}: retrievedAt requis quand effectiveDate est inconnue`);
      await assertOfficialPdfSource(source);
    }
    if (source.kind === 'official-app-owner-transcription') {
      assert(source.id === OFFICIAL_APP_SUPPLEMENTAL_RULES_SOURCE_ID, `source ${source.id}: identifiant de transcription non pris en charge`);
      assert(source.effectiveDate === null && ISO_DATE.test(source.retrievedAt ?? '') && /^[a-f0-9]{64}$/.test(source.sha256 ?? ''), `source ${source.id}: date et empreinte de transcription requises`);
      assert(source.reviewedBy === 'project-owner' && typeof source.driveFileId === 'string' && source.driveFileId.length > 0, `source ${source.id}: approbation propriétaire et identifiant Drive requis`);
      await assertOfficialAppOwnerTranscriptionSource(source);
    }
  }
  assert(manifest.sources.some((source) => source.id === OFFICIAL_APP_SUPPLEMENTAL_RULES_SOURCE_ID), 'manifest.json: transcription propriétaire des règles supplémentaires requise');
  const officialAppFaqSource = manifest.sources.find((source) => source.id === OFFICIAL_APP_FAQ_SOURCE_ID);
  assert(officialAppFaqSource?.kind === 'official-app-screenshot-archive', 'manifest.json: source FAQ application officielle requise');
  assert(officialAppFaqSource.effectiveDate === null && ISO_DATE.test(officialAppFaqSource.retrievedAt ?? '') && /^[a-f0-9]{64}$/.test(officialAppFaqSource.sha256 ?? ''), 'source FAQ application officielle: snapshot et empreinte requis');
  const { screenshotIds: officialAppFaqScreenshotIds } = await assertOfficialAppScreenshotArchiveSource(officialAppFaqSource, {
    archiveSchema: OFFICIAL_APP_FAQ_ARCHIVE_SCHEMA,
    expectedScreenshotCount: 17
  });
  await assertOfficialAppFaqResource(officialAppFaqSource, officialAppFaqScreenshotIds);

  const officialAppReferencesSource = manifest.sources.find((source) => source.id === OFFICIAL_APP_REFERENCES_SOURCE_ID);
  assert(officialAppReferencesSource?.kind === 'official-app-screenshot-archive', 'manifest.json: source de références application officielle requise');
  assert(officialAppReferencesSource.effectiveDate === null && ISO_DATE.test(officialAppReferencesSource.retrievedAt ?? '') && /^[a-f0-9]{64}$/.test(officialAppReferencesSource.sha256 ?? ''), 'source de références application officielle: snapshot et empreinte requis');
  const { screenshotIds: officialAppReferencesScreenshotIds } = await assertOfficialAppScreenshotArchiveSource(officialAppReferencesSource, {
    archiveSchema: OFFICIAL_APP_REFERENCES_ARCHIVE_SCHEMA,
    expectedScreenshotCount: 24
  });
  await assertOfficialAppReferencesResource(officialAppReferencesSource, officialAppReferencesScreenshotIds);

  const officialAppErrataSource = manifest.sources.find((source) => source.id === OFFICIAL_APP_ERRATA_SOURCE_ID);
  assert(officialAppErrataSource?.kind === 'official-app-screenshot-archive', 'manifest.json: source d’errata application officielle requise');
  assert(officialAppErrataSource.effectiveDate === null && ISO_DATE.test(officialAppErrataSource.retrievedAt ?? '') && /^[a-f0-9]{64}$/.test(officialAppErrataSource.sha256 ?? ''), 'source d’errata application officielle: snapshot et empreinte requis');
  const { screenshotIds: officialAppErrataScreenshotIds } = await assertOfficialAppScreenshotArchiveSource(officialAppErrataSource, {
    archiveSchema: OFFICIAL_APP_ERRATA_ARCHIVE_SCHEMA,
    expectedScreenshotCount: 2
  });
  await assertOfficialAppErrataResource(officialAppErrataSource, officialAppErrataScreenshotIds);

  const approvedGdmSource = manifest.sources.find((source) => source.id === APPROVED_GDM_SOURCE_ID);
  const approvedGdmContext = await assertApprovedGdmMissionArchiveSource(approvedGdmSource ?? {});
  const approvedGdmLayoutSource = manifest.sources.find((source) => source.id === APPROVED_GDM_LAYOUT_SOURCE_ID);
  const approvedGdmLayoutContext = await assertApprovedGdmLayoutImageSource(approvedGdmLayoutSource ?? {});

  const artifactEntries = Object.entries(manifest.artifacts ?? {});
  assertExactKeys(manifest.artifacts, [
    'coverage', 'physicalProfiles', 'scenarios', 'rulepacks', 'fullGameCoverage',
    'closedCompleteGameMission', 'gdmLayoutMeasurements', 'corePocCoverage', 'corePocLayout', 'corePocFixtures'
  ], 'manifest.json.artifacts');
  assert(artifactEntries.length === 10, 'manifest.json: dix artefacts contractuels requis');
  const loaded = new Map();
  for (const [, filename] of artifactEntries) {
    assert(typeof filename === 'string' && !filename.includes('..'), 'manifest.json: chemin d’artefact invalide');
    const document = await readJson(dataDirectory, filename);
    assert(document.manifestVersion === manifest.version, `${filename}: manifestVersion incompatible`);
    loaded.set(filename, document);
  }
  await validateM4DraftFacts(dataDirectory, manifest);
  await validateClosedCompleteGameMission(dataDirectory, manifest, approvedGdmContext);

  const coverage = loaded.get(manifest.artifacts.coverage);
  assert(coverage.schemaVersion === 'warforge-simulator-coverage/v1', 'coverage.json: schemaVersion incompatible');
  uniqueStrings(coverage.supportedPhases, 'coverage.supportedPhases');
  uniqueStrings(coverage.supportedRuleIds, 'coverage.supportedRuleIds');
  uniqueStrings(coverage.supportedUnitIds, 'coverage.supportedUnitIds');
  uniqueStrings(coverage.supportedFixtureUnitIds, 'coverage.supportedFixtureUnitIds');
  uniqueStrings(coverage.supportedScenarioIds, 'coverage.supportedScenarioIds');
  uniqueStrings(coverage.supportedWeaponIds, 'coverage.supportedWeaponIds');
  uniqueStrings(coverage.supportedPhysicalProfileIds, 'coverage.supportedPhysicalProfileIds');
  assert(coverage.supportedUnitIds.length === 0, 'coverage: aucun identifiant du catalogue réel n’est autorisé pour ce duel synthétique');

  const physicalProfiles = loaded.get(manifest.artifacts.physicalProfiles);
  const scenarios = loaded.get(manifest.artifacts.scenarios);
  const rulepacks = loaded.get(manifest.artifacts.rulepacks);
  const fullGameCoverage = loaded.get(manifest.artifacts.fullGameCoverage);
  const corePocCoverage = loaded.get(manifest.artifacts.corePocCoverage);
  const corePocLayout = loaded.get(manifest.artifacts.corePocLayout);
  const corePocFixtures = loaded.get(manifest.artifacts.corePocFixtures);
  const gdmLayoutMeasurements = loaded.get(manifest.artifacts.gdmLayoutMeasurements);
  assert(physicalProfiles.schemaVersion === 'warforge-simulator-physical-profiles/v1' && Array.isArray(physicalProfiles.profiles), 'physical-profiles.json: contrat invalide');
  assert(scenarios.schemaVersion === 'warforge-simulator-scenarios/v1' && Array.isArray(scenarios.scenarios), 'scenarios.json: contrat invalide');
  assert(rulepacks.schemaVersion === 'warforge-simulator-rulepacks/v1' && Array.isArray(rulepacks.rulepacks), 'rulepacks.json: contrat invalide');
  await validateGdmLayoutMeasurements(gdmLayoutMeasurements, manifest, approvedGdmLayoutContext, dataDirectory);
  const [officialAppFaq, officialAppReferences, officialAppErrata, officialAppSupplementalRules] = await Promise.all([
    readFile(officialAppFaqPath, 'utf8').then(JSON.parse),
    readFile(officialAppReferencesPath, 'utf8').then(JSON.parse),
    readFile(officialAppErrataPath, 'utf8').then(JSON.parse),
    readFile(officialAppSupplementalRulesPath, 'utf8').then(JSON.parse)
  ]);
  const knownSourceReferencesById = new Map([
    [OFFICIAL_APP_FAQ_SOURCE_ID, new Set(officialAppFaq.entries.map((entry) => entry.id))],
    [OFFICIAL_APP_REFERENCES_SOURCE_ID, new Set(officialAppReferences.sections.map((section) => section.id))],
    [OFFICIAL_APP_ERRATA_SOURCE_ID, new Set(officialAppErrata.entries.map((entry) => entry.id))],
    [OFFICIAL_APP_SUPPLEMENTAL_RULES_SOURCE_ID, new Set(officialAppSupplementalRules.sections.map((section) => section.id))]
  ]);
  validateFullGameCoverage(fullGameCoverage, manifest, knownSourceReferencesById);
  validateCorePocCoverage(corePocCoverage, manifest);
  validateCorePocLayout(corePocLayout, gdmLayoutMeasurements, manifest);
  validateCorePocFixtures(corePocFixtures, corePocCoverage, physicalProfiles, manifest);
  assertNoCatalogIdentity(manifest, 'manifest.json');
  assertNoCatalogIdentity(coverage, 'coverage.json', '', new Set(['supportedUnitIds']));
  assertNoCatalogIdentity(physicalProfiles, 'physical-profiles.json');
  assertNoCatalogIdentity(scenarios, 'scenarios.json');
  assertNoCatalogIdentity(rulepacks, 'rulepacks.json');
  assertNoCatalogIdentity(gdmLayoutMeasurements, 'gdm-2026-layout-measurements.json');
  assertNoCatalogIdentity(corePocCoverage, 'core-poc-coverage.json', '', new Set([
    'catalogPolicy.supportedUnitIds'
  ]));
  assertNoCatalogIdentity(corePocLayout, 'core-poc-layout.json');
  assertNoCatalogIdentity(corePocFixtures, 'core-poc-fixtures.json');

  const profileIds = physicalProfiles.profiles.map((profile) => profile.id);
  const scenarioIds = scenarios.scenarios.map((scenario) => scenario.id);
  const rulepackIds = rulepacks.rulepacks.map((rulepack) => rulepack.id);
  uniqueStrings(profileIds, 'physicalProfiles.profiles');
  uniqueStrings(scenarioIds, 'scenarios.scenarios');
  uniqueStrings(rulepackIds, 'rulepacks.rulepacks');
  const sourceIds = manifest.sources.map((source) => source.id);
  assert(Array.isArray(physicalProfiles.conventions), 'physical-profiles.json: registre de conventions requis');
  const conventionIds = physicalProfiles.conventions.map((convention) => convention.id);
  uniqueStrings(conventionIds, 'physicalProfiles.conventions');
  const approvedConvention = physicalProfiles.conventions.find((convention) => convention.id === APPROVED_CONVENTION_ID);
  assert(approvedConvention?.kind === 'local-reviewed-decision', `convention ${APPROVED_CONVENTION_ID}: décision locale requise`);
  assert(approvedConvention?.version === '1.0.0' && approvedConvention?.effectiveDate === '2026-08-13', `convention ${APPROVED_CONVENTION_ID}: version et date requises`);
  assert(approvedConvention?.decisionReference === 'ADR-002-spatial-model', `convention ${APPROVED_CONVENTION_ID}: référence de décision incorrecte`);
  assert(approvedConvention?.scope === APPROVED_SCENARIO_ID, `convention ${APPROVED_CONVENTION_ID}: portée incorrecte`);
  assert(approvedConvention?.reviewedBy === 'project-owner' && approvedConvention?.reviewedAt === '2026-08-13', `convention ${APPROVED_CONVENTION_ID}: approbation incorrecte`);
  for (const profile of physicalProfiles.profiles) {
    assert(profile.shape?.kind === 'circle' || profile.shape?.kind === 'capsule' || profile.shape?.kind === 'polygon', `profil ${profile.id}: forme invalide`);
    assert(Number.isInteger(profile.height) && profile.height > 0, `profil ${profile.id}: hauteur entière positive requise`);
    assert(profile.provenance && typeof profile.provenance.version === 'string' && typeof profile.provenance.effectiveDate === 'string', `profil ${profile.id}: provenance versionnée requise`);
    if (profile.provenance.kind === 'warforge-convention') {
      assert(profile.reviewStatus === 'pending-human-review' || profile.reviewStatus === 'human-reviewed', `profil ${profile.id}: revue de convention requise`);
      const convention = physicalProfiles.conventions.find((candidate) => candidate.id === profile.provenance.sourceId);
      assert(convention, `profil ${profile.id}: convention orpheline ${profile.provenance.sourceId}`);
      assert(profile.provenance.version === convention.version && profile.provenance.effectiveDate === convention.effectiveDate, `profil ${profile.id}: provenance incohérente avec ${convention.id}`);
    }
  }
  const knownRuleIds = new Set();
  let coverRule;
  for (const rulepack of rulepacks.rulepacks) {
    knownRuleIds.add(rulepack.id);
    uniqueStrings(rulepack.sourceIds, `rulepack ${rulepack.id}.sourceIds`);
    uniqueStrings(rulepack.ruleIds, `rulepack ${rulepack.id}.ruleIds`);
    for (const sourceId of rulepack.sourceIds) assert(sourceIds.includes(sourceId), `rulepack ${rulepack.id}: source orpheline ${sourceId}`);
    for (const ruleId of rulepack.ruleIds) {
      assert(!knownRuleIds.has(ruleId), `rulepacks: règle dupliquée ${ruleId}`);
      knownRuleIds.add(ruleId);
    }
    for (const rule of rulepack.rules ?? []) {
      assert(rulepack.ruleIds.includes(rule.id), `rulepack ${rulepack.id}: définition de règle non déclarée ${rule.id}`);
      if (rule.id === COVER_RULE_ID) coverRule = rule;
    }
  }

  const coverSource = manifest.sources.find((source) => source.id === COVER_SOURCE_ID);
  assert(coverSource, `manifest.json: source de couvert absente ${COVER_SOURCE_ID}`);
  assert(coverRule, `rulepacks: définition absente ${COVER_RULE_ID}`);
  assertExactKeys(coverRule, ['id', 'title', 'source', 'trigger', 'conditions', 'effect'], COVER_RULE_ID);
  assert(coverRule.title === 'Bénéfice du Couvert', `${COVER_RULE_ID}: titre exact requis`);
  assertExactKeys(coverRule.source, ['sourceId', 'version', 'effectiveDate', 'retrievedAt', 'reference', 'printedPage'], `${COVER_RULE_ID}.source`);
  assert(coverRule.source?.sourceId === coverSource.id, `${COVER_RULE_ID}: sourceId incorrect`);
  assert(coverRule.source?.version === coverSource.version, `${COVER_RULE_ID}: version de source incorrecte`);
  assert(coverRule.source?.effectiveDate === coverSource.effectiveDate, `${COVER_RULE_ID}: date d’effet de source incorrecte`);
  assert(coverRule.source?.retrievedAt === coverSource.retrievedAt, `${COVER_RULE_ID}: date de snapshot incorrecte`);
  assert(coverRule.source?.reference === COVER_REFERENCE, `${COVER_RULE_ID}: référence ${COVER_REFERENCE} requise`);
  assert(coverRule.source?.printedPage === COVER_PRINTED_PAGE, `${COVER_RULE_ID}: page imprimée ${COVER_PRINTED_PAGE} requise`);
  assert(rulepacks.rulepacks.some((rulepack) => rulepack.ruleIds.includes(COVER_RULE_ID) && rulepack.sourcePages.includes(COVER_PRINTED_PAGE)), `${COVER_RULE_ID}: page source absente du rulepack`);
  assert(coverRule.trigger === 'ranged-attack-targeting', `${COVER_RULE_ID}: trigger ranged-attack-targeting requis`);
  assertExactKeys(coverRule.conditions, ['allTargetModelsMatchAny'], `${COVER_RULE_ID}.conditions`);
  const coverBranches = coverRule.conditions.allTargetModelsMatchAny;
  assert(Array.isArray(coverBranches) && coverBranches.length === 2, `${COVER_RULE_ID}: exactement deux branches de couvert requises`);
  assertExactKeys(coverBranches[0], ['keywordsAny', 'insideTerrainZone'], `${COVER_RULE_ID}.conditions[0]`);
  assert(Array.isArray(coverBranches[0].keywordsAny)
    && coverBranches[0].keywordsAny.length === 3
    && coverBranches[0].keywordsAny.every((keyword, index) => keyword === ['INFANTRY', 'BEAST', 'SWARM'][index]),
  `${COVER_RULE_ID}: mots-clés INFANTRY/BEAST/SWARM exacts requis`);
  assert(coverBranches[0].insideTerrainZone === true, `${COVER_RULE_ID}: insideTerrainZone true requis`);
  assertExactKeys(coverBranches[1], ['notEntirelyVisibleDueToTerrain'], `${COVER_RULE_ID}.conditions[1]`);
  assert(coverBranches[1].notEntirelyVisibleDueToTerrain === true, `${COVER_RULE_ID}: notEntirelyVisibleDueToTerrain true requis`);
  assertExactKeys(coverRule.effect, ['kind', 'characteristic', 'amount'], `${COVER_RULE_ID}.effect`);
  assert(coverRule.effect?.kind === 'degrade-characteristic', `${COVER_RULE_ID}: effet de dégradation requis`);
  assert(coverRule.effect?.characteristic === 'ballistic-skill', `${COVER_RULE_ID}: la CT doit être dégradée`);
  assert(coverRule.effect?.amount === 1, `${COVER_RULE_ID}: dégradation de CT de 1 requise`);
  assertExactKeysAbsent(coverRule, /(?:save.*bonus|bonus.*save|coverSaveBonus|saveModifier)/i, COVER_RULE_ID);
  await assertOfficialCoverSource();

  assert(Array.isArray(scenarios.fixtureUnitTemplates), 'scenarios.fixtureUnitTemplates: tableau requis');
  assert(Array.isArray(scenarios.fixtureUnits), 'scenarios.fixtureUnits: tableau requis');
  const fixtureTemplateIds = scenarios.fixtureUnitTemplates.map((template) => template.id);
  const fixtureUnitIds = scenarios.fixtureUnits.map((fixture) => fixture.id);
  uniqueStrings(fixtureTemplateIds, 'scenarios.fixtureUnitTemplates');
  uniqueStrings(fixtureUnitIds, 'scenarios.fixtureUnits');
  assert(scenarios.fixtureUnits.length === 2, 'scenarios.fixtureUnits: exactement deux unités synthétiques requises');
  assert(scenarios.fixtureUnits.every((fixture, index) => fixture.id === APPROVED_FIXTURE_IDS[index]), 'scenarios.fixtureUnits: identifiants rouge/bleu exacts requis');
  for (const template of scenarios.fixtureUnitTemplates) {
    assert(profileIds.includes(template.physicalProfileId), `template ${template.id}: profil physique orphelin ${template.physicalProfileId}`);
    assert(template.physicalProfileId === APPROVED_PROFILE_ID, `template ${template.id}: profil physique approuvé requis`);
    assert(template.characteristics?.movement === 6 * 254, `template ${template.id}: M 6\" requis`);
    assert(template.characteristics?.toughness === 4, `template ${template.id}: E 4 requise`);
    assert(template.characteristics?.save === 3, `template ${template.id}: Sv 3+ requise`);
    assert(template.characteristics?.wounds === 2, `template ${template.id}: PV 2 requis`);
    assert(Array.isArray(template.keywords) && template.keywords.includes('INFANTRY'), `template ${template.id}: mot-clé INFANTRY requis pour 13.08`);
    assert(Array.isArray(template.weapons) && template.weapons.length === 1, `template ${template.id}: un fusil requis`);
    const weapon = template.weapons[0];
    assert(weapon.range === 24 * 254 && weapon.attacks === 2 && weapon.ballisticSkill === 3
      && weapon.strength === 4 && weapon.armourPenetration === -1 && weapon.damage === 1,
    `template ${template.id}: profil de fusil 24\" A2 CT3+ F4 PA-1 D1 requis`);
  }
  for (const fixture of scenarios.fixtureUnits) {
    assert(fixture.subjectType === 'fixture-unit', `fixture ${fixture.id}: subjectType fixture-unit requis`);
    assert(fixture.status === 'ready', `fixture ${fixture.id}: status ready requis`);
    assert(fixture.modelCount === 5, `fixture ${fixture.id}: cinq figurines requises`);
    assert(fixtureTemplateIds.includes(fixture.templateId), `fixture ${fixture.id}: template orphelin ${fixture.templateId}`);
  }
  assert(new Set(scenarios.fixtureUnits.map((fixture) => fixture.templateId)).size === 1, 'scenarios.fixtureUnits: les deux unités doivent être identiques');

  const approvedProfile = physicalProfiles.profiles.find((profile) => profile.id === APPROVED_PROFILE_ID);
  assert(approvedProfile?.shape?.kind === 'circle' && approvedProfile.shape.radius === 160, `profil ${APPROVED_PROFILE_ID}: socle de 32 mm requis`);
  assert(approvedProfile?.height === 400, `profil ${APPROVED_PROFILE_ID}: convention de hauteur 40 mm requise`);
  assert(approvedProfile?.provenance?.kind === 'warforge-convention', `profil ${APPROVED_PROFILE_ID}: doit rester une convention Warforge`);
  assert(approvedProfile?.provenance?.sourceId === APPROVED_CONVENTION_ID, `profil ${APPROVED_PROFILE_ID}: registre de convention incorrect`);
  assert(approvedProfile?.reviewStatus === 'human-reviewed', `profil ${APPROVED_PROFILE_ID}: revue humaine requise`);
  assert(approvedProfile?.approval?.scope === APPROVED_SCENARIO_ID, `profil ${APPROVED_PROFILE_ID}: portée d’approbation incorrecte`);
  assert(approvedProfile?.approval?.reviewedBy === 'project-owner', `profil ${APPROVED_PROFILE_ID}: reviewer incorrect`);
  assert(approvedProfile?.approval?.reviewedAt === '2026-08-13', `profil ${APPROVED_PROFILE_ID}: date de revue incorrecte`);

  for (const scenario of scenarios.scenarios) {
    uniqueStrings(scenario.physicalProfileIds, `scenario ${scenario.id}.physicalProfileIds`);
    uniqueStrings(scenario.rulepackIds, `scenario ${scenario.id}.rulepackIds`);
    for (const profileId of scenario.physicalProfileIds) assert(profileIds.includes(profileId), `scenario ${scenario.id}: profil orphelin ${profileId}`);
    for (const rulepackId of scenario.rulepackIds) assert(rulepackIds.includes(rulepackId), `scenario ${scenario.id}: rulepack orphelin ${rulepackId}`);
    assert(Array.isArray(scenario.players), `scenario ${scenario.id}: joueurs requis`);
    for (const player of scenario.players) {
      assert(fixtureUnitIds.includes(player.fixtureUnitId), `scenario ${scenario.id}: fixture orpheline ${player.fixtureUnitId}`);
      const fixture = scenarios.fixtureUnits.find((candidate) => candidate.id === player.fixtureUnitId);
      assert(Array.isArray(player.modelPositions) && player.modelPositions.length === fixture.modelCount, `scenario ${scenario.id}: positions incohérentes pour ${player.fixtureUnitId}`);
    }
  }
  const duel = scenarios.scenarios.find((scenario) => scenario.id === APPROVED_SCENARIO_ID);
  assert(duel, `scenario ${APPROVED_SCENARIO_ID}: scénario requis`);
  assert(duel.players.length === 2
    && duel.players[0].id === 'red' && duel.players[0].fixtureUnitId === APPROVED_FIXTURE_IDS[0]
    && duel.players[1].id === 'blue' && duel.players[1].fixtureUnitId === APPROVED_FIXTURE_IDS[1],
  `scenario ${APPROVED_SCENARIO_ID}: joueurs et fixtures exacts requis`);
  assert(duel.status === 'covered', `scenario ${APPROVED_SCENARIO_ID}: statut covered requis`);
  assert(typeof duel.acceptance === 'string' && !/(?:bloqu|draft|hors couverture|jusqu)/i.test(duel.acceptance), `scenario ${APPROVED_SCENARIO_ID}: texte d'acceptation contradictoire`);
  const duelRulepacks = duel.rulepackIds.map((id) => rulepacks.rulepacks.find((rulepack) => rulepack.id === id));
  assert(duelRulepacks.every((rulepack) => rulepack?.status === 'covered'), `scenario ${APPROVED_SCENARIO_ID}: rulepack covered requis`);
  const lightZone = duel.terrainZones?.find((zone) => zone.id === 'light-cover-zone-v1');
  assert(lightZone?.terrainType === 'light', `scenario ${APPROVED_SCENARIO_ID}: zone de terrain léger requise`);
  assert(Array.isArray(lightZone?.footprint) && lightZone.footprint.length >= 3, `scenario ${APPROVED_SCENARIO_ID}: empreinte de terrain requise`);
  assert(lightZone?.ruleIds?.includes(COVER_RULE_ID), `scenario ${APPROVED_SCENARIO_ID}: la zone doit référencer ${COVER_RULE_ID}`);
  assert(typeof lightZone?.visual?.label === 'string' && lightZone.visual.label.length > 0 && lightZone.visual.opacity > 0, `scenario ${APPROVED_SCENARIO_ID}: zone de couvert visiblement décrite requise`);
  const coveredPlayer = duel.players.find((player) => player.id === 'blue');
  assert(coveredPlayer?.modelPositions.every((position) => pointInPolygon(position, lightZone.footprint)), `scenario ${APPROVED_SCENARIO_ID}: l’unité blue doit être dans la zone de couvert`);

  for (const id of coverage.supportedRuleIds) assert(knownRuleIds.has(id), `coverage: règle orpheline ${id}`);
  for (const id of coverage.supportedFixtureUnitIds) assert(fixtureUnitIds.includes(id), `coverage: fixture orpheline ${id}`);
  for (const id of coverage.supportedScenarioIds) assert(scenarioIds.includes(id), `coverage: scénario orphelin ${id}`);
  assert(coverage.supportedFixtureUnitIds.length === fixtureUnitIds.length, 'coverage: toutes les fixtures prêtes doivent être déclarées');
  const weaponIds = scenarios.fixtureUnitTemplates.flatMap((template) => template.weapons.map((weapon) => weapon.id));
  assert(coverage.supportedPhysicalProfileIds.every((id) => profileIds.includes(id)), 'coverage: profil physique orphelin');
  assert(coverage.supportedWeaponIds.every((id) => weaponIds.includes(id)), 'coverage: arme orpheline');
  assert(coverage.status === 'closed-duel-covered', 'coverage: statut de duel fermé requis');
  assert(coverage.limitations.every((text) => !/(?:bloqu|draft|hors couverture|jusqu)/i.test(text)), 'coverage: limitation contradictoire avec le statut couvert');
  assert(coverage.supportedScenarioIds.length === 1 && coverage.supportedScenarioIds[0] === APPROVED_SCENARIO_ID, 'coverage: scénario fermé couvert requis');
  assert(coverage.supportedRuleIds.length === 1 && coverage.supportedRuleIds[0] === 'core-basic-shooting-v1', 'coverage: rulepack fermé couvert requis');
  assert(coverage.supportedWeaponIds.length === 1 && coverage.supportedWeaponIds[0] === APPROVED_WEAPON_ID, 'coverage: fusil fermé couvert requis');
  assert(coverage.supportedPhysicalProfileIds.length === 1 && coverage.supportedPhysicalProfileIds[0] === APPROVED_PROFILE_ID, 'coverage: profil fermé couvert requis');

  const files = ['manifest.json', ...artifactEntries.map(([, filename]) => filename)];
  if (validatePublicMirror) {
    for (const filename of files) {
      const [sourceRaw, publicRaw] = await Promise.all([
        readFile(resolve(dataDirectory, filename), 'utf8'),
        readFile(resolve(publicDirectory, filename), 'utf8')
      ]);
      assert(sourceRaw === publicRaw, `public/data/simulator/${filename}: miroir généré désynchronisé`);
    }
  }

  return { manifest, files };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  validateSimulatorData()
    .then(({ manifest }) => console.log(`Données simulateur ${manifest.version} valides.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
