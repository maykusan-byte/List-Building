import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

const appDirectory = resolve(import.meta.dirname, '..');
const referencesDirectory = resolve(appDirectory, '../references');
const defaultDataDirectory = resolve(import.meta.dirname, '../data/simulator');
const defaultPublicDirectory = resolve(import.meta.dirname, '../public/data/simulator');
const coreRulesPath = resolve(import.meta.dirname, '../data/rules/core-rules-fr.json');

const COVER_RULE_ID = 'core.benefit-of-cover';
const COVER_SOURCE_ID = 'warforge-core-rules-fr-2026-07';
const COVER_REFERENCE = '13.08';
const COVER_PRINTED_PAGE = 50;
const APPROVED_SCENARIO_ID = 'closed-core-shooting-duel-v1';
const APPROVED_PROFILE_ID = 'training-infantry-32mm-v1';
const APPROVED_CONVENTION_ID = 'closed-core-infantry-geometry-v1';
const APPROVED_WEAPON_ID = 'closed-core-training-rifle-v1';
const APPROVED_FIXTURE_IDS = ['closed-core-red-unit-v1', 'closed-core-blue-unit-v1'];
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

function uniqueStrings(values, label) {
  assert(Array.isArray(values), `${label}: tableau requis`);
  assert(values.every((value) => typeof value === 'string' && value.length > 0), `${label}: identifiants non vides requis`);
  assert(new Set(values).size === values.length, `${label}: doublon détecté`);
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

  const artifactEntries = Object.entries(manifest.artifacts ?? {});
  assert(artifactEntries.length === 4, 'manifest.json: quatre artefacts contractuels requis');
  const loaded = new Map();
  for (const [, filename] of artifactEntries) {
    assert(typeof filename === 'string' && !filename.includes('..'), 'manifest.json: chemin d’artefact invalide');
    const document = await readJson(dataDirectory, filename);
    assert(document.manifestVersion === manifest.version, `${filename}: manifestVersion incompatible`);
    loaded.set(filename, document);
  }

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
