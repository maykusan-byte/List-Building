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
const APPROVED_SCENARIO_ID = 'closed-core-shooting-duel-v1';
const APPROVED_PROFILE_ID = 'training-infantry-32mm-v1';
const APPROVED_CONVENTION_ID = 'closed-core-infantry-geometry-v1';
const APPROVED_WEAPON_ID = 'closed-core-training-rifle-v1';
const APPROVED_FIXTURE_IDS = ['closed-core-red-unit-v1', 'closed-core-blue-unit-v1'];
const M4_DRAFT_FILENAME = 'm4-real-roster-facts.json';
const M4_DRAFT_SCHEMA = 'warforge-simulator-m4-real-roster-facts/v2';
const M4_SCENARIO_ID = 'real-roster-shooting-duel-v1';
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
    assertExactKeys(unitFact.characteristics, ['movement', 'toughness', 'save', 'wounds', 'invulnerableSave'], `${label}.characteristics`);
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
    assertSameJson(unitFact.excludedCharacteristics?.map(({ name, sourceValue }) => ({ name, sourceValue })), [
      { name: 'Leadership', sourceValue: statline.Leadership },
      { name: 'OC', sourceValue: statline.OC }
    ], `${label}.excludedCharacteristics`);
    assert(unitFact.excludedCharacteristics.every((entry) => typeof entry.reason === 'string' && entry.reason.length > 0), `${label}: raison d'exclusion de caractéristique requise`);
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
    assert(source.status === 'active' || source.status === 'reference-only', `source ${source.id}: status invalide`);
    if (source.status === 'active') assert(typeof source.effectiveDate === 'string' && source.effectiveDate.length > 0, `source ${source.id}: effectiveDate requise`);
    if (source.kind === 'official-pdf') {
      assert(/^[a-f0-9]{64}$/.test(source.sha256 ?? ''), `source ${source.id}: sha256 requis`);
      assert(source.effectiveDate === null || ISO_DATE.test(source.effectiveDate ?? ''), `source ${source.id}: effectiveDate doit être une date officielle ou null`);
      if (source.effectiveDate === null) assert(ISO_DATE.test(source.retrievedAt ?? ''), `source ${source.id}: retrievedAt requis quand effectiveDate est inconnue`);
      await assertOfficialPdfSource(source);
    }
  }
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

  const artifactEntries = Object.entries(manifest.artifacts ?? {});
  assert(artifactEntries.length === 4, 'manifest.json: quatre artefacts contractuels requis');
  const loaded = new Map();
  for (const [, filename] of artifactEntries) {
    assert(typeof filename === 'string' && !filename.includes('..'), 'manifest.json: chemin d’artefact invalide');
    const document = await readJson(dataDirectory, filename);
    assert(document.manifestVersion === manifest.version, `${filename}: manifestVersion incompatible`);
    loaded.set(filename, document);
  }
  await validateM4DraftFacts(dataDirectory, manifest);

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
  assert(physicalProfiles.schemaVersion === 'warforge-simulator-physical-profiles/v1' && Array.isArray(physicalProfiles.profiles), 'physical-profiles.json: contrat invalide');
  assert(scenarios.schemaVersion === 'warforge-simulator-scenarios/v1' && Array.isArray(scenarios.scenarios), 'scenarios.json: contrat invalide');
  assert(rulepacks.schemaVersion === 'warforge-simulator-rulepacks/v1' && Array.isArray(rulepacks.rulepacks), 'rulepacks.json: contrat invalide');
  assertNoCatalogIdentity(manifest, 'manifest.json');
  assertNoCatalogIdentity(coverage, 'coverage.json', '', new Set(['supportedUnitIds']));
  assertNoCatalogIdentity(physicalProfiles, 'physical-profiles.json');
  assertNoCatalogIdentity(scenarios, 'scenarios.json');
  assertNoCatalogIdentity(rulepacks, 'rulepacks.json');

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
