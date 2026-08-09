import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

export const STRATEGY_KNOWLEDGE_SCHEMA = 'warforge-strategy-knowledge/v3';

const projectRoot = resolve(import.meta.dirname, '..');
const workspaceRoot = resolve(projectRoot, '..');
const sourcePath = resolve(projectRoot, 'data/strategy/knowledge-base.json');
const outputPath = resolve(projectRoot, 'public/data/strategy-knowledge.json');
const unitsDirectory = resolve(projectRoot, 'data/units');
const dataInfoPath = resolve(unitsDirectory, 'DataInfo.json');
const axes = new Set([
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
const sourceTiers = new Set(['official', 'trusted-archive', 'observation', 'inference', 'hypothesis']);
const sourceKinds = new Set([
  'official-rule',
  'official-mission',
  'official-points',
  'official-errata',
  'trusted-mission-archive',
  'tournament-meta-snapshot',
  'catalog-manifest'
]);
const recommendationKinds = new Set(['list-construction', 'play-pattern', 'matchup-plan']);
const ruleKinds = new Set(['army-rule', 'detachment-rule', 'stratagem', 'enhancement', 'datasheet-ability', 'mission-rule']);
const ruleRelationKinds = new Set(['enables', 'amplifies', 'protects', 'repositions', 'denies', 'scores', 'coordinates']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringList(value) {
  return Array.isArray(value) && value.every(text);
}

function nonEmptyStringList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(text);
}

function date(value) {
  return text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sourcePages(value) {
  return Array.isArray(value) && value.length > 0 && value.every((page) => Number.isInteger(page) && page > 0);
}

function catalogBookId(name) {
  return 'book-' + name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function insideWorkspace(candidate) {
  const fromWorkspace = relative(workspaceRoot, candidate);
  return fromWorkspace !== '' && fromWorkspace !== '..' && !fromWorkspace.startsWith('..' + sep);
}

function localSourcePath(source) {
  if (!isRecord(source)) return null;
  if (text(source.relativePath)) return source.relativePath;
  if (text(source.archivePath)) return source.archivePath;
  return null;
}

function addUniqueIds(entries, label, errors) {
  if (!Array.isArray(entries)) {
    errors.push(label + ' doit être une liste.');
    return new Set();
  }
  const ids = new Set();
  entries.forEach((entry, index) => {
    if (!isRecord(entry) || !text(entry.id)) {
      errors.push(label + '[' + index + '].id est requis.');
      return;
    }
    if (ids.has(entry.id)) errors.push(label + '[' + index + '].id est dupliqué.');
    ids.add(entry.id);
  });
  return ids;
}

function validateSources(entries, catalogIndex, errors) {
  const sourceIds = addUniqueIds(entries, 'sources', errors);
  if (!Array.isArray(entries)) return sourceIds;
  entries.forEach((source, index) => {
    const label = 'sources[' + index + ']';
    if (!isRecord(source)
      || !text(source.id)
      || !sourceKinds.has(source.kind)
      || !text(source.authority)
      || !text(source.title)
      || !date(source.retrievedAt)
      || !text(source.sha256)
      || !/^[a-f0-9]{64}$/i.test(source.sha256)
      || !localSourcePath(source)) {
      errors.push(label + ' est incomplet ou invalide.');
      return;
    }
    if (source.pageCount !== undefined && (!Number.isInteger(source.pageCount) || source.pageCount < 1)) {
      errors.push(label + '.pageCount doit etre un entier positif.');
    }
    if (source.kind === 'trusted-mission-archive') {
      if (source.authority !== 'approved-archive' || !text(source.archivePath)) errors.push(label + ' doit etre une archive GDM approuvee.');
      return;
    }
    if (source.kind === 'tournament-meta-snapshot') {
      if (source.authority !== 'observational' || !text(source.url)) errors.push(label + ' doit decrire une observation meta archivee.');
      return;
    }
    if (source.kind === 'catalog-manifest') {
      if (source.authority !== 'local-verified'
        || source.catalogSchema !== 'warforge-catalog/v2'
        || !text(source.catalogDataVersion)
        || source.catalogDataVersion !== catalogIndex?.version
        || source.relativePath !== 'warforge-pwa/data/units/DataInfo.json') {
        errors.push(label + ' doit decrire le manifeste local du catalogue epingle.');
      }
      return;
    }
    if (source.authority !== 'official'
      || !text(source.documentVersion)
      || !text(source.validity)
      || (!date(source.publishedAt) && !date(source.documentCreatedAt))) {
      errors.push(label + ' doit decrire un document officiel versionne et date.');
    }
  });
  return sourceIds;
}

function validateEvidence(entry, label, sourceIds, errors) {
  if (!isRecord(entry)) {
    errors.push(label + ' doit être un objet.');
    return;
  }
  if (!sourceTiers.has(entry.sourceTier)) errors.push(label + '.sourceTier est invalide.');
  if (!Array.isArray(entry.sourceIds) || entry.sourceIds.length === 0) errors.push(label + '.sourceIds ne peut pas etre vide.');
  if (!stringList(entry.sourceIds) || !entry.sourceIds.every((id) => sourceIds.has(id))) errors.push(label + '.sourceIds doit référencer des sources connues.');
  if (!['low', 'medium', 'high'].includes(entry.confidence)) errors.push(label + '.confidence est invalide.');
  if (!['draft', 'needs-review', 'reviewed'].includes(entry.status)) errors.push(label + '.status est invalide.');
}

function validPercentage(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validateAxes(entry, label, errors) {
  if (!Array.isArray(entry.victoryAxes) || entry.victoryAxes.length === 0 || !entry.victoryAxes.every((axis) => axes.has(axis))) {
    errors.push(label + '.victoryAxes doit contenir des axes valides.');
  }
}

function validateAxisRatings(value, label, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(label + ' doit contenir au moins une evaluation.');
    return;
  }
  const seenAxes = new Set();
  value.forEach((rating, index) => {
    const ratingLabel = label + '[' + index + ']';
    if (!isRecord(rating)
      || !axes.has(rating.axis)
      || !Number.isInteger(rating.score)
      || rating.score < 0
      || rating.score > 4
      || !text(rating.basis)) {
      errors.push(ratingLabel + ' est invalide.');
      return;
    }
    if (seenAxes.has(rating.axis)) errors.push(ratingLabel + '.axis est duplique.');
    seenAxes.add(rating.axis);
  });
}

function validateSourcePageRange(entry, label, sourceById, errors) {
  if (!sourcePages(entry.sourcePages)) return;
  const seenPages = new Set();
  entry.sourcePages.forEach((page) => {
    if (seenPages.has(page)) errors.push(label + '.sourcePages contient une page dupliquee.');
    seenPages.add(page);
  });
  const pageCounts = entry.sourceIds
    .map((sourceId) => sourceById.get(sourceId)?.pageCount)
    .filter((pageCount) => Number.isInteger(pageCount));
  if (pageCounts.length > 0 && Math.max(...entry.sourcePages) > Math.max(...pageCounts)) {
    errors.push(label + '.sourcePages depasse le nombre de pages connu de ses sources.');
  }
}

function hasOfficialSource(sourceIds, sourceById) {
  return sourceIds.some((id) => sourceById.get(id)?.authority === 'official');
}

function validateProfile(entry, label, catalogField, expectedCatalogIds, catalogVersion, sourceIds, sourceById, errors) {
  if (!isRecord(entry)
    || !text(entry.catalogDataVersion)
    || !text(entry.faction)
    || !text(entry.title)
    || !text(entry.rationale)
    || !stringList(entry.roles)
    || !stringList(entry.preconditions)
    || !stringList(entry.limitations)
    || !date(entry.reviewBy)
    || !sourcePages(entry.sourcePages)) {
    errors.push(label + ' est incomplet.');
    return;
  }
  validateEvidence(entry, label, sourceIds, errors);
  validateSourcePageRange(entry, label, sourceById, errors);
  if (!['inference', 'hypothesis'].includes(entry.sourceTier)) errors.push(label + '.sourceTier doit etre une inference ou une hypothese.');
  if (entry.sourceTier === 'inference' && !hasOfficialSource(entry.sourceIds, sourceById)) errors.push(label + ' doit citer au moins une source officielle.');
  if (entry.status === 'reviewed' && entry.sourceTier === 'hypothesis') errors.push(label + ' ne peut pas etre reviewed avec une hypothese.');
  if (!text(entry[catalogField]) || !expectedCatalogIds.has(entry[catalogField])) errors.push(label + '.' + catalogField + ' est absent du catalogue epingle.');
  if (entry.catalogDataVersion !== catalogVersion) errors.push(label + '.catalogDataVersion ne correspond pas au catalogue epingle.');
  validateAxisRatings(entry.axisRatings, label + '.axisRatings', errors);
}

function validateUnitProfileContext(entry, label, detachmentProfileById, errors) {
  if (!isRecord(entry)) return;
  if (!nonEmptyStringList(entry.detachmentProfileIds)) {
    errors.push(label + '.detachmentProfileIds doit contenir au moins un profil de detachement.');
    return;
  }
  const seenIds = new Set();
  entry.detachmentProfileIds.forEach((detachmentProfileId) => {
    if (seenIds.has(detachmentProfileId)) errors.push(label + '.detachmentProfileIds contient un identifiant duplique.');
    seenIds.add(detachmentProfileId);
    const detachmentProfile = detachmentProfileById.get(detachmentProfileId);
    if (!detachmentProfile) {
      errors.push(label + '.detachmentProfileIds reference un profil inconnu: ' + detachmentProfileId + '.');
      return;
    }
    if (detachmentProfile.faction !== entry.faction) errors.push(label + '.detachmentProfileIds doit rester dans la meme faction.');
    if (detachmentProfile.catalogDataVersion !== entry.catalogDataVersion) errors.push(label + '.detachmentProfileIds doit utiliser le meme catalogue epingle.');
    if (entry.status === 'reviewed' && detachmentProfile.status !== 'reviewed') errors.push(label + '.detachmentProfileIds doit referencer un profil revu.');
  });
}

function validateParticipant(participant, label, catalogIndex, errors) {
  if (!isRecord(participant) || !['unit', 'detachment'].includes(participant.type) || !text(participant.catalogId)) {
    errors.push(label + ' est invalide.');
    return;
  }
  const expectedIds = participant.type === 'unit' ? catalogIndex.unitIds : catalogIndex.detachmentIds;
  if (!expectedIds.has(participant.catalogId)) errors.push(label + '.catalogId est absent du catalogue epingle.');
}

function validateRuleTarget(target, label, catalogIndex, errors) {
  if (!isRecord(target)) {
    errors.push(label + ' est invalide.');
    return;
  }
  const properties = ['unitIds', 'allKeywords', 'anyKeywords', 'excludeUnitIds'];
  properties.forEach((property) => {
    if (target[property] !== undefined && !stringList(target[property])) errors.push(label + '.' + property + ' doit etre une liste de textes.');
  });
  if (target.faction !== undefined && !text(target.faction)) errors.push(label + '.faction est invalide.');
  const hasSelector = text(target.faction)
    || (Array.isArray(target.unitIds) && target.unitIds.length > 0)
    || (Array.isArray(target.allKeywords) && target.allKeywords.length > 0)
    || (Array.isArray(target.anyKeywords) && target.anyKeywords.length > 0);
  if (!hasSelector) errors.push(label + ' doit contenir au moins un selecteur.');
  ['unitIds', 'excludeUnitIds'].forEach((property) => {
    const ids = target[property];
    if (!Array.isArray(ids)) return;
    const seen = new Set();
    ids.forEach((id) => {
      if (seen.has(id)) errors.push(label + '.' + property + ' contient un identifiant duplique.');
      seen.add(id);
      if (!catalogIndex.unitIds.has(id)) errors.push(label + '.' + property + ' reference une unite absente du catalogue epingle.');
    });
  });
}

function validateRuleNode(entry, label, catalogIndex, sourceIds, sourceById, errors) {
  if (!isRecord(entry)
    || !text(entry.title)
    || !ruleKinds.has(entry.kind)
    || !text(entry.fact)
    || !text(entry.timing)
    || !['detachment', 'selected-enhancement'].includes(entry.activation)
    || !stringList(entry.effectTags)
    || entry.effectTags.length === 0
    || !stringList(entry.limitations)
    || !date(entry.reviewBy)
    || !sourcePages(entry.sourcePages)) {
    errors.push(label + ' est incomplet.');
    return;
  }
  validateEvidence(entry, label, sourceIds, errors);
  validateSourcePageRange(entry, label, sourceById, errors);
  if (!['official', 'trusted-archive'].includes(entry.sourceTier)) errors.push(label + '.sourceTier doit etre officiel ou archive de confiance.');
  if (entry.sourceTier === 'official' && !hasOfficialSource(entry.sourceIds, sourceById)) errors.push(label + ' officiel doit citer une source officielle.');
  if (entry.status === 'reviewed' && entry.sourceTier === 'hypothesis') errors.push(label + ' ne peut pas etre reviewed avec une hypothese.');
  validateParticipant(entry.owner, label + '.owner', catalogIndex, errors);
  if (entry.requiresParticipants !== undefined) {
    if (!Array.isArray(entry.requiresParticipants) || entry.requiresParticipants.length === 0) {
      errors.push(label + '.requiresParticipants doit etre une liste non vide lorsqu’elle est fournie.');
    } else {
      const participantIds = new Set();
      entry.requiresParticipants.forEach((participant, index) => {
        validateParticipant(participant, label + '.requiresParticipants[' + index + ']', catalogIndex, errors);
        const key = isRecord(participant) ? participant.type + ':' + participant.catalogId : String(index);
        if (participantIds.has(key)) errors.push(label + '.requiresParticipants contient un participant duplique.');
        participantIds.add(key);
      });
    }
  }
  validateRuleTarget(entry.target, label + '.target', catalogIndex, errors);
  if (entry.commandPointCost !== undefined && (!Number.isInteger(entry.commandPointCost) || entry.commandPointCost < 0)) errors.push(label + '.commandPointCost est invalide.');
  if (entry.activation === 'selected-enhancement' && !text(entry.catalogEnhancementName)) errors.push(label + '.catalogEnhancementName est requis pour une amelioration selectionnee.');
  if (entry.activation === 'detachment' && entry.catalogEnhancementName !== undefined) errors.push(label + '.catalogEnhancementName est reserve a une amelioration selectionnee.');
}

function validateSynergy(entry, label, catalogIndex, sourceIds, sourceById, ruleById, errors) {
  if (!isRecord(entry)
    || !text(entry.title)
    || !text(entry.claim)
    || !text(entry.timing)
    || !stringList(entry.preconditions)
    || !stringList(entry.counterplay)
    || !stringList(entry.tradeoffs)
    || !stringList(entry.limitations)
    || !date(entry.reviewBy)
    || !sourcePages(entry.sourcePages)
    || !Array.isArray(entry.participants)
    || entry.participants.length < 2
    || !nonEmptyStringList(entry.ruleIds)
    || !ruleRelationKinds.has(entry.relationKind)) {
    errors.push(label + ' est incomplet.');
    return;
  }
  validateEvidence(entry, label, sourceIds, errors);
  validateSourcePageRange(entry, label, sourceById, errors);
  if (!['rules-supported', 'tested', 'hypothesis'].includes(entry.evidenceKind)) errors.push(label + '.evidenceKind est invalide.');
  if (!['inference', 'hypothesis'].includes(entry.sourceTier)) errors.push(label + '.sourceTier doit etre une inference ou une hypothese.');
  if (entry.evidenceKind === 'rules-supported' && !hasOfficialSource(entry.sourceIds, sourceById)) errors.push(label + ' rules-supported doit citer une source officielle.');
  if (entry.evidenceKind === 'tested' && !entry.sourceIds.some((id) => ['event-results', 'community-analysis', 'playtest'].includes(sourceById.get(id)?.kind))) errors.push(label + ' tested doit citer une source de test ou de resultats.');
  if (entry.evidenceKind === 'hypothesis' && entry.status !== 'needs-review') errors.push(label + ' hypothesis doit etre needs-review.');
  const participantIds = new Set();
  entry.participants.forEach((participant, index) => {
    const participantLabel = label + '.participants[' + index + ']';
    validateParticipant(participant, participantLabel, catalogIndex, errors);
    if (!isRecord(participant) || !text(participant.catalogId)) return;
    if (participantIds.has(participant.catalogId)) errors.push(participantLabel + '.catalogId est duplique.');
    participantIds.add(participant.catalogId);
  });
  const seenRuleIds = new Set();
  entry.ruleIds.forEach((ruleId) => {
    if (seenRuleIds.has(ruleId)) errors.push(label + '.ruleIds contient un identifiant duplique.');
    seenRuleIds.add(ruleId);
    const rule = ruleById.get(ruleId);
    if (!rule) {
      errors.push(label + '.ruleIds reference une regle inconnue: ' + ruleId + '.');
      return;
    }
    if (entry.status === 'reviewed' && rule.status !== 'reviewed') errors.push(label + '.ruleIds doit referencer une regle reviewed.');
    if (!rule.sourceIds.some((sourceId) => entry.sourceIds.includes(sourceId))) errors.push(label + '.ruleIds doit partager au moins une source avec la regle associee.');
  });
  validateAxisRatings(entry.axisEffects, label + '.axisEffects', errors);
}

function validateReferenceList(value, label, knownIds, errors) {
  if (value === undefined) return false;
  if (!nonEmptyStringList(value)) {
    errors.push(label + ' doit etre une liste non vide.');
    return true;
  }
  value.forEach((id) => {
    if (!knownIds.has(id)) errors.push(label + ' reference un identifiant inconnu: ' + id + '.');
  });
  return true;
}

function validateRecommendation(entry, label, context, errors) {
  if (!isRecord(entry)
    || !text(entry.title)
    || !recommendationKinds.has(entry.kind)
    || !text(entry.statement)
    || !Array.isArray(entry.tradeoffs)
    || !stringList(entry.tradeoffs)
    || !nonEmptyStringList(entry.limitations)
    || !date(entry.reviewBy)
    || !isRecord(entry.scope)) {
    errors.push(label + ' est incomplet.');
    return;
  }
  if (!['inference', 'hypothesis'].includes(entry.sourceTier)) errors.push(label + '.sourceTier doit etre une inference ou une hypothese.');
  if (!['low', 'medium', 'high'].includes(entry.confidence)) errors.push(label + '.confidence est invalide.');
  if (!['draft', 'needs-review', 'reviewed', 'published'].includes(entry.status)) errors.push(label + '.status est invalide.');
  if (!nonEmptyStringList(entry.sourceIds) || !entry.sourceIds.every((id) => context.sourceIds.has(id))) errors.push(label + '.sourceIds doit referencer des sources connues.');
  const hasScenarioScope = validateReferenceList(entry.scope.scenarioIds, label + '.scope.scenarioIds', context.scenarioIds, errors);
  const hasSynergyScope = validateReferenceList(entry.scope.synergyIds, label + '.scope.synergyIds', context.synergyIds, errors);
  const hasMetaScope = validateReferenceList(entry.scope.metaSnapshotIds, label + '.scope.metaSnapshotIds', context.metaSnapshotIds, errors);
  const hasDetachmentScope = validateReferenceList(entry.scope.detachmentProfileIds, label + '.scope.detachmentProfileIds', context.detachmentProfileIds, errors);
  if (!hasScenarioScope && !hasSynergyScope && !hasMetaScope && !hasDetachmentScope) errors.push(label + '.scope doit contenir au moins un contexte resolvable.');
  if (entry.sourceTier === 'hypothesis' && entry.status !== 'needs-review') errors.push(label + ' hypothesis doit etre needs-review.');
  if (entry.status === 'published') {
    if (entry.sourceTier !== 'inference') errors.push(label + ' published ne peut pas etre une hypothese.');
    if (!hasScenarioScope && !hasSynergyScope) errors.push(label + ' published doit etre ancree dans un scenario ou une synergie.');
    if (!entry.sourceIds.some((id) => context.sourceById.get(id)?.authority === 'official')) errors.push(label + ' published doit citer une source officielle.');
    (entry.scope.synergyIds ?? []).forEach((synergyId) => {
      if (context.synergyById.get(synergyId)?.evidenceKind === 'hypothesis') errors.push(label + ' published ne peut pas reposer sur une synergie hypothetique.');
    });
  }
}

function validateVictoryPlan(entry, label, context, errors) {
  if (!isRecord(entry)
    || !text(entry.title)
    || !text(entry.detachmentProfileId)
    || !text(entry.scenarioId)
    || !nonEmptyStringList(entry.ruleIds)
    || !nonEmptyStringList(entry.synergyIds)
    || !text(entry.statement)
    || !stringList(entry.preconditions)
    || !stringList(entry.counterplay)
    || !stringList(entry.tradeoffs)
    || !nonEmptyStringList(entry.limitations)
    || !date(entry.reviewBy)) {
    errors.push(label + ' est incomplet.');
    return;
  }
  validateEvidence(entry, label, context.sourceIds, errors);
  if (entry.sourceTier !== 'inference') errors.push(label + '.sourceTier doit etre une inference.');
  if (!context.detachmentProfileById.has(entry.detachmentProfileId)) errors.push(label + '.detachmentProfileId reference un profil inconnu.');
  const scenario = context.scenarioById.get(entry.scenarioId);
  if (!scenario || scenario.kind !== 'primary-card') errors.push(label + '.scenarioId doit referencer une mission principale connue.');
  const ruleIds = new Set();
  entry.ruleIds.forEach((ruleId) => {
    if (ruleIds.has(ruleId)) errors.push(label + '.ruleIds contient un identifiant duplique.');
    ruleIds.add(ruleId);
    const rule = context.ruleById.get(ruleId);
    if (!rule) errors.push(label + '.ruleIds reference une regle inconnue: ' + ruleId + '.');
    else if (!rule.sourceIds.some((sourceId) => entry.sourceIds.includes(sourceId))) errors.push(label + '.ruleIds doit partager une source avec le plan.');
  });
  const synergyIds = new Set();
  entry.synergyIds.forEach((synergyId) => {
    if (synergyIds.has(synergyId)) errors.push(label + '.synergyIds contient un identifiant duplique.');
    synergyIds.add(synergyId);
    const synergy = context.synergyById.get(synergyId);
    if (!synergy) errors.push(label + '.synergyIds reference une synergie inconnue: ' + synergyId + '.');
    else if (synergy.status !== 'reviewed') errors.push(label + '.synergyIds doit referencer une synergie reviewed.');
  });
  if (!Array.isArray(entry.priorityAxes) || entry.priorityAxes.length === 0 || !entry.priorityAxes.every((axis) => axes.has(axis))) {
    errors.push(label + '.priorityAxes doit contenir des axes valides.');
  }
  if (entry.status === 'reviewed' && !entry.sourceIds.some((id) => context.sourceById.get(id)?.authority === 'official')) {
    errors.push(label + ' reviewed doit citer au moins une source officielle.');
  }
}

function resolvedPointCost(unit, pointIndex, occurrence) {
  const modelCounts = [...new Set((unit?.Points ?? []).map((point) => point?.ModelCount).filter(Number.isInteger))].sort((left, right) => left - right);
  const modelCount = modelCounts[pointIndex];
  if (!Number.isInteger(modelCount)) return null;
  const matching = (unit.Points ?? []).filter((point) => point?.ModelCount === modelCount && Number.isFinite(point?.Cost));
  const fixed = matching.find((point) => point.UnitCount === undefined);
  if (fixed) return fixed.Cost;
  const tiers = matching.filter((point) => Number.isInteger(point.UnitCount)).sort((left, right) => left.UnitCount - right.UnitCount);
  return (tiers.find((point) => occurrence <= point.UnitCount) ?? tiers.at(-1))?.Cost ?? null;
}

function validateReferenceRoster(entry, label, context, errors) {
  if (!isRecord(entry)
    || !text(entry.title)
    || !text(entry.victoryPlanId)
    || !text(entry.catalogDataVersion)
    || !isRecord(entry.draft)
    || !date(entry.reviewBy)) {
    errors.push(label + ' est incomplet.');
    return;
  }
  validateEvidence(entry, label, context.sourceIds, errors);
  if (entry.sourceTier !== 'inference') errors.push(label + '.sourceTier doit etre une inference.');
  if (entry.catalogDataVersion !== context.catalogIndex.version) errors.push(label + '.catalogDataVersion ne correspond pas au catalogue epingle.');
  const victoryPlan = context.victoryPlanById.get(entry.victoryPlanId);
  if (!victoryPlan) {
    errors.push(label + '.victoryPlanId reference un plan inconnu.');
    return;
  }
  const draft = entry.draft;
  if (!text(draft.primaryFaction)
    || !Number.isInteger(draft.battleSizePoints)
    || draft.battleSizePoints < 1
    || !text(draft.scenario)
    || !text(draft.primaryMissionId)
    || !nonEmptyStringList(draft.detachmentIds)
    || !Array.isArray(draft.items)
    || draft.items.length === 0) {
    errors.push(label + '.draft est incomplet.');
    return;
  }
  if (draft.primaryMissionId !== victoryPlan.scenarioId) errors.push(label + '.draft.primaryMissionId doit correspondre au plan de victoire.');
  const scenario = context.scenarioById.get(draft.primaryMissionId);
  const selectedDetachmentIds = new Set();
  draft.detachmentIds.forEach((detachmentId) => {
    if (selectedDetachmentIds.has(detachmentId)) errors.push(label + '.draft.detachmentIds contient un identifiant duplique.');
    selectedDetachmentIds.add(detachmentId);
    const detachment = context.catalogIndex.detachmentsById.get(detachmentId);
    if (!detachment) errors.push(label + '.draft.detachmentIds reference un detachement absent du catalogue.');
    else if (!detachment.ForceDispositions?.includes(draft.scenario)) errors.push(label + '.draft.scenario n’est pas autorise par le detachement ' + detachmentId + '.');
  });
  const planProfile = context.detachmentProfileById.get(victoryPlan.detachmentProfileId);
  if (planProfile && !selectedDetachmentIds.has(planProfile.catalogDetachmentId)) errors.push(label + '.draft doit inclure le detachement de son plan.');
  if (!scenario || scenario.kind !== 'primary-card') errors.push(label + '.draft.primaryMissionId doit referencer une mission principale.');
  else if (context.forceById.get(scenario.forceDispositionId)?.deck !== draft.scenario.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) {
    errors.push(label + '.draft.primaryMissionId ne correspond pas a la disposition selectionnee.');
  }
  const itemIds = new Set();
  const occurrenceByUnit = new Map();
  let total = 0;
  draft.items.forEach((item, itemIndex) => {
    const itemLabel = label + '.draft.items[' + itemIndex + ']';
    if (!isRecord(item) || !text(item.id) || !text(item.unitId) || !Number.isInteger(item.pointIndex) || item.pointIndex < 0 || !isRecord(item.wargearSelections)) {
      errors.push(itemLabel + ' est invalide.');
      return;
    }
    if (itemIds.has(item.id)) errors.push(itemLabel + '.id est duplique.');
    itemIds.add(item.id);
    if (Object.keys(item.wargearSelections).length > 0) errors.push(itemLabel + '.wargearSelections doit etre vide tant que son cout n’est pas verifie par le validateur strategique.');
    const unit = context.catalogIndex.unitsById.get(item.unitId);
    if (!unit) {
      errors.push(itemLabel + '.unitId est absent du catalogue epingle.');
      return;
    }
    const occurrence = (occurrenceByUnit.get(item.unitId) ?? 0) + 1;
    occurrenceByUnit.set(item.unitId, occurrence);
    const cost = resolvedPointCost(unit, item.pointIndex, occurrence);
    if (!Number.isFinite(cost)) errors.push(itemLabel + '.pointIndex est invalide pour cette unite.');
    else total += cost;
    if (item.enhancement !== undefined) {
      if (!isRecord(item.enhancement)
        || !text(item.enhancement.detachmentId)
        || !Number.isInteger(item.enhancement.enhancementIndex)
        || item.enhancement.enhancementIndex < 0) {
        errors.push(itemLabel + '.enhancement est invalide.');
      } else {
        const detachment = context.catalogIndex.detachmentsById.get(item.enhancement.detachmentId);
        const enhancement = detachment?.Enhancements?.[item.enhancement.enhancementIndex];
        if (!selectedDetachmentIds.has(item.enhancement.detachmentId) || !enhancement || !Number.isFinite(enhancement.Cost)) errors.push(itemLabel + '.enhancement ne correspond pas a un detachement selectionne.');
        else total += enhancement.Cost;
      }
    }
  });
  if (total !== draft.battleSizePoints) errors.push(label + '.draft totalise ' + total + ' pts au lieu de ' + draft.battleSizePoints + ' pts.');
}

async function loadCatalogIndex() {
  const dataInfo = JSON.parse((await readFile(dataInfoPath, 'utf8')).replace(/^\uFEFF/, ''));
  const entries = await readdir(unitsDirectory, { withFileTypes: true });
  const unitIds = new Set();
  const detachmentIds = new Set();
  const unitsById = new Map();
  const detachmentsById = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'DataInfo.json') continue;
    const book = JSON.parse((await readFile(resolve(unitsDirectory, entry.name), 'utf8')).replace(/^\uFEFF/, ''));
    if (!text(book.Name)) continue;
    const bookId = catalogBookId(book.Name);
    (Array.isArray(book.Units) ? book.Units : []).forEach((unit, index) => {
      const id = bookId + ':unit:' + index;
      unitIds.add(id);
      unitsById.set(id, unit);
    });
    (Array.isArray(book.Dettachments) ? book.Dettachments : []).forEach((detachment, index) => {
      const id = bookId + ':detachment:' + index;
      detachmentIds.add(id);
      detachmentsById.set(id, detachment);
    });
  }
  return { version: dataInfo.Version, unitIds, detachmentIds, unitsById, detachmentsById };
}

export function validateStrategyKnowledge(value, archive, catalogIndex) {
  const errors = [];
  if (!isRecord(value)) return ['La base stratégique doit être un objet JSON.'];
  const required = ['schemaVersion', 'knowledgeVersion', 'status', 'updatedAt', 'catalogProvenanceSourceId', 'compatibility', 'sources', 'scenarios', 'forceDispositions', 'layoutContexts', 'ruleNodes', 'unitProfiles', 'detachmentProfiles', 'synergies', 'metaSnapshots', 'recommendations', 'victoryPlans', 'referenceRosters'];
  if (!['draft', 'reviewed', 'published'].includes(value.status)) errors.push('root.status est invalide.');
  if (!date(value.updatedAt)) errors.push('root.updatedAt est invalide.');
  required.forEach((field) => {
    if (value[field] === undefined) errors.push('root.' + field + ' est requis.');
  });
  if (value.schemaVersion !== STRATEGY_KNOWLEDGE_SCHEMA) errors.push('schemaVersion doit être ' + STRATEGY_KNOWLEDGE_SCHEMA + '.');
  if (!isRecord(value.compatibility) || value.compatibility.gameEdition !== '11th' || value.compatibility.catalogSchema !== 'warforge-catalog/v2' || !text(value.compatibility.catalogDataVersion) || !stringList(value.compatibility.missionPackIds)) {
    errors.push('compatibility est invalide.');
  }
  if (!catalogIndex || !text(catalogIndex.version) || !(catalogIndex.unitIds instanceof Set) || !(catalogIndex.detachmentIds instanceof Set)) {
    errors.push('Le catalogue epingle est indisponible.');
  } else if (value.compatibility?.catalogDataVersion !== catalogIndex.version) {
    errors.push('compatibility.catalogDataVersion ne correspond pas au catalogue local.');
  }

  const sourceIds = validateSources(value.sources, catalogIndex, errors);
  const scenarios = Array.isArray(value.scenarios) ? value.scenarios : [];
  const forceDispositions = Array.isArray(value.forceDispositions) ? value.forceDispositions : [];
  const layoutContexts = Array.isArray(value.layoutContexts) ? value.layoutContexts : [];
  const ruleNodes = Array.isArray(value.ruleNodes) ? value.ruleNodes : [];
  const unitProfiles = Array.isArray(value.unitProfiles) ? value.unitProfiles : [];
  const detachmentProfiles = Array.isArray(value.detachmentProfiles) ? value.detachmentProfiles : [];
  const synergies = Array.isArray(value.synergies) ? value.synergies : [];
  const metaSnapshots = Array.isArray(value.metaSnapshots) ? value.metaSnapshots : [];
  const recommendations = Array.isArray(value.recommendations) ? value.recommendations : [];
  const victoryPlans = Array.isArray(value.victoryPlans) ? value.victoryPlans : [];
  const referenceRosters = Array.isArray(value.referenceRosters) ? value.referenceRosters : [];
  const scenarioIds = addUniqueIds(scenarios, 'scenarios', errors);
  addUniqueIds(forceDispositions, 'forceDispositions', errors);
  addUniqueIds(layoutContexts, 'layoutContexts', errors);
  const ruleNodeIds = addUniqueIds(ruleNodes, 'ruleNodes', errors);
  addUniqueIds(unitProfiles, 'unitProfiles', errors);
  const detachmentProfileIds = addUniqueIds(detachmentProfiles, 'detachmentProfiles', errors);
  const synergyIds = addUniqueIds(synergies, 'synergies', errors);
  const metaSnapshotIds = addUniqueIds(metaSnapshots, 'metaSnapshots', errors);
  addUniqueIds(recommendations, 'recommendations', errors);
  addUniqueIds(victoryPlans, 'victoryPlans', errors);
  addUniqueIds(referenceRosters, 'referenceRosters', errors);

  const sourceById = new Map((Array.isArray(value.sources) ? value.sources : []).filter(isRecord).map((source) => [source.id, source]));
  const ruleById = new Map(ruleNodes.filter(isRecord).map((rule) => [rule.id, rule]));
  const synergyById = new Map(synergies.filter(isRecord).map((synergy) => [synergy.id, synergy]));
  const detachmentProfileById = new Map(detachmentProfiles.filter(isRecord).map((profile) => [profile.id, profile]));
  const scenarioById = new Map(scenarios.filter(isRecord).map((scenario) => [scenario.id, scenario]));
  const victoryPlanById = new Map(victoryPlans.filter(isRecord).map((plan) => [plan.id, plan]));
  const gdmSource = [...sourceById.values()].find((source) => source.kind === 'trusted-mission-archive');
  const catalogManifestSources = [...sourceById.values()].filter((source) => source.kind === 'catalog-manifest');
  if (catalogManifestSources.length !== 1
    || catalogManifestSources[0]?.id !== value.catalogProvenanceSourceId
    || catalogManifestSources[0]?.catalogSchema !== value.compatibility?.catalogSchema
    || catalogManifestSources[0]?.catalogDataVersion !== value.compatibility?.catalogDataVersion) {
    errors.push('Un manifeste unique du catalogue compatible est requis.');
  }
  if (!gdmSource || gdmSource.authority !== 'approved-archive' || !text(gdmSource.archivePath)) errors.push('Une archive de mission GDM approuvée est requise.');

  const forceById = new Map(forceDispositions.filter(isRecord).map((entry) => [entry.id, entry]));
  const primaryByPath = new Map((archive?.cards?.primary ?? []).map((card) => [card.sourcePath, card]));
  const secondaryByPath = new Map((archive?.cards?.secondary ?? []).map((card) => [card.sourcePath, card]));
  const dispositionByPath = new Map((archive?.cards?.forceDispositions ?? []).map((card) => [card.sourcePath, card]));
  const layoutsByPath = new Map((archive?.cards?.layouts ?? []).map((layout) => [layout.sourcePath, layout]));
  const primaryProfiles = scenarios.filter((entry) => entry?.kind === 'primary-card');
  const secondaryProfiles = scenarios.filter((entry) => entry?.kind === 'secondary-card');
  if (primaryProfiles.length !== primaryByPath.size) errors.push('La base doit couvrir les ' + primaryByPath.size + ' missions principales GDM.');
  if (secondaryProfiles.length !== secondaryByPath.size) errors.push('La base doit couvrir les ' + secondaryByPath.size + ' missions secondaires GDM.');
  if (forceDispositions.length !== dispositionByPath.size) errors.push('La base doit couvrir les ' + dispositionByPath.size + ' dispositions de forces GDM.');
  if (layoutContexts.length !== layoutsByPath.size) errors.push('La base doit couvrir les ' + layoutsByPath.size + ' contextes de layout GDM.');

  scenarios.forEach((scenario, index) => {
    const label = 'scenarios[' + index + ']';
    if (!isRecord(scenario) || !text(scenario.kind) || !text(scenario.title) || !text(scenario.missionPackId) || !stringList(scenario.scoringWindows)) {
      errors.push(label + ' est incomplet.');
      return;
    }
    validateEvidence(scenario, label, sourceIds, errors);
    validateAxes(scenario, label, errors);
    if (scenario.kind === 'pack-framework') return;
    if (scenario.missionPackId !== 'gdm-2026-11th' || scenario.sourceTier !== 'trusted-archive' || !text(scenario.cardSourcePath)) {
      errors.push(label + ' doit référencer une carte GDM archivée.');
      return;
    }
    if (scenario.kind === 'primary-card') {
      const card = primaryByPath.get(scenario.cardSourcePath);
      if (!card) {
        errors.push(label + '.cardSourcePath ne correspond pas à une mission principale GDM.');
        return;
      }
      const own = forceById.get(scenario.forceDispositionId);
      const opponent = forceById.get(scenario.opponentForceDispositionId);
      if (!own || own.deck !== card.deck || !opponent || opponent.deck !== card.vs) errors.push(label + ' ne correspond pas à la matrice des dispositions GDM.');
    } else if (scenario.kind === 'secondary-card') {
      if (!secondaryByPath.has(scenario.cardSourcePath)) errors.push(label + '.cardSourcePath ne correspond pas à une mission secondaire GDM.');
    } else {
      errors.push(label + '.kind est invalide.');
    }
  });

  forceDispositions.forEach((entry, index) => {
    const label = 'forceDispositions[' + index + ']';
    if (!isRecord(entry) || entry.missionPackId !== 'gdm-2026-11th' || !text(entry.deck) || !text(entry.sourcePath) || !dispositionByPath.has(entry.sourcePath)) {
      errors.push(label + ' doit référencer une disposition GDM.');
      return;
    }
    validateEvidence(entry, label, sourceIds, errors);
  });

  layoutContexts.forEach((entry, index) => {
    const label = 'layoutContexts[' + index + ']';
    if (!isRecord(entry) || entry.missionPackId !== 'gdm-2026-11th' || !text(entry.sourcePath) || !layoutsByPath.has(entry.sourcePath) || !Array.isArray(entry.layoutIds) || entry.layoutIds.length === 0) {
      errors.push(label + ' doit référencer un contexte de layout GDM.');
      return;
    }
    validateEvidence(entry, label, sourceIds, errors);
    const expectedIds = layoutsByPath.get(entry.sourcePath).layouts.map((layout) => layout.number).sort((left, right) => left - right);
    const actualIds = [...entry.layoutIds].sort((left, right) => left - right);
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) errors.push(label + '.layoutIds ne correspond pas au layout source.');
  });

  if (catalogIndex) {
    ruleNodes.forEach((entry, index) => {
      validateRuleNode(entry, 'ruleNodes[' + index + ']', catalogIndex, sourceIds, sourceById, errors);
    });
    unitProfiles.forEach((entry, index) => {
      validateProfile(entry, 'unitProfiles[' + index + ']', 'catalogUnitId', catalogIndex.unitIds, catalogIndex.version, sourceIds, sourceById, errors);
    });
    detachmentProfiles.forEach((entry, index) => {
      validateProfile(entry, 'detachmentProfiles[' + index + ']', 'catalogDetachmentId', catalogIndex.detachmentIds, catalogIndex.version, sourceIds, sourceById, errors);
    });
    synergies.forEach((entry, index) => {
      validateSynergy(entry, 'synergies[' + index + ']', catalogIndex, sourceIds, sourceById, ruleById, errors);
    });
  }

  unitProfiles.forEach((entry, index) => {
    validateUnitProfileContext(entry, 'unitProfiles[' + index + ']', detachmentProfileById, errors);
  });

  metaSnapshots.forEach((snapshot, index) => {
    const label = 'metaSnapshots[' + index + ']';
    if (!isRecord(snapshot)
      || !text(snapshot.title)
      || snapshot.gameEdition !== '11th'
      || !text(snapshot.scope)
      || !date(snapshot.observedAt)
      || !isRecord(snapshot.window)
      || !text(snapshot.window.id)
      || !date(snapshot.window.coverageThrough)
      || !Number.isInteger(snapshot.window.eventCount)
      || snapshot.window.eventCount < 1
      || !Number.isInteger(snapshot.window.gameCount)
      || snapshot.window.gameCount < 1
      || !Array.isArray(snapshot.factionMetrics)
      || snapshot.factionMetrics.length === 0
      || !stringList(snapshot.limitations)) {
      errors.push(label + ' est incomplet.');
      return;
    }
    validateEvidence(snapshot, label, sourceIds, errors);
    if (!snapshot.sourceIds.every((sourceId) => sourceById.get(sourceId)?.kind === 'tournament-meta-snapshot')) {
      errors.push(label + '.sourceIds doit referencer une observation meta archivee.');
    }
    if (snapshot.sourceTier !== 'observation') errors.push(label + '.sourceTier doit être observation.');
    const factions = new Set();
    snapshot.factionMetrics.forEach((metric, metricIndex) => {
      const metricLabel = label + '.factionMetrics[' + metricIndex + ']';
      if (!isRecord(metric)
        || !text(metric.faction)
        || !validPercentage(metric.winRate)
        || !validPercentage(metric.fieldShare)
        || !Number.isInteger(metric.sampleSize)
        || metric.sampleSize < 1
        || typeof metric.victoryPointDifference !== 'number'
        || !Number.isFinite(metric.victoryPointDifference)
        || !validPercentage(metric.top3Rate)) {
        errors.push(metricLabel + ' est invalide.');
        return;
      }
      if (factions.has(metric.faction)) errors.push(metricLabel + '.faction est dupliquée.');
      factions.add(metric.faction);
    });
  });

  recommendations.forEach((recommendation, index) => {
    validateRecommendation(recommendation, 'recommendations[' + index + ']', {
      sourceIds,
      sourceById,
      scenarioIds,
      synergyIds,
      metaSnapshotIds,
      detachmentProfileIds,
      synergyById
    }, errors);
  });

  victoryPlans.forEach((victoryPlan, index) => {
    validateVictoryPlan(victoryPlan, 'victoryPlans[' + index + ']', {
      sourceIds,
      sourceById,
      scenarioById,
      ruleById,
      detachmentProfileById,
      synergyById
    }, errors);
  });

  referenceRosters.forEach((referenceRoster, index) => {
    validateReferenceRoster(referenceRoster, 'referenceRosters[' + index + ']', {
      sourceIds,
      sourceById,
      catalogIndex,
      scenarioById,
      forceById,
      detachmentProfileById,
      victoryPlanById
    }, errors);
  });

  return errors;
}

export async function loadValidatedStrategyKnowledge() {
  const raw = await readFile(sourcePath, 'utf8');
  const value = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const gdmSource = Array.isArray(value.sources) ? value.sources.find((source) => source?.kind === 'trusted-mission-archive') : null;
  if (!gdmSource?.archivePath) throw new Error('La base stratégique ne référence aucune archive GDM.');
  const archivePath = resolve(workspaceRoot, gdmSource.archivePath);
  if (!insideWorkspace(archivePath)) throw new Error('L’archive GDM est hors du workspace.');
  const archive = JSON.parse((await readFile(archivePath, 'utf8')).replace(/^\uFEFF/, ''));
  const catalogIndex = await loadCatalogIndex();
  const errors = validateStrategyKnowledge(value, archive, catalogIndex);
  if (errors.length) throw new Error('Base stratégique invalide : ' + errors.join(' '));
  for (const source of value.sources) {
    const localPath = localSourcePath(source);
    if (!localPath) throw new Error('La source ' + source.id + ' n’a pas de copie locale vérifiable.');
    const absolutePath = resolve(workspaceRoot, localPath);
    if (!insideWorkspace(absolutePath)) throw new Error('La source ' + source.id + ' est hors du workspace.');
    const actualHash = createHash('sha256').update(await readFile(absolutePath)).digest('hex');
    if (actualHash !== source.sha256.toLowerCase()) throw new Error('Le SHA-256 de la source ' + source.id + ' ne correspond pas.');
  }
  return value;
}

export async function syncStrategyKnowledge() {
  const knowledge = await loadValidatedStrategyKnowledge();
  await stat(sourcePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);
  console.log('Connaissance stratégique synchronisée : ' + knowledge.scenarios.length + ' profils de mission, ' + knowledge.forceDispositions.length + ' dispositions.');
}

if (process.argv.includes('--check')) {
  await loadValidatedStrategyKnowledge();
  console.log('Connaissance stratégique validée.');
}
