import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const STRATEGY_KNOWLEDGE_SCHEMA = 'warforge-strategy-knowledge/v1';

const IDENTIFIER = /^[a-z][a-z0-9-]{2,80}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AXES = new Set([
  'primary-scoring',
  'secondary-scoring',
  'board-control',
  'tempo',
  'mobility',
  'durability',
  'damage-projection',
  'resource-efficiency',
  'denial',
  'trading'
]);
const ROLES = new Set([
  'scoring',
  'objective-holder',
  'screen',
  'trade-piece',
  'damage-ranged',
  'damage-melee',
  'transport',
  'support',
  'utility',
  'denial'
]);
const OFFICIAL_SOURCE_KINDS = new Set([
  'official-rule',
  'official-mission',
  'official-points',
  'official-errata'
]);
const META_SOURCE_KINDS = new Set([
  'event-results',
  'community-analysis',
  'playtest'
]);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value) {
  return typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
}

function addRequiredErrors(value, required, path, errors) {
  for (const key of required) {
    if (value[key] === undefined) errors.push(path + '.' + key + ' est requis.');
  }
}

function collectIds(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(path + ' doit être une liste.');
    return new Set();
  }
  const ids = new Set();
  value.forEach((entry, index) => {
    const itemPath = path + '[' + index + ']';
    if (!isRecord(entry) || !IDENTIFIER.test(String(entry.id ?? ''))) {
      errors.push(itemPath + '.id doit être un identifiant kebab-case unique.');
      return;
    }
    if (ids.has(entry.id)) errors.push(itemPath + '.id est dupliqué.');
    ids.add(entry.id);
  });
  return ids;
}

function validateSourceIds(value, path, knownSourceIds, errors, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum || !value.every((id) => typeof id === 'string' && IDENTIFIER.test(id))) {
    errors.push(path + ' doit contenir ' + (minimum === 0 ? 'des' : 'au moins une') + ' référence(s) source valide(s).');
    return [];
  }
  if (new Set(value).size !== value.length) errors.push(path + ' ne peut pas contenir de doublon.');
  value.forEach((id) => {
    if (!knownSourceIds.has(id)) errors.push(path + ' référence une source inconnue : ' + id + '.');
  });
  return value;
}

function validateTextList(value, path, errors, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum || !value.every(hasText)) {
    errors.push(path + ' doit être une liste de textes' + (minimum > 0 ? ' non vide' : '') + '.');
  }
}

function validateCompatibility(value, errors) {
  if (!isRecord(value)) {
    errors.push('compatibility doit être un objet.');
    return;
  }
  addRequiredErrors(value, ['gameEdition', 'catalogSchema', 'catalogDataVersion', 'missionPackIds'], 'compatibility', errors);
  if (value.gameEdition !== '11th') errors.push('compatibility.gameEdition doit être 11th.');
  if (value.catalogSchema !== 'warforge-catalog/v2') errors.push('compatibility.catalogSchema doit être warforge-catalog/v2.');
  if (value.catalogDataVersion !== null && !hasText(value.catalogDataVersion)) errors.push('compatibility.catalogDataVersion doit être une version ou null.');
  if (!Array.isArray(value.missionPackIds) || !value.missionPackIds.every((id) => typeof id === 'string' && IDENTIFIER.test(id))) {
    errors.push('compatibility.missionPackIds doit être une liste d’identifiants.');
  } else if (new Set(value.missionPackIds).size !== value.missionPackIds.length) {
    errors.push('compatibility.missionPackIds ne peut pas contenir de doublon.');
  }
}

function validateSources(sources, errors) {
  const sourceIds = collectIds(sources, 'sources', errors);
  if (!Array.isArray(sources)) return { sourceIds, sourceById: new Map() };
  const sourceById = new Map();

  sources.forEach((source, index) => {
    const path = 'sources[' + index + ']';
    if (!isRecord(source)) {
      errors.push(path + ' doit être un objet.');
      return;
    }
    sourceById.set(source.id, source);
    addRequiredErrors(source, ['id', 'kind', 'authority', 'title', 'publishedAt', 'retrievedAt', 'sha256'], path, errors);
    const kinds = new Set([...OFFICIAL_SOURCE_KINDS, ...META_SOURCE_KINDS]);
    if (!kinds.has(source.kind)) errors.push(path + '.kind est invalide.');
    if (!['official', 'event-organizer', 'community', 'internal'].includes(source.authority)) errors.push(path + '.authority est invalide.');
    if (OFFICIAL_SOURCE_KINDS.has(source.kind) && source.authority !== 'official') errors.push(path + ' doit avoir authority: official.');
    if (!hasText(source.title)) errors.push(path + '.title est requis.');
    if (!isDate(source.publishedAt)) errors.push(path + '.publishedAt doit être une date ISO.');
    if (!isDate(source.retrievedAt)) errors.push(path + '.retrievedAt doit être une date ISO.');
    if (!SHA256.test(String(source.sha256 ?? ''))) errors.push(path + '.sha256 doit être une empreinte SHA-256.');
    const hasUrl = hasText(source.url);
    const hasPath = hasText(source.relativePath);
    if (hasUrl === hasPath) errors.push(path + ' doit avoir exactement un de url ou relativePath.');
    if (source.archivePath !== undefined && !hasText(source.archivePath)) errors.push(path + '.archivePath doit être une chaîne non vide.');
  });
  return { sourceIds, sourceById };
}

function validateAxisRatings(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(path + ' doit contenir au moins une évaluation.');
    return;
  }
  const axes = new Set();
  value.forEach((rating, index) => {
    const ratingPath = path + '[' + index + ']';
    if (!isRecord(rating) || !AXES.has(rating.axis) || !Number.isInteger(rating.score) || rating.score < 0 || rating.score > 4 || !hasText(rating.rationale)) {
      errors.push(ratingPath + ' doit contenir axis, score 0–4 et rationale.');
      return;
    }
    if (axes.has(rating.axis)) errors.push(ratingPath + '.axis est dupliqué.');
    axes.add(rating.axis);
  });
}

function validateScenario(value, path, sourceIds, compatibility, errors) {
  if (!isRecord(value)) {
    errors.push(path + ' doit être un objet.');
    return;
  }
  addRequiredErrors(value, ['id', 'title', 'missionPackId', 'scoringWindows', 'victoryAxes', 'sourceIds', 'confidence', 'status'], path, errors);
  if (!hasText(value.title) || !IDENTIFIER.test(String(value.missionPackId ?? ''))) errors.push(path + '.title et missionPackId sont requis.');
  if (Array.isArray(compatibility?.missionPackIds) && !compatibility.missionPackIds.includes(value.missionPackId)) errors.push(path + '.missionPackId n’est pas épinglé dans compatibility.');
  validateTextList(value.scoringWindows, path + '.scoringWindows', errors, 1);
  if (!Array.isArray(value.victoryAxes) || value.victoryAxes.length === 0 || !value.victoryAxes.every((axis) => AXES.has(axis))) errors.push(path + '.victoryAxes doit contenir des axes valides.');
  validateSourceIds(value.sourceIds, path + '.sourceIds', sourceIds, errors);
  if (!['low', 'medium', 'high'].includes(value.confidence)) errors.push(path + '.confidence est invalide.');
  if (!['draft', 'needs-review', 'reviewed'].includes(value.status)) errors.push(path + '.status est invalide.');
  if (value.limitations !== undefined) validateTextList(value.limitations, path + '.limitations', errors);
}

function validateProfile(value, path, sourceIds, kind, compatibility, errors) {
  if (!isRecord(value)) {
    errors.push(path + ' doit être un objet.');
    return;
  }
  const referenceField = kind === 'unit' ? 'unitId' : 'detachmentId';
  const referencePattern = kind === 'unit' ? /^book-.+:unit:\d+$/ : /^book-.+:detachment:\d+$/;
  addRequiredErrors(value, ['id', referenceField, 'catalogDataVersion', 'roles', 'axisRatings', 'summary', 'limitations', 'sourceIds', 'confidence', 'status'], path, errors);
  if (!referencePattern.test(String(value[referenceField] ?? ''))) errors.push(path + '.' + referenceField + ' doit être un identifiant de catalogue normalisé.');
  if (!hasText(value.catalogDataVersion)) errors.push(path + '.catalogDataVersion est requis.');
  if (hasText(compatibility?.catalogDataVersion) && value.catalogDataVersion !== compatibility.catalogDataVersion) errors.push(path + '.catalogDataVersion doit correspondre à compatibility.catalogDataVersion.');
  if (!Array.isArray(value.roles) || value.roles.length === 0 || !value.roles.every((role) => ROLES.has(role))) errors.push(path + '.roles doit contenir des rôles valides.');
  validateAxisRatings(value.axisRatings, path + '.axisRatings', errors);
  if (!hasText(value.summary)) errors.push(path + '.summary est requis.');
  validateTextList(value.limitations, path + '.limitations', errors, 1);
  validateSourceIds(value.sourceIds, path + '.sourceIds', sourceIds, errors);
  if (!['low', 'medium', 'high'].includes(value.confidence)) errors.push(path + '.confidence est invalide.');
  if (!['draft', 'needs-review', 'reviewed'].includes(value.status)) errors.push(path + '.status est invalide.');
}

function validateSynergy(value, path, sourceIds, sourceById, errors) {
  if (!isRecord(value)) {
    errors.push(path + ' doit être un objet.');
    return;
  }
  addRequiredErrors(value, ['id', 'title', 'participants', 'claim', 'preconditions', 'timing', 'counterplay', 'tradeoffs', 'axisEffects', 'evidenceKind', 'sourceIds', 'confidence', 'status'], path, errors);
  if (!hasText(value.title) || !hasText(value.claim)) errors.push(path + '.title et claim sont requis.');
  if (!Array.isArray(value.participants) || value.participants.length < 2 || !value.participants.every((entry) => isRecord(entry) && ['unit', 'detachment', 'stratagem', 'enhancement'].includes(entry.kind) && hasText(entry.reference))) {
    errors.push(path + '.participants doit contenir au moins deux références typées.');
  }
  validateTextList(value.preconditions, path + '.preconditions', errors);
  validateTextList(value.timing, path + '.timing', errors);
  validateTextList(value.counterplay, path + '.counterplay', errors);
  validateTextList(value.tradeoffs, path + '.tradeoffs', errors);
  if (!Array.isArray(value.axisEffects) || value.axisEffects.length === 0 || !value.axisEffects.every((entry) => isRecord(entry) && AXES.has(entry.axis) && ['improves', 'enables', 'requires', 'risks'].includes(entry.effect))) {
    errors.push(path + '.axisEffects doit contenir des effets d’axe valides.');
  }
  const linkedSources = validateSourceIds(value.sourceIds, path + '.sourceIds', sourceIds, errors);
  if (!['rules-supported', 'tested', 'hypothesis'].includes(value.evidenceKind)) errors.push(path + '.evidenceKind est invalide.');
  if (value.evidenceKind === 'rules-supported' && !linkedSources.some((id) => OFFICIAL_SOURCE_KINDS.has(sourceById.get(id)?.kind))) errors.push(path + ' doit citer une source officielle pour evidenceKind rules-supported.');
  if (value.evidenceKind === 'tested' && !linkedSources.some((id) => META_SOURCE_KINDS.has(sourceById.get(id)?.kind))) errors.push(path + ' doit citer une source de test ou de résultats pour evidenceKind tested.');
  if (value.evidenceKind === 'hypothesis' && value.status !== 'needs-review') errors.push(path + ' hypothétique doit avoir status needs-review.');
  if (!['low', 'medium', 'high'].includes(value.confidence)) errors.push(path + '.confidence est invalide.');
  if (!['draft', 'needs-review', 'reviewed'].includes(value.status)) errors.push(path + '.status est invalide.');
}

function validateMetaSnapshot(value, path, sourceIds, sourceById, errors) {
  if (!isRecord(value)) {
    errors.push(path + ' doit être un objet.');
    return;
  }
  addRequiredErrors(value, ['id', 'title', 'period', 'format', 'method', 'sampleDescription', 'metrics', 'limitations', 'sourceIds', 'status'], path, errors);
  if (!hasText(value.title) || !hasText(value.format) || !hasText(value.method) || !hasText(value.sampleDescription)) errors.push(path + ' doit décrire titre, format, méthode et échantillon.');
  if (!isRecord(value.period) || !isDate(value.period.from) || !isDate(value.period.to) || value.period.from > value.period.to) errors.push(path + '.period doit contenir from et to dans l’ordre.');
  if (!isRecord(value.metrics) || Object.keys(value.metrics).length === 0) errors.push(path + '.metrics doit contenir au moins une mesure.');
  validateTextList(value.limitations, path + '.limitations', errors, 1);
  const linkedSources = validateSourceIds(value.sourceIds, path + '.sourceIds', sourceIds, errors);
  if (!linkedSources.some((id) => META_SOURCE_KINDS.has(sourceById.get(id)?.kind))) errors.push(path + ' doit citer des résultats, une analyse communautaire ou un playtest.');
  if (!['draft', 'needs-review', 'reviewed'].includes(value.status)) errors.push(path + '.status est invalide.');
}

function validateRecommendation(value, path, sourceIds, scenarioIds, synergyIds, snapshotIds, synergiesById, errors) {
  if (!isRecord(value)) {
    errors.push(path + ' doit être un objet.');
    return;
  }
  addRequiredErrors(value, ['id', 'title', 'kind', 'scope', 'statement', 'sourceIds', 'confidence', 'tradeoffs', 'limitations', 'reviewBy', 'status'], path, errors);
  if (!hasText(value.title) || !hasText(value.statement)) errors.push(path + '.title et statement sont requis.');
  if (!['list-construction', 'play-pattern', 'matchup-plan'].includes(value.kind)) errors.push(path + '.kind est invalide.');
  validateSourceIds(value.sourceIds, path + '.sourceIds', sourceIds, errors);
  if (!['low', 'medium', 'high'].includes(value.confidence)) errors.push(path + '.confidence est invalide.');
  validateTextList(value.tradeoffs, path + '.tradeoffs', errors, 1);
  validateTextList(value.limitations, path + '.limitations', errors, 1);
  if (!isDate(value.reviewBy)) errors.push(path + '.reviewBy doit être une date ISO.');
  if (!['draft', 'needs-review', 'reviewed', 'published'].includes(value.status)) errors.push(path + '.status est invalide.');
  if (!isRecord(value.scope)) {
    errors.push(path + '.scope doit être un objet.');
    return;
  }
  const references = [
    ['scenarioIds', scenarioIds],
    ['synergyIds', synergyIds],
    ['metaSnapshotIds', snapshotIds]
  ];
  let evidenceCount = 0;
  references.forEach(([field, knownIds]) => {
    if (value.scope[field] === undefined) return;
    if (!Array.isArray(value.scope[field]) || !value.scope[field].every((id) => typeof id === 'string' && knownIds.has(id))) {
      errors.push(path + '.scope.' + field + ' contient une référence inconnue.');
      return;
    }
    evidenceCount += value.scope[field].length;
  });
  if (value.status === 'published' && evidenceCount === 0) errors.push(path + ' publié doit référencer au moins un scénario, une synergie ou un snapshot.');
  if (value.status === 'published' && Array.isArray(value.scope.synergyIds) && value.scope.synergyIds.some((id) => synergiesById.get(id)?.evidenceKind === 'hypothesis')) {
    errors.push(path + ' publié ne peut pas reposer sur une synergie hypothétique.');
  }
}

export function validateStrategyKnowledge(value) {
  const errors = [];
  if (!isRecord(value)) return ['La base stratégique doit être un objet JSON.'];
  addRequiredErrors(value, ['schemaVersion', 'knowledgeVersion', 'status', 'updatedAt', 'compatibility', 'sources', 'scenarios', 'unitProfiles', 'detachmentProfiles', 'synergies', 'metaSnapshots', 'recommendations'], 'root', errors);
  if (value.schemaVersion !== STRATEGY_KNOWLEDGE_SCHEMA) errors.push('schemaVersion doit être ' + STRATEGY_KNOWLEDGE_SCHEMA + '.');
  if (!/^\d+\.\d+\.\d+$/.test(String(value.knowledgeVersion ?? ''))) errors.push('knowledgeVersion doit respecter semver.');
  if (!['skeleton', 'draft', 'reviewed', 'published'].includes(value.status)) errors.push('status racine est invalide.');
  if (!isDate(value.updatedAt)) errors.push('updatedAt doit être une date ISO.');
  validateCompatibility(value.compatibility, errors);

  const { sourceIds, sourceById } = validateSources(value.sources, errors);
  const scenarioIds = collectIds(value.scenarios, 'scenarios', errors);
  collectIds(value.unitProfiles, 'unitProfiles', errors);
  collectIds(value.detachmentProfiles, 'detachmentProfiles', errors);
  const synergyIds = collectIds(value.synergies, 'synergies', errors);
  const snapshotIds = collectIds(value.metaSnapshots, 'metaSnapshots', errors);
  collectIds(value.recommendations, 'recommendations', errors);

  if (Array.isArray(value.scenarios)) value.scenarios.forEach((entry, index) => validateScenario(entry, 'scenarios[' + index + ']', sourceIds, value.compatibility, errors));
  if (Array.isArray(value.unitProfiles)) value.unitProfiles.forEach((entry, index) => validateProfile(entry, 'unitProfiles[' + index + ']', sourceIds, 'unit', value.compatibility, errors));
  if (Array.isArray(value.detachmentProfiles)) value.detachmentProfiles.forEach((entry, index) => validateProfile(entry, 'detachmentProfiles[' + index + ']', sourceIds, 'detachment', value.compatibility, errors));
  if (Array.isArray(value.synergies)) value.synergies.forEach((entry, index) => validateSynergy(entry, 'synergies[' + index + ']', sourceIds, sourceById, errors));
  if (Array.isArray(value.metaSnapshots)) value.metaSnapshots.forEach((entry, index) => validateMetaSnapshot(entry, 'metaSnapshots[' + index + ']', sourceIds, sourceById, errors));
  const synergiesById = new Map(Array.isArray(value.synergies) ? value.synergies.filter(isRecord).map((entry) => [entry.id, entry]) : []);
  if (Array.isArray(value.recommendations)) value.recommendations.forEach((entry, index) => validateRecommendation(entry, 'recommendations[' + index + ']', sourceIds, scenarioIds, synergyIds, snapshotIds, synergiesById, errors));

  const recordCount = (Array.isArray(value.scenarios) ? value.scenarios.length : 0)
    + (Array.isArray(value.unitProfiles) ? value.unitProfiles.length : 0)
    + (Array.isArray(value.detachmentProfiles) ? value.detachmentProfiles.length : 0)
    + (Array.isArray(value.synergies) ? value.synergies.length : 0)
    + (Array.isArray(value.metaSnapshots) ? value.metaSnapshots.length : 0)
    + (Array.isArray(value.recommendations) ? value.recommendations.length : 0);
  if (value.status === 'skeleton' && (sourceIds.size > 0 || recordCount > 0)) errors.push('Un document skeleton doit rester vide.');
  if ((Array.isArray(value.unitProfiles) && value.unitProfiles.length > 0 || Array.isArray(value.detachmentProfiles) && value.detachmentProfiles.length > 0) && !hasText(value.compatibility?.catalogDataVersion)) {
    errors.push('Les profils de catalogue exigent compatibility.catalogDataVersion.');
  }
  return errors;
}

async function main() {
  const path = process.argv[2];
  if (!path || path === '--help' || path === '-h') {
    console.error('Usage: node validate-strategy-knowledge.mjs <knowledge-file>');
    process.exitCode = path ? 0 : 1;
    return;
  }
  let value;
  try {
    value = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (error) {
    console.error('Impossible de lire ' + path + ' : ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }
  const errors = validateStrategyKnowledge(value);
  if (errors.length > 0) {
    console.error('Base stratégique invalide :');
    errors.forEach((error) => console.error('- ' + error));
    process.exitCode = 1;
    return;
  }
  console.log('Base stratégique valide : ' + value.status + ', ' + value.sources.length + ' source(s), ' + value.recommendations.length + ' recommandation(s).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
