import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export const PROJECT_SCHEMA = 'warforge-simulator-project/v1';
export const ROUTING_SCHEMA = 'warforge-simulator-model-routing/v1';
export const TASK_STATUSES = new Set(['planned', 'ready', 'in_progress', 'blocked', 'done', 'deferred']);
export const MILESTONE_STATUSES = new Set(['planned', 'in_progress', 'accepted']);
export const REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

const taskTransitions = {
  planned: new Set(['ready', 'deferred']),
  ready: new Set(['in_progress', 'deferred']),
  in_progress: new Set(['ready', 'done']),
  blocked: new Set(['ready', 'deferred']),
  done: new Set(['ready']),
  deferred: new Set(['planned'])
};

const defaultRoot = resolve(import.meta.dirname, '..');

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function asIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStringSet(left, right) {
  return left.size === right.size && [...left].every((entry) => right.has(entry));
}

function taskPrefix(task) {
  return `Tâche ${task.id}`;
}

export function projectPaths(root = defaultRoot) {
  const simulatorRoot = resolve(root, 'docs/simulator');
  return {
    root: resolve(root),
    simulatorRoot,
    plan: resolve(simulatorRoot, 'PLAN.md'),
    state: resolve(simulatorRoot, 'project-state.json'),
    routing: resolve(simulatorRoot, 'model-routing.json'),
    status: resolve(simulatorRoot, 'STATUS.md'),
    decisions: resolve(simulatorRoot, 'decisions')
  };
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
}

async function listDecisionDocuments(paths) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(paths.decisions, { withFileTypes: true });
  return Promise.all(entries
    .filter((entry) => entry.isFile() && /^ADR-\d{3}-.+\.md$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => ({ id: entry.name.slice(0, 7), path: resolve(paths.decisions, entry.name), content: await readFile(resolve(paths.decisions, entry.name), 'utf8') })));
}

export async function loadProject(root = defaultRoot) {
  const paths = projectPaths(root);
  const [state, routing, plan, decisions] = await Promise.all([
    readJson(paths.state),
    readJson(paths.routing),
    readFile(paths.plan, 'utf8'),
    listDecisionDocuments(paths)
  ]);
  return { paths, state, routing, plan, decisions };
}

export function isEvidenceStale(evidence, task) {
  if (evidence.isStale === true) return true;
  return asIsoDate(task.scopeUpdatedAt) && asIsoDate(evidence.recordedAt) && Date.parse(evidence.recordedAt) < Date.parse(task.scopeUpdatedAt);
}

function evidenceForCriterion(task, criterion) {
  const evidenceById = new Map(task.evidence.map((evidence) => [evidence.id, evidence]));
  return criterion.evidenceIds.map((id) => evidenceById.get(id)).filter(Boolean);
}

export function criterionIsSatisfied(task, criterion) {
  const evidence = evidenceForCriterion(task, criterion)
    .filter((entry) => !isEvidenceStale(entry, task))
    .sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  return evidence.at(-1)?.result === 'passed';
}

function hasIndependentReview(task) {
  const reviews = task.evidence
    .filter((entry) => entry.kind === 'independent-review' && !isEvidenceStale(entry, task) && isNonEmptyString(entry.reviewer))
    .sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
  return reviews.at(-1)?.result === 'passed';
}

export function projectProgress(state) {
  const criteria = state.tasks.flatMap((task) => task.acceptanceCriteria.map((criterion) => ({ task, criterion })));
  const evidence = state.tasks.flatMap((task) => task.evidence.map((entry) => ({ task, entry })));
  return {
    milestones: { accepted: state.milestones.filter((milestone) => milestone.status === 'accepted').length, total: state.milestones.length },
    tasks: { done: state.tasks.filter((task) => task.status === 'done').length, total: state.tasks.length },
    criteria: { satisfied: criteria.filter(({ task, criterion }) => criterionIsSatisfied(task, criterion)).length, total: criteria.length },
    validations: {
      passed: evidence.filter(({ task, entry }) => entry.result === 'passed' && !isEvidenceStale(entry, task)).length,
      failed: evidence.filter(({ entry }) => entry.result === 'failed').length,
      stale: evidence.filter(({ task, entry }) => isEvidenceStale(entry, task)).length
    }
  };
}

export function renderStatus(state) {
  const progress = projectProgress(state);
  const activeTask = state.tasks.find((task) => task.id === state.currentTaskId);
  const lines = [
    '# État du programme — Simulateur tactique Warforge',
    '',
    `Plan : ${state.planVersion} · Dernière mise à jour : ${state.updatedAt}`,
    '',
    '## Avancement global',
    '',
    `- Jalons acceptés : ${progress.milestones.accepted}/${progress.milestones.total}`,
    `- Tâches terminées : ${progress.tasks.done}/${progress.tasks.total}`,
    `- Critères satisfaits : ${progress.criteria.satisfied}/${progress.criteria.total}`,
    `- Validations : ${progress.validations.passed} réussie(s), ${progress.validations.failed} échouée(s), ${progress.validations.stale} périmée(s)`,
    '',
    '## Jalons',
    '',
    '| ID | Jalon | État | Tâches terminées |',
    '| --- | --- | --- | --- |',
    ...state.milestones.map((milestone) => {
      const tasks = state.tasks.filter((task) => task.milestoneId === milestone.id);
      return `| ${milestone.id} | ${milestone.title} | ${milestone.status} | ${tasks.filter((task) => task.status === 'done').length}/${tasks.length} |`;
    }),
    '',
    '## Reprise',
    ''
  ];

  if (activeTask) {
    lines.push(`- Tâche courante : ${activeTask.id} — ${activeTask.title} (${activeTask.status})`);
    lines.push(`- Profil d'exécution : ${activeTask.executionProfile}`);
  } else {
    lines.push('- Tâche courante : aucune');
  }
  lines.push(`- Dernier travail : ${state.resumeContext.lastCompleted}`);
  lines.push(`- Prochaine action : ${state.resumeContext.nextAction}`);
  lines.push(`- Fichiers concernés : ${state.resumeContext.files.join(', ') || 'aucun'}`);
  lines.push('', '## Blocages et questions', '');
  if (state.blockers.length === 0 && state.openQuestions.length === 0) {
    lines.push('Aucun bloqueur ni question ouverte.');
  } else {
    for (const blocker of state.blockers.filter((entry) => !entry.resolvedAt)) lines.push(`- Bloqueur ${blocker.id} (${blocker.taskId}) : ${blocker.reason}`);
    for (const question of state.openQuestions) lines.push(`- Question ${question.id} : ${question.question}`);
  }
  return `${lines.join('\n')}\n`;
}

export function validateRouting(routing) {
  const errors = [];
  if (!isRecord(routing)) return ['Le routage IA doit être un objet JSON.'];
  if (routing.schemaVersion !== ROUTING_SCHEMA) errors.push(`schemaVersion doit être ${ROUTING_SCHEMA}.`);
  if (!isNonEmptyString(routing.policyVersion)) errors.push('policyVersion est requis.');
  if (!isRecord(routing.profiles) || Object.keys(routing.profiles).length === 0) return [...errors, 'Au moins un profil IA est requis.'];
  for (const [id, profile] of Object.entries(routing.profiles)) {
    if (!isRecord(profile) || !isRecord(profile.preferred) || !isRecord(profile.fallback)) {
      errors.push(`Le profil ${id} doit définir preferred et fallback.`);
      continue;
    }
    for (const [label, selection] of Object.entries({ preferred: profile.preferred, fallback: profile.fallback })) {
      if (!isNonEmptyString(selection.model) || !isNonEmptyString(selection.reasoningEffort)) errors.push(`Le profil ${id}.${label} est incomplet.`);
      else {
        if (!routing.availability?.knownAvailable?.includes(selection.model)) errors.push(`Le profil ${id}.${label} utilise un modèle indisponible ou inconnu.`);
        if (!REASONING_EFFORTS.has(selection.reasoningEffort)) errors.push(`Le profil ${id}.${label} utilise un effort inconnu.`);
      }
    }
  }
  return errors;
}

export function validateProjectState(state, routing, plan, decisions) {
  const errors = [];
  if (!isRecord(state)) return ['L’état du programme doit être un objet JSON.'];
  if (state.schemaVersion !== PROJECT_SCHEMA) errors.push(`schemaVersion doit être ${PROJECT_SCHEMA}.`);
  if (!isNonEmptyString(state.planVersion)) errors.push('planVersion est requis.');
  if (!asIsoDate(state.updatedAt)) errors.push('updatedAt doit être une date ISO.');
  if (!Array.isArray(state.milestones) || state.milestones.length === 0) return [...errors, 'Au moins un jalon est requis.'];
  if (!Array.isArray(state.tasks) || state.tasks.length === 0) return [...errors, 'Au moins une tâche est requise.'];

  const milestoneIds = new Set();
  const milestoneById = new Map();
  for (const milestone of state.milestones) {
    if (!isRecord(milestone) || !isNonEmptyString(milestone.id)) {
      errors.push('Un jalon a un identifiant invalide.');
      continue;
    }
    if (milestoneIds.has(milestone.id)) errors.push(`Le jalon ${milestone.id} est dupliqué.`);
    milestoneIds.add(milestone.id);
    milestoneById.set(milestone.id, milestone);
    if (!MILESTONE_STATUSES.has(milestone.status)) errors.push(`Le jalon ${milestone.id} a un état invalide.`);
    if (!Array.isArray(milestone.taskIds) || !Array.isArray(milestone.acceptanceCriteria)) errors.push(`Le jalon ${milestone.id} doit déclarer ses tâches et critères.`);
  }

  const taskIds = new Set();
  const taskById = new Map();
  const evidenceIds = new Set();
  const profileIds = new Set(Object.keys(routing?.profiles ?? {}));
  for (const task of state.tasks) {
    if (!isRecord(task) || !isNonEmptyString(task.id)) {
      errors.push('Une tâche a un identifiant invalide.');
      continue;
    }
    if (taskIds.has(task.id)) errors.push(`La tâche ${task.id} est dupliquée.`);
    taskIds.add(task.id);
    taskById.set(task.id, task);
    if (!milestoneIds.has(task.milestoneId)) errors.push(`${taskPrefix(task)} référence le jalon inconnu ${task.milestoneId}.`);
    if (!TASK_STATUSES.has(task.status)) errors.push(`${taskPrefix(task)} a un état invalide.`);
    if (!Array.isArray(task.dependencies) || !Array.isArray(task.acceptanceCriteria) || !Array.isArray(task.evidence)) errors.push(`${taskPrefix(task)} doit déclarer dépendances, critères et preuves.`);
    if (!profileIds.has(task.executionProfile)) errors.push(`${taskPrefix(task)} utilise le profil IA inconnu ${task.executionProfile}.`);
    if (!asIsoDate(task.updatedAt)) errors.push(`${taskPrefix(task)} doit avoir updatedAt.`);
    if (task.actualExecution !== null) {
      if (!isRecord(task.actualExecution) || !isNonEmptyString(task.actualExecution.model) || !isNonEmptyString(task.actualExecution.reasoningEffort) || !isNonEmptyString(task.actualExecution.context)) errors.push(`${taskPrefix(task)} a une exécution réelle invalide.`);
      else {
        if (!routing.availability.knownAvailable.includes(task.actualExecution.model)) errors.push(`${taskPrefix(task)} enregistre un modèle indisponible ou inconnu.`);
        if (!REASONING_EFFORTS.has(task.actualExecution.reasoningEffort)) errors.push(`${taskPrefix(task)} enregistre un effort de raisonnement inconnu.`);
      }
    }
    if (task.status === 'done' && task.actualExecution === null) errors.push(`${taskPrefix(task)} terminée doit enregistrer son modèle, effort et contexte réels.`);

    const criterionIds = new Set();
    for (const criterion of task.acceptanceCriteria) {
      if (!isRecord(criterion) || !isNonEmptyString(criterion.id) || !isNonEmptyString(criterion.description) || !Array.isArray(criterion.evidenceIds)) {
        errors.push(`${taskPrefix(task)} a un critère invalide.`);
        continue;
      }
      if (criterionIds.has(criterion.id)) errors.push(`${taskPrefix(task)} a le critère dupliqué ${criterion.id}.`);
      criterionIds.add(criterion.id);
    }
    for (const evidence of task.evidence) {
      if (!isRecord(evidence) || !isNonEmptyString(evidence.id) || !['passed', 'failed'].includes(evidence.result) || !isNonEmptyString(evidence.command) || !isNonEmptyString(evidence.scope) || !asIsoDate(evidence.recordedAt)) {
        errors.push(`${taskPrefix(task)} a une preuve invalide.`);
        continue;
      }
      if (evidenceIds.has(evidence.id)) errors.push(`La preuve ${evidence.id} est dupliquée.`);
      evidenceIds.add(evidence.id);
    }
  }

  for (const task of state.tasks) {
    if (!taskById.has(task.id)) continue;
    for (const dependencyId of task.dependencies ?? []) {
      const dependency = taskById.get(dependencyId);
      if (!dependency) errors.push(`${taskPrefix(task)} référence la dépendance inconnue ${dependencyId}.`);
      else if (dependencyId === task.id) errors.push(`${taskPrefix(task)} ne peut pas dépendre d’elle-même.`);
      else if (['ready', 'in_progress', 'done'].includes(task.status) && dependency.status !== 'done') errors.push(`${taskPrefix(task)} est ${task.status} alors que ${dependencyId} n’est pas terminée.`);
    }
    for (const criterion of task.acceptanceCriteria ?? []) {
      for (const evidenceId of criterion.evidenceIds ?? []) {
        if (!task.evidence.some((evidence) => evidence.id === evidenceId)) errors.push(`${taskPrefix(task)} référence la preuve absente ${evidenceId}.`);
      }
    }
    if (task.status === 'done') {
      if (!task.acceptanceCriteria.every((criterion) => criterionIsSatisfied(task, criterion))) errors.push(`${taskPrefix(task)} terminée a des critères sans preuve réussie et actuelle.`);
      if ((task.critical || routing?.profiles?.[task.executionProfile]?.requiresIndependentReview) && !hasIndependentReview(task)) errors.push(`${taskPrefix(task)} critique est terminée sans revue indépendante.`);
    }
  }

  for (const milestone of state.milestones) {
    const declared = new Set(milestone.taskIds ?? []);
    const actual = new Set(state.tasks.filter((task) => task.milestoneId === milestone.id).map((task) => task.id));
    if (!sameStringSet(declared, actual)) errors.push(`Le jalon ${milestone.id} ne correspond pas exactement à ses tâches.`);
    if (milestone.status === 'accepted') {
      if (![...actual].every((id) => taskById.get(id)?.status === 'done')) errors.push(`Le jalon ${milestone.id} est accepté alors que des tâches restent incomplètes.`);
      const audit = milestone.acceptanceEvidence;
      if (!isRecord(audit) || audit.kind !== 'independent-review' || audit.result !== 'passed' || !isNonEmptyString(audit.reviewer) || !isNonEmptyString(audit.command) || !isNonEmptyString(audit.scope) || !asIsoDate(audit.recordedAt)) {
        errors.push(`Le jalon ${milestone.id} accepté doit posséder une preuve d'audit indépendant réussie.`);
      }
    }
  }

  const inProgress = state.tasks.filter((task) => task.status === 'in_progress');
  if (inProgress.length > 1) errors.push('Une seule tâche peut être in_progress.');
  const currentTask = taskById.get(state.currentTaskId);
  if (inProgress.length === 1 && currentTask?.id !== inProgress[0].id) errors.push('currentTaskId doit référencer l’unique tâche in_progress.');
  if (inProgress.length === 0 && state.currentTaskId !== null) errors.push('currentTaskId doit être null lorsqu’aucune tâche n’est in_progress.');
  if (currentTask && state.currentMilestoneId !== currentTask.milestoneId) errors.push('currentMilestoneId doit correspondre à la tâche courante.');
  if (!milestoneIds.has(state.currentMilestoneId)) errors.push('currentMilestoneId référence un jalon inconnu.');

  const blockedTask = state.tasks.find((task) => task.status === 'blocked');
  if ((inProgress.length === 1 || blockedTask) && (!isRecord(state.resumeContext) || !isNonEmptyString(state.resumeContext.taskId) || !isNonEmptyString(state.resumeContext.nextAction) || !Array.isArray(state.resumeContext.files))) errors.push('resumeContext est requis pour une tâche en cours ou bloquée.');
  if (inProgress.length === 1 && state.resumeContext?.taskId !== inProgress[0].id) errors.push('resumeContext.taskId doit correspondre à la tâche en cours.');
  if (blockedTask && inProgress.length === 0 && state.resumeContext?.taskId !== blockedTask.id) errors.push('resumeContext.taskId doit correspondre à la tâche bloquée.');
  if (!Array.isArray(state.blockers) || !Array.isArray(state.openQuestions)) errors.push('blockers et openQuestions doivent être des listes.');
  for (const blocker of state.blockers ?? []) {
    if (!isRecord(blocker) || !isNonEmptyString(blocker.id) || !taskById.has(blocker.taskId) || !isNonEmptyString(blocker.reason) || !asIsoDate(blocker.recordedAt)) errors.push('Un bloqueur est invalide.');
  }
  for (const task of state.tasks) {
    const openBlockers = (state.blockers ?? []).filter((blocker) => blocker.taskId === task.id && !blocker.resolvedAt);
    if (task.status === 'blocked' && openBlockers.length !== 1) errors.push(`${taskPrefix(task)} bloquée doit avoir exactement un bloqueur ouvert.`);
    if (task.status !== 'blocked' && openBlockers.length > 0) errors.push(`${taskPrefix(task)} a un bloqueur ouvert sans être à l'état blocked.`);
  }

  const planVersionMatch = /^`planVersion:\s*([^`]+)`/m.exec(plan ?? '');
  if (!planVersionMatch || planVersionMatch[1].trim() !== state.planVersion) errors.push('PLAN.md et project-state.json n’ont pas le même planVersion.');
  if (!isRecord(state.planChange) || state.planChange.version !== state.planVersion || !isNonEmptyString(state.planChange.adrId)) errors.push('planChange doit référencer l’ADR de la version active.');
  const planAdr = decisions?.find((decision) => decision.id === state.planChange?.adrId);
  if (!planAdr || !new RegExp(`Plan version\\s*:\\s*${escapeRegExp(state.planVersion)}`).test(planAdr.content)) errors.push('La version active du plan doit être documentée dans son ADR.');
  return errors;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function assertProjectIsValid(project) {
  const errors = [...validateRouting(project.routing), ...validateProjectState(project.state, project.routing, project.plan, project.decisions)];
  if (errors.length) throw new Error(`Tracker invalide :\n- ${errors.join('\n- ')}`);
}

function nowIso(now) {
  return now instanceof Date ? now.toISOString() : now;
}

function getTask(state, taskId) {
  const task = state.tasks.find((entry) => entry.id === taskId);
  if (!task) throw new Error(`Tâche inconnue : ${taskId}`);
  return task;
}

function dependenciesAreDone(state, task) {
  return task.dependencies.every((id) => getTask(state, id).status === 'done');
}

function nextBlockerId(state) {
  return `BLK-${String(state.blockers.length + 1).padStart(3, '0')}`;
}

function nextEvidenceId(task) {
  return `EVD-${task.id.replace('SIM-', '')}-${String(task.evidence.length + 1).padStart(3, '0')}`;
}

function reopenAcceptedMilestone(state, milestoneId, reason, now) {
  const milestone = state.milestones.find((entry) => entry.id === milestoneId);
  if (milestone?.status !== 'accepted') return;
  milestone.status = 'in_progress';
  milestone.reopenedAt = nowIso(now);
  milestone.reopenReason = reason;
  delete milestone.acceptedAt;
  delete milestone.acceptanceEvidence;
}

function transitiveDependants(state, taskId) {
  const result = new Set();
  const queue = [taskId];
  while (queue.length > 0) {
    const dependencyId = queue.shift();
    for (const task of state.tasks.filter((entry) => entry.dependencies.includes(dependencyId))) {
      if (result.has(task.id)) continue;
      result.add(task.id);
      queue.push(task.id);
    }
  }
  return [...result];
}

export function transitionTask(state, taskId, targetStatus, { now = new Date(), note, requiresIndependentReview } = {}) {
  const task = getTask(state, taskId);
  const reviewRequired = requiresIndependentReview ?? task.critical;
  if (targetStatus === 'blocked') throw new Error('Utilisez la commande block pour déclarer un bloqueur.');
  if (!TASK_STATUSES.has(targetStatus) || !taskTransitions[task.status].has(targetStatus)) throw new Error(`Transition interdite : ${task.status} → ${targetStatus}.`);
  if (['ready', 'in_progress', 'done'].includes(targetStatus) && !dependenciesAreDone(state, task)) throw new Error(`${task.id} ne peut pas passer à ${targetStatus} tant que ses dépendances ne sont pas done.`);
  if (targetStatus === 'in_progress' && state.tasks.some((entry) => entry.status === 'in_progress')) throw new Error('Une autre tâche est déjà in_progress.');
  if (targetStatus === 'done') {
    if (!task.acceptanceCriteria.every((criterion) => criterionIsSatisfied(task, criterion))) throw new Error(`${task.id} ne peut pas être terminée : des critères n’ont pas de preuve réussie et actuelle.`);
    if (reviewRequired && !hasIndependentReview(task)) throw new Error(`${task.id} ne peut pas être terminée sans revue indépendante.`);
    if (task.actualExecution === null) throw new Error(`${task.id} ne peut pas être terminée sans exécution réelle enregistrée.`);
  }
  if (task.status === 'done' && targetStatus === 'ready') reopenAcceptedMilestone(state, task.milestoneId, note ?? `Réouverture de ${task.id}.`, now);
  task.status = targetStatus;
  task.updatedAt = nowIso(now);
  state.updatedAt = nowIso(now);
  if (targetStatus === 'in_progress') {
    state.currentTaskId = task.id;
    state.currentMilestoneId = task.milestoneId;
    const milestone = state.milestones.find((entry) => entry.id === task.milestoneId);
    if (milestone.status === 'planned') milestone.status = 'in_progress';
    state.resumeContext = {
      taskId: task.id,
      lastCompleted: note ?? state.resumeContext?.lastCompleted ?? 'Aucune tâche terminée.',
      nextAction: `Poursuivre ${task.id} : ${task.title}.`,
      files: state.resumeContext?.files ?? [],
      updatedAt: nowIso(now)
    };
  }
  if (['ready', 'done'].includes(targetStatus) && state.currentTaskId === task.id) {
    state.currentTaskId = null;
    state.resumeContext = { taskId: null, lastCompleted: targetStatus === 'done' ? `${task.id} terminée.` : (note ?? `Mise en attente de ${task.id}.`), nextAction: note ?? 'Sélectionner la prochaine tâche ready.', files: [], updatedAt: nowIso(now) };
  }
  return state;
}

export function addEvidence(state, taskId, { command, result, scope, criteria = [], commit, notes, kind = 'validation', independentReview = false, reviewer, now = new Date() }) {
  const task = getTask(state, taskId);
  if (!isNonEmptyString(command) || !['passed', 'failed'].includes(result) || !isNonEmptyString(scope)) throw new Error('Une preuve requiert command, result (passed/failed) et scope.');
  const validCriteria = new Set(task.acceptanceCriteria.map((criterion) => criterion.id));
  for (const criterionId of criteria) if (!validCriteria.has(criterionId)) throw new Error(`Critère inconnu pour ${taskId} : ${criterionId}`);
  const evidence = { id: nextEvidenceId(task), kind: independentReview ? 'independent-review' : kind, command, result, scope, recordedAt: nowIso(now) };
  if (commit) evidence.commit = commit;
  if (notes) evidence.notes = notes;
  if (independentReview) {
    if (!isNonEmptyString(reviewer)) throw new Error('Une revue indépendante requiert l’identité du reviewer.');
    evidence.reviewer = reviewer;
  }
  task.evidence.push(evidence);
  for (const criterion of task.acceptanceCriteria) if (criteria.includes(criterion.id)) criterion.evidenceIds.push(evidence.id);
  state.updatedAt = nowIso(now);
  return evidence;
}

export function recordExecution(state, taskId, { model, reasoningEffort, context, now = new Date() }) {
  const task = getTask(state, taskId);
  if (!isNonEmptyString(model) || !isNonEmptyString(reasoningEffort) || !isNonEmptyString(context)) throw new Error('Une exécution requiert model, reasoningEffort et context.');
  if (!REASONING_EFFORTS.has(reasoningEffort)) throw new Error(`Effort de raisonnement inconnu : ${reasoningEffort}`);
  task.actualExecution = { model, reasoningEffort, context, recordedAt: nowIso(now) };
  task.updatedAt = nowIso(now);
  state.updatedAt = nowIso(now);
  return task.actualExecution;
}

export function markTaskScopeUpdated(state, taskId, { files = [], note, now = new Date() } = {}) {
  const task = getTask(state, taskId);
  if (!Array.isArray(files) || files.some((file) => !isNonEmptyString(file))) throw new Error('Les fichiers du périmètre doivent être une liste de chemins non vides.');
  reopenAcceptedMilestone(state, task.milestoneId, note ?? `Périmètre de ${task.id} modifié.`, now);
  if (task.status === 'done') task.status = 'ready';
  for (const dependantId of transitiveDependants(state, task.id)) {
    const dependant = getTask(state, dependantId);
    if (dependant.status === 'done') {
      reopenAcceptedMilestone(state, dependant.milestoneId, `Dépendance ${task.id} modifiée.`, now);
      dependant.status = 'planned';
      dependant.scopeUpdatedAt = nowIso(now);
      dependant.updatedAt = nowIso(now);
    }
  }
  task.scopeUpdatedAt = nowIso(now);
  task.updatedAt = nowIso(now);
  state.updatedAt = nowIso(now);
  state.resumeContext = {
    taskId: task.status === 'in_progress' || task.status === 'blocked' ? task.id : state.resumeContext?.taskId ?? null,
    lastCompleted: note ?? `Périmètre de ${task.id} modifié ; ses preuves antérieures sont périmées.`,
    nextAction: `Revalider ${task.id} avant toute clôture.`,
    files,
    updatedAt: nowIso(now)
  };
  return task;
}

export function acceptMilestone(state, milestoneId, { command, scope, reviewer, notes, now = new Date() }) {
  const milestone = state.milestones.find((entry) => entry.id === milestoneId);
  if (!milestone) throw new Error(`Jalon inconnu : ${milestoneId}`);
  if (milestone.status !== 'in_progress') throw new Error(`${milestoneId} doit être in_progress avant acceptation.`);
  const tasks = state.tasks.filter((task) => task.milestoneId === milestoneId);
  if (tasks.length === 0 || tasks.some((task) => task.status !== 'done')) throw new Error(`${milestoneId} ne peut pas être accepté tant que toutes ses tâches ne sont pas done.`);
  if (!isNonEmptyString(command) || !isNonEmptyString(scope) || !isNonEmptyString(reviewer)) throw new Error('L’acceptation requiert une commande d’audit, un périmètre et l’identité du reviewer.');
  milestone.status = 'accepted';
  milestone.acceptedAt = nowIso(now);
  milestone.acceptanceEvidence = {
    kind: 'independent-review',
    command,
    result: 'passed',
    scope,
    reviewer,
    recordedAt: nowIso(now),
    ...(isNonEmptyString(notes) ? { notes } : {})
  };
  state.updatedAt = nowIso(now);
  return milestone;
}

export function blockTask(state, taskId, reason, { now = new Date() } = {}) {
  const task = getTask(state, taskId);
  if (!['ready', 'in_progress'].includes(task.status)) throw new Error(`${task.id} doit être ready ou in_progress pour être bloquée.`);
  if (!isNonEmptyString(reason)) throw new Error('Un bloqueur requiert une raison.');
  task.status = 'blocked';
  task.updatedAt = nowIso(now);
  const blocker = { id: nextBlockerId(state), taskId, reason, recordedAt: nowIso(now) };
  state.blockers.push(blocker);
  state.currentTaskId = null;
  state.currentMilestoneId = task.milestoneId;
  state.resumeContext = { taskId, lastCompleted: `Travail interrompu sur ${task.id}.`, nextAction: `Lever ${blocker.id} puis remettre ${task.id} à l'état ready.`, files: state.resumeContext?.files ?? [], updatedAt: nowIso(now) };
  state.updatedAt = nowIso(now);
  return blocker;
}

export function unblockTask(state, taskId, { now = new Date(), note } = {}) {
  const task = getTask(state, taskId);
  if (task.status !== 'blocked') throw new Error(`${task.id} n’est pas bloquée.`);
  const blocker = [...state.blockers].reverse().find((entry) => entry.taskId === taskId && !entry.resolvedAt);
  if (!blocker) throw new Error(`${task.id} n’a pas de bloqueur ouvert.`);
  task.status = 'ready';
  task.updatedAt = nowIso(now);
  blocker.resolvedAt = nowIso(now);
  blocker.resolution = note ?? 'Levée par le coordinateur.';
  state.currentTaskId = null;
  state.resumeContext = { taskId: null, lastCompleted: `${blocker.id} levé.`, nextAction: note ?? `Reprendre ${task.id} lorsqu'elle est prioritaire.`, files: state.resumeContext?.files ?? [], updatedAt: nowIso(now) };
  state.updatedAt = nowIso(now);
  return state;
}

export async function writeProject(root, state) {
  const paths = projectPaths(root);
  await mkdir(paths.simulatorRoot, { recursive: true });
  await writeFile(paths.state, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await writeFile(paths.status, renderStatus(state), 'utf8');
}

export async function checkProject(root = defaultRoot) {
  const project = await loadProject(root);
  assertProjectIsValid(project);
  const generated = renderStatus(project.state);
  let existing;
  try {
    existing = await readFile(project.paths.status, 'utf8');
  } catch {
    throw new Error(`STATUS.md est introuvable ; exécutez ${relative(project.paths.root, resolve(import.meta.dirname, 'simulator-project.mjs'))} render.`);
  }
  if (existing !== generated) throw new Error('STATUS.md est désynchronisé ; exécutez la commande render.');
  return project;
}

function readOption(args, name, { required = false, fallback } = {}) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : fallback;
  if (required && !isNonEmptyString(value)) throw new Error(`--${name} est requis.`);
  return value;
}

function readRepeatOption(args, name) {
  return args.flatMap((value, index) => value === `--${name}` && isNonEmptyString(args[index + 1]) ? [args[index + 1]] : []);
}

function cliRoot(args) {
  return readOption(args, 'root', { fallback: defaultRoot });
}

function usage() {
  return `Usage:\n  node scripts/simulator-project.mjs check [--root <path>]\n  node scripts/simulator-project.mjs render [--root <path>]\n  node scripts/simulator-project.mjs transition <taskId> <ready|in_progress|done|deferred> [--note <text>]\n  node scripts/simulator-project.mjs evidence <taskId> --command <cmd> --result <passed|failed> --scope <scope> [--criteria <id>]... [--commit <sha>] [--notes <text>] [--independent-review --reviewer <identity>]\n  node scripts/simulator-project.mjs execution <taskId> --model <id> --effort <level> --context <text>\n  node scripts/simulator-project.mjs scope <taskId> [--file <path>]... [--note <text>]\n  node scripts/simulator-project.mjs milestone <milestoneId> accept --command <audit> --scope <scope> --reviewer <identity> [--notes <text>]\n  node scripts/simulator-project.mjs block <taskId> --reason <text>\n  node scripts/simulator-project.mjs unblock <taskId> [--note <text>]`;
}

async function runCli() {
  const [, , command = 'check', ...args] = process.argv;
  const root = cliRoot(args);
  if (['help', '--help', '-h'].includes(command)) {
    console.log(usage());
    return;
  }
  if (command === 'check') {
    const project = await checkProject(root);
    console.log(`Tracker valide : ${project.state.currentMilestoneId}, tâche ${project.state.currentTaskId ?? 'aucune'}.`);
    return;
  }
  if (command === 'render' || command === 'status') {
    const project = await loadProject(root);
    assertProjectIsValid(project);
    if (command === 'render') await writeFile(project.paths.status, renderStatus(project.state), 'utf8');
    console.log(renderStatus(project.state));
    return;
  }
  if (command === 'milestone') {
    const milestoneId = args.find((entry) => !entry.startsWith('--'));
    const milestoneIndex = args.indexOf(milestoneId);
    if (!milestoneId || args[milestoneIndex + 1] !== 'accept') throw new Error('Utilisez milestone <milestoneId> accept.');
    const project = await loadProject(root);
    assertProjectIsValid(project);
    acceptMilestone(project.state, milestoneId, {
      command: readOption(args, 'command', { required: true }),
      scope: readOption(args, 'scope', { required: true }),
      reviewer: readOption(args, 'reviewer', { required: true }),
      notes: readOption(args, 'notes')
    });
    assertProjectIsValid({ ...project, state: project.state });
    await writeProject(root, project.state);
    console.log(`Jalon ${milestoneId} accepté.`);
    return;
  }
  const taskId = args.find((entry) => !entry.startsWith('--'));
  if (!taskId) throw new Error('taskId est requis.');
  const project = await loadProject(root);
  assertProjectIsValid(project);
  if (command === 'transition') {
    const taskIndex = args.indexOf(taskId);
    const targetStatus = args[taskIndex + 1];
    const task = getTask(project.state, taskId);
    transitionTask(project.state, taskId, targetStatus, {
      note: readOption(args, 'note'),
      requiresIndependentReview: task.critical || project.routing.profiles[task.executionProfile]?.requiresIndependentReview === true
    });
  } else if (command === 'evidence') {
    addEvidence(project.state, taskId, {
      command: readOption(args, 'command', { required: true }),
      result: readOption(args, 'result', { required: true }),
      scope: readOption(args, 'scope', { required: true }),
      criteria: readRepeatOption(args, 'criteria'),
      commit: readOption(args, 'commit'),
      notes: readOption(args, 'notes'),
      independentReview: args.includes('--independent-review'),
      reviewer: readOption(args, 'reviewer')
    });
  } else if (command === 'execution') {
    recordExecution(project.state, taskId, {
      model: readOption(args, 'model', { required: true }),
      reasoningEffort: readOption(args, 'effort', { required: true }),
      context: readOption(args, 'context', { required: true })
    });
  } else if (command === 'scope') {
    markTaskScopeUpdated(project.state, taskId, {
      files: readRepeatOption(args, 'file'),
      note: readOption(args, 'note')
    });
  } else if (command === 'block') {
    blockTask(project.state, taskId, readOption(args, 'reason', { required: true }));
  } else if (command === 'unblock') {
    unblockTask(project.state, taskId, { note: readOption(args, 'note') });
  } else {
    throw new Error(`Commande inconnue : ${command}\n\n${usage()}`);
  }
  const reloaded = { ...project, state: project.state };
  assertProjectIsValid(reloaded);
  await writeProject(root, project.state);
  console.log(`${command} appliquée à ${taskId}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
